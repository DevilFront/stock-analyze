import { getDb } from "@/db"
import { aiUsageEvents, aiUsageMonthly } from "@/db/schema"
import { eq } from "drizzle-orm"

export type BudgetContext = {
  feature: string
  model: string
  meta?: Record<string, any>
}

function monthKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export async function ensureMonthlyBudget() {
  const db = getDb()
  const month = monthKey()
  const limitKrw = envInt("AI_BUDGET_KRW_MONTHLY", 30000)

  await db
    .insert(aiUsageMonthly)
    .values({ month, limitKrw })
    .onConflictDoUpdate({
      target: aiUsageMonthly.month,
      set: { limitKrw, updatedAt: new Date() },
    })

  return { month, limitKrw }
}

export async function getMonthlySpend() {
  const db = getDb()
  const month = monthKey()
  const row = await db.query.aiUsageMonthly.findFirst({ where: eq(aiUsageMonthly.month, month) })
  return {
    month,
    limitKrw: row?.limitKrw ?? envInt("AI_BUDGET_KRW_MONTHLY", 30000),
    spentKrw: row?.spentKrw ?? 0,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
  }
}

/**
 * 비용은 "모델별 1M 토큰당 KRW 단가"를 환경변수로 받는다.
 * - AI_COST_INPUT_KRW_PER_1M (기본 0)
 * - AI_COST_OUTPUT_KRW_PER_1M (기본 0)
 *
 * 단가를 0으로 두면 "토큰 로깅만" 되고 비용 캡은 토큰 기반으로 동작하지 않는다.
 */
export function estimateCostKrw(inputTokens: number, outputTokens: number): number {
  const inRate = envInt("AI_COST_INPUT_KRW_PER_1M", 0)
  const outRate = envInt("AI_COST_OUTPUT_KRW_PER_1M", 0)
  const cost =
    (inputTokens / 1_000_000) * inRate +
    (outputTokens / 1_000_000) * outRate
  return Math.max(0, Math.round(cost))
}

export async function assertBudgetAvailable(nextEstimatedCostKrw: number) {
  await ensureMonthlyBudget()
  const spend = await getMonthlySpend()
  const inRate = envInt("AI_COST_INPUT_KRW_PER_1M", 0)
  const outRate = envInt("AI_COST_OUTPUT_KRW_PER_1M", 0)

  // 단가 미설정이면 토큰 캡으로 대체 (기본 5,000,000 토큰/월)
  const tokenCap = envInt("AI_TOKEN_BUDGET_MONTHLY", 5_000_000)
  if (inRate === 0 && outRate === 0) {
    const used = (spend.inputTokens ?? 0) + (spend.outputTokens ?? 0)
    if (used >= tokenCap) {
      throw new Error(`AI token cap reached: used=${used} tokenCap=${tokenCap}`)
    }
    return
  }

  if (spend.spentKrw + nextEstimatedCostKrw > spend.limitKrw) {
    throw new Error(
      `AI budget cap reached: spent=${spend.spentKrw}KRW limit=${spend.limitKrw}KRW (need ~${nextEstimatedCostKrw}KRW)`,
    )
  }
}

export async function recordUsage(
  ctx: BudgetContext,
  usage: { inputTokens: number; outputTokens: number },
) {
  const db = getDb()
  const { month } = await ensureMonthlyBudget()
  const costKrw = estimateCostKrw(usage.inputTokens, usage.outputTokens)

  // neon-http driver는 transaction을 지원하지 않음.
  // 이벤트 기록 후 월 집계는 "best-effort"로 업데이트한다. (테스트 단계 OK)
  await db.insert(aiUsageEvents).values({
    month,
    feature: ctx.feature,
    model: ctx.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costKrw,
    meta: ctx.meta ?? {},
  })

  const current = await db.query.aiUsageMonthly.findFirst({
    where: eq(aiUsageMonthly.month, month),
  })
  const spent = (current?.spentKrw ?? 0) + costKrw
  const inTok = (current?.inputTokens ?? 0) + usage.inputTokens
  const outTok = (current?.outputTokens ?? 0) + usage.outputTokens

  await db
    .update(aiUsageMonthly)
    .set({ spentKrw: spent, inputTokens: inTok, outputTokens: outTok, updatedAt: new Date() })
    .where(eq(aiUsageMonthly.month, month))

  return { month, costKrw }
}

