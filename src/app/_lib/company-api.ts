export type CompanyProfile = {
  symbol: string
  name: string
  sector: string
  marketCap: number
  currency: string
}

export type QuarterlyMetric = {
  period: string
  revenue: number
  operatingIncome: number
  netIncome: number
  eps: number
}

export type YearlyMetric = {
  year: string
  revenue: number
  operatingIncome: number
  netIncome: number
  roe: number
}

export type DisclosureItem = {
  id: string
  title: string
  date: string
  source: string
  url: string
  summary: string
  // 선택: 공시 유형/카테고리 (예: 실적, 배당, 증자, 투자 등)
  category?: string
  // 선택: EPS에 대한 정성적 영향 점수 (1~10)
  epsImpactScore?: number
  // 선택: 공시의 톤 (호재/악재/중립)
  sentiment?: "positive" | "negative" | "neutral"
}

export type NewsItem = {
  id: string
  title: string
  date: string
  source: string
  url: string
  summary: string
  // 선택: 뉴스 감성 점수 (-1.0 ~ 1.0)
  sentimentScore?: number
  // 선택: 주제 태그 (예: AI, 메모리, 배당, 규제 등)
  topicTags?: string[]
}

export type CompanyRawResponse = {
  profile: CompanyProfile
  quarterly: QuarterlyMetric[]
  yearly: YearlyMetric[]
  disclosures: DisclosureItem[]
  news: NewsItem[]
}

export type CompanyReportRequest = {
  symbol: string
}

export type CompanyReportResponse = {
  markdown: string
}

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

export async function fetchCompanyRaw(
  symbol: string,
): Promise<CompanyRawResponse> {
  const params = new URLSearchParams({ symbol })
  const url = `${BASE_URL}/api/company/raw?${params.toString()}`
  const res = await fetch(url, {
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`기업 데이터 조회 실패 (HTTP ${res.status})`)
  }

  return res.json()
}

export async function fetchCompanyReport(
  symbol: string,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol } satisfies CompanyReportRequest),
  })

  if (!res.ok || !res.body) {
    throw new Error("AI 리포트 생성 요청에 실패했습니다.")
  }

  return res.body
}

