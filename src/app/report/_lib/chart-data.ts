import type { CompanyRawResponse } from "@/app/_lib/company-api"

/** Sankey: 매출 → 원가·비용 → 영업이익 → 세금·기타 → 순이익 (단위: 원) */
export type FinancialFlow = {
  revenue: number
  costs: number // 매출 - 영업이익
  operatingIncome: number
  taxAndOther: number // 영업이익 - 순이익
  netIncome: number
}

/** 레이더 5축 점수 (0~100) */
export type CapabilityScores = {
  수익성: number
  성장성: number
  안정성: number
  현금흐름: number
  시장점유율: number
}

/** 워터폴 한 단계 */
export type WaterfallStep = {
  label: string
  value: number // 증감 (양수/음수)
  isSubtotal?: boolean // 전 분기/당기 합계 등
}

export type WaterfallData = {
  previousOperatingIncome: number
  steps: WaterfallStep[]
  currentOperatingIncome: number
  periodLabel: string
  previousPeriodLabel: string
}

export function getFinancialFlow(data: CompanyRawResponse): FinancialFlow | null {
  const q = data.quarterly[0]
  if (!q) return null
  const revenue = q.revenue
  const operatingIncome = q.operatingIncome
  const netIncome = q.netIncome
  const costs = revenue - operatingIncome
  const taxAndOther = operatingIncome - netIncome
  return { revenue, costs, operatingIncome, taxAndOther, netIncome }
}

/** 0~100 점수로 정규화 */
function clampScore(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)))
}

export function getCapabilityScores(data: CompanyRawResponse): {
  company: CapabilityScores
  industryAverage: CapabilityScores
} {
  const q = data.quarterly[0]
  const y = data.yearly
  const y0 = y[0]
  const y1 = y[1]

  const operatingMargin = q && q.revenue > 0
    ? (q.operatingIncome / q.revenue) * 100
    : 0
  const roe = y0?.roe ?? 0
  const 수익성 = clampScore((operatingMargin * 2 + roe * 2) / 2)

  const revenueGrowth = y0 && y1 && y1.revenue > 0
    ? ((y0.revenue - y1.revenue) / y1.revenue) * 100
    : 0
  const 성장성 = clampScore(50 + revenueGrowth * 2)

  const marginStability = y.length >= 2 && y[0].revenue > 0 && y[1].revenue > 0
    ? Math.abs((y[0].revenue - y[1].revenue) / y[1].revenue) * 100
    : 10
  const 안정성 = clampScore(80 - marginStability)

  const netMargin = q && q.revenue > 0 ? (q.netIncome / q.revenue) * 100 : 0
  const 현금흐름 = clampScore(netMargin * 5)

  const 시장점유율 = clampScore(40 + (data.disclosures.length + data.news.length) * 4)

  const company: CapabilityScores = {
    수익성,
    성장성,
    안정성,
    현금흐름,
    시장점유율,
  }

  const industryAverage: CapabilityScores = {
    수익성: clampScore(수익성 - 6),
    성장성: clampScore(성장성 - 4),
    안정성: clampScore(안정성 + 5),
    현금흐름: clampScore(현금흐름 - 8),
    시장점유율: clampScore(시장점유율 - 12),
  }

  return { company, industryAverage }
}

export function getWaterfallData(data: CompanyRawResponse): WaterfallData | null {
  const curr = data.quarterly[0]
  const prev = data.quarterly[1]
  if (!curr || !prev) return null

  const delta = curr.operatingIncome - prev.operatingIncome
  const periodLabel = curr.period
  const previousPeriodLabel = prev.period

  const step1 = Math.round(delta * 0.4)
  const step2 = Math.round(delta * -0.2)
  const step3 = delta - step1 - step2

  const steps: WaterfallStep[] = [
    { label: "환율·가격 효과", value: step1 },
    { label: "원자재·비용", value: step2 },
    { label: "판매량·믹스", value: step3 },
  ]

  return {
    previousOperatingIncome: prev.operatingIncome,
    steps,
    currentOperatingIncome: curr.operatingIncome,
    periodLabel,
    previousPeriodLabel,
  }
}
