import OpenAI from "openai"
import { getDb } from "@/db"
import { announcements } from "@/db/schema"
import { and, eq, isNull, or } from "drizzle-orm"

type Args = {
  symbol: string
  limit: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (k: string) => {
    const idx = argv.indexOf(`--${k}`)
    return idx >= 0 ? argv[idx + 1] : undefined
  }
  return {
    symbol: get("symbol") ?? "005930",
    limit: Number(get("limit") ?? "30"),
  }
}

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

const client = new OpenAI({ apiKey: requiredEnv("OPENAI_API_KEY") })

async function summarizeOne(input: {
  title: string
  category?: string | null
}): Promise<{
  summary: string
  sentiment: "positive" | "negative" | "neutral"
  epsImpactScore: number
  category?: string
}> {
  const prompt = `
너는 한국 상장기업 공시를 읽는 애널리스트다.
아래 공시 제목만 보고도 "투자 판단을 돕는 요약"을 1~2문장으로 써라.
투자 권유(매수/매도/추천)는 금지.

출력은 반드시 JSON만:
{
  "summary": "string (max 160 chars)",
  "sentiment": "positive|negative|neutral",
  "epsImpactScore": number (1~10),
  "category": "실적|배당|증자/자금조달|주주환원|M&A/구조|수주/계약|지배구조|기타"
}

[공시 제목]
${input.title}

[현재 분류(참고)]
${input.category ?? "없음"}
`.trim()

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  })

  const content = res.choices[0]?.message?.content ?? "{}"
  const json = JSON.parse(content)

  const summary = String(json.summary ?? "").slice(0, 180)
  const sentiment = (json.sentiment ?? "neutral") as any
  const epsImpactScore = Math.max(1, Math.min(10, Number(json.epsImpactScore ?? 3)))
  const category = typeof json.category === "string" ? json.category : undefined

  return {
    summary: summary || input.title,
    sentiment: ["positive", "negative", "neutral"].includes(sentiment) ? sentiment : "neutral",
    epsImpactScore,
    category,
  }
}

async function main() {
  const { symbol, limit } = parseArgs()
  const db = getDb()

  const rows = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.symbol, symbol),
        or(isNull(announcements.summary), eq(announcements.summary, "")),
      ),
    )
    .limit(limit)

  let updated = 0
  for (const row of rows) {
    const s = await summarizeOne({ title: row.title, category: row.category })
    await db
      .update(announcements)
      .set({
        summary: s.summary,
        sentiment: s.sentiment,
        epsImpactScore: s.epsImpactScore,
        category: s.category ?? row.category,
      })
      .where(eq(announcements.id, row.id))
    updated++
  }

  console.log(JSON.stringify({ ok: true, symbol, processed: rows.length, updated }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

