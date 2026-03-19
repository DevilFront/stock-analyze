import type { CompanyRawResponse } from "@/app/_lib/company-api"
import { getDb } from "@/db"
import {
  announcements,
  companies,
  financialQuarterly,
  financialYearly,
  newsItems,
} from "@/db/schema"
import { desc, eq } from "drizzle-orm"

const MOCK_DATA: Record<string, CompanyRawResponse> = {
  "005930": {
    profile: {
      symbol: "005930",
      name: "삼성전자",
      sector: "반도체 및 전자",
      marketCap: 500_000_000_000_000,
      currency: "KRW",
    },
    quarterly: [
      {
        period: "2024 Q4",
        revenue: 78_000_000_000_000,
        operatingIncome: 6_500_000_000_000,
        netIncome: 5_200_000_000_000,
        eps: 760,
      },
      {
        period: "2024 Q3",
        revenue: 75_000_000_000_000,
        operatingIncome: 5_800_000_000_000,
        netIncome: 4_700_000_000_000,
        eps: 690,
      },
      {
        period: "2024 Q2",
        revenue: 72_000_000_000_000,
        operatingIncome: 5_100_000_000_000,
        netIncome: 4_300_000_000_000,
        eps: 620,
      },
      {
        period: "2024 Q1",
        revenue: 70_000_000_000_000,
        operatingIncome: 4_800_000_000_000,
        netIncome: 4_000_000_000_000,
        eps: 580,
      },
    ],
    yearly: [
      {
        year: "2024",
        revenue: 295_000_000_000_000,
        operatingIncome: 22_200_000_000_000,
        netIncome: 17_600_000_000_000,
        roe: 12.3,
      },
      {
        year: "2023",
        revenue: 270_000_000_000_000,
        operatingIncome: 16_000_000_000_000,
        netIncome: 13_000_000_000_000,
        roe: 9.4,
      },
      {
        year: "2022",
        revenue: 260_000_000_000_000,
        operatingIncome: 14_000_000_000_000,
        netIncome: 12_000_000_000_000,
        roe: 8.7,
      },
    ],
    disclosures: [
      {
        id: "d1",
        title: "2024년 4분기 잠정실적 공시",
        date: "2025-01-10",
        source: "전자공시",
        url: "https://example.com/disclosure/005930/q4-2024",
        summary:
          "매출과 영업이익이 전년 동기 대비 모두 두 자릿수 성장. 메모리 업황 개선 및 고부가 제품 믹스 효과가 반영됨.",
        category: "실적",
        epsImpactScore: 8,
        sentiment: "positive",
      },
      {
        id: "d2",
        title: "배당 결정 공시",
        date: "2025-02-05",
        source: "전자공시",
        url: "https://example.com/disclosure/005930/dividend-2024",
        summary:
          "연간 배당 정책 유지, 주당 배당금 소폭 상향. 중장기 주주환원 정책 재확인.",
        category: "배당",
        epsImpactScore: 5,
        sentiment: "positive",
      },
    ],
    news: [
      {
        id: "n1",
        title: "삼성전자, AI 서버용 HBM 생산 확대",
        date: "2025-02-20",
        source: "뉴스",
        url: "https://example.com/news/005930/ai-hbm",
        summary:
          "글로벌 클라우드 업체들의 AI 투자 확대에 대응해 HBM 생산능력 증설 계획 발표. 중장기 메모리 업황 개선 기대.",
        sentimentScore: 0.8,
        topicTags: ["AI", "메모리", "CAPEX", "데이터센터"],
      },
      {
        id: "n2",
        title: "스마트폰 사업, 프리미엄 라인업 판매 호조",
        date: "2025-02-02",
        source: "뉴스",
        url: "https://example.com/news/005930/mobile-premium",
        summary:
          "폴더블과 플래그십 모델 중심의 믹스 개선으로 스마트폰 수익성이 개선되었다는 분석.",
        sentimentScore: 0.6,
        topicTags: ["스마트폰", "프리미엄", "수익성"],
      },
    ],
  },
}

export async function getCompanyRaw(
  symbol: string,
): Promise<CompanyRawResponse> {
  const key = (symbol || "").trim() || "005930"
  const dbData = await getCompanyRawFromDb(key)
  if (dbData) return dbData
  const data = MOCK_DATA[key]

  if (!data) {
    throw new Error("해당 종목의 목업 데이터가 없습니다.")
  }

  return data
}

async function getCompanyRawFromDb(symbol: string): Promise<CompanyRawResponse | null> {
  try {
    const db = getDb()
    const c = await db.query.companies.findFirst({
      where: eq(companies.symbol, symbol),
    })
    if (!c) return null

    const q = await db
      .select()
      .from(financialQuarterly)
      .where(eq(financialQuarterly.symbol, symbol))
      .orderBy(desc(financialQuarterly.period))
      .limit(8)

    const y = await db
      .select()
      .from(financialYearly)
      .where(eq(financialYearly.symbol, symbol))
      .orderBy(desc(financialYearly.year))
      .limit(5)

    const anns = await db
      .select()
      .from(announcements)
      .where(eq(announcements.symbol, symbol))
      .orderBy(desc(announcements.day), desc(announcements.createdAt))
      .limit(20)

    const news = await db
      .select()
      .from(newsItems)
      .where(eq(newsItems.symbol, symbol))
      .orderBy(desc(newsItems.publishedAt))
      .limit(20)

    return {
      profile: {
        symbol: c.symbol,
        name: c.name,
        sector: c.sector,
        marketCap: Number(c.marketCap ?? 0),
        currency: c.currency ?? "KRW",
      },
      quarterly: q
        .filter((row) => /^\d{4}\sQ[1-4]$/.test(row.period))
        .map((row) => ({
        period: row.period,
        revenue: Number(row.revenue ?? 0),
        operatingIncome: Number(row.operatingIncome ?? 0),
        netIncome: Number(row.netIncome ?? 0),
        eps: Number(row.eps ?? 0),
      })),
      yearly: y
        .filter((row) => /^\d{4}$/.test(row.year))
        .map((row) => ({
        year: row.year,
        revenue: Number(row.revenue ?? 0),
        operatingIncome: Number(row.operatingIncome ?? 0),
        netIncome: Number(row.netIncome ?? 0),
        roe: Number(row.roe ?? 0),
      })),
      disclosures: anns.map((d) => ({
        id: d.id,
        title: d.title,
        date: String(d.day),
        source: d.source ?? "DB",
        url: d.url ?? "",
        summary: d.summary ?? "",
        category: d.category ?? undefined,
        epsImpactScore: d.epsImpactScore ?? undefined,
        sentiment: (d.sentiment as any) ?? undefined,
      })),
      news: news.map((n) => ({
        id: n.id,
        title: n.title,
        date: new Date(n.publishedAt).toISOString().slice(0, 10),
        source: n.source ?? "DB",
        url: n.url ?? "",
        summary: n.summary ?? "",
        sentimentScore: n.sentimentScore ? Number(n.sentimentScore) : undefined,
        topicTags: Array.isArray(n.topicTags) ? (n.topicTags as any) : undefined,
      })),
    }
  } catch {
    // 로컬/도커 DB 미구성 시에도 기존 목업이 동작하도록 조용히 실패 처리
    return null
  }
}

