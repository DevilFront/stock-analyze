import type { CompanyRawResponse } from "@/app/_lib/company-api"
import { ingestGoogleNewsForSymbol } from "@/app/_lib/news-ingest"
import { getDb } from "@/db"
import {
  announcements,
  companies,
  financialQuarterly,
  financialYearly,
  issuePriceMoves,
  dailyStats,
  newsItems,
} from "@/db/schema"
import { desc, eq, sql } from "drizzle-orm"
import { load } from "cheerio"

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
    issueMoves: [
      {
        id: "m1",
        eventSource: "DART",
        eventId: "d1",
        eventTitle: "2024년 4분기 잠정실적 공시",
        eventDay: "2025-01-10",
        thresholdPct: 5,
        lookaheadDays: 5,
        moveType: "SURGE",
        moveDay: "2025-01-14",
        movePct: 5.8,
        maxUpPct: 7.1,
        maxDownPct: -1.3,
      },
      {
        id: "m2",
        eventSource: "NEWS",
        eventId: "n1",
        eventTitle: "삼성전자, AI 서버용 HBM 생산 확대",
        eventDay: "2025-02-20",
        thresholdPct: 5,
        lookaheadDays: 5,
        moveType: "DROP",
        moveDay: "2025-02-24",
        movePct: -5.2,
        maxUpPct: 1.4,
        maxDownPct: -6.0,
      },
    ],
  },
}

export async function getCompanyRaw(
  symbol: string,
  options?: { allowOnDemandIngest?: boolean },
): Promise<CompanyRawResponse> {
  const key = (symbol || "").trim() || "005930"
  const allowOnDemandIngest = options?.allowOnDemandIngest === true
  const dbData = await getCompanyRawFromDb(key)
  if (dbData) {
    return {
      ...dbData,
      dataQuality: {
        ingestionTriggered: false,
        source: "db",
      },
    }
  }

  if (allowOnDemandIngest) {
    // 온디맨드: DB에 없고, 리포트 생성 시에만 즉시 수집 파이프라인을 시도한다.
    const before = await getDataSnapshot(key)
    await ensureCompanyDataOnDemand(key)
    const after = await getDataSnapshot(key)
    const afterIngest = await getCompanyRawFromDb(key)
    if (afterIngest) {
      return {
        ...afterIngest,
        dataQuality: {
          ingestionTriggered: true,
          source: "on_demand",
          compare: {
            before,
            after,
            added: {
              quarterly: Math.max(0, after.quarterly - before.quarterly),
              yearly: Math.max(0, after.yearly - before.yearly),
              disclosures: Math.max(0, after.disclosures - before.disclosures),
              news: Math.max(0, after.news - before.news),
              issueMoves: Math.max(0, after.issueMoves - before.issueMoves),
            },
          },
        },
      }
    }
  }

  const data = MOCK_DATA[key]
  if (data) {
    return {
      ...data,
      dataQuality: {
        ingestionTriggered: false,
        source: "mock",
      },
    }
  }

  // 마지막 안전망: 리포트 화면이 끊기지 않도록 최소 형태 반환.
  return {
    profile: {
      symbol: key,
      name: key,
      sector: "Unknown",
      marketCap: 0,
      currency: "KRW",
    },
    quarterly: [],
    yearly: [],
    disclosures: [],
    news: [],
    issueMoves: [],
    dataQuality: {
      ingestionTriggered: false,
      source: "fallback",
    },
  }
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

    const moves = await db
      .select()
      .from(issuePriceMoves)
      .where(eq(issuePriceMoves.symbol, symbol))
      .orderBy(desc(issuePriceMoves.eventDay), desc(issuePriceMoves.updatedAt))
      .limit(30)

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
      issueMoves: moves.map((m) => ({
        id: m.id,
        eventSource: m.eventSource,
        eventId: m.eventId,
        eventTitle: m.eventTitle,
        eventDay: String(m.eventDay),
        thresholdPct: Number(m.thresholdPct ?? 5),
        lookaheadDays: Number(m.lookaheadDays ?? 5),
        moveType: m.moveType,
        moveDay: m.moveDay ? String(m.moveDay) : undefined,
        movePct: m.movePct == null ? undefined : Number(m.movePct),
        maxUpPct: m.maxUpPct == null ? undefined : Number(m.maxUpPct),
        maxDownPct: m.maxDownPct == null ? undefined : Number(m.maxDownPct),
      })),
    }
  } catch {
    // 로컬/도커 DB 미구성 시에도 기존 목업이 동작하도록 조용히 실패 처리
    return null
  }
}

async function getDataSnapshot(symbol: string): Promise<{
  quarterly: number
  yearly: number
  disclosures: number
  news: number
  issueMoves: number
  latestDisclosureDay?: string
  latestIssueMoveDay?: string
}> {
  const db = getDb()
  const [q] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(financialQuarterly)
    .where(eq(financialQuarterly.symbol, symbol))
  const [y] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(financialYearly)
    .where(eq(financialYearly.symbol, symbol))
  const [a] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(announcements)
    .where(eq(announcements.symbol, symbol))
  const [n] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsItems)
    .where(eq(newsItems.symbol, symbol))
  const [m] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(issuePriceMoves)
    .where(eq(issuePriceMoves.symbol, symbol))

  const latestAnn = await db
    .select({ day: announcements.day })
    .from(announcements)
    .where(eq(announcements.symbol, symbol))
    .orderBy(desc(announcements.day))
    .limit(1)
  const latestMove = await db
    .select({ day: issuePriceMoves.eventDay })
    .from(issuePriceMoves)
    .where(eq(issuePriceMoves.symbol, symbol))
    .orderBy(desc(issuePriceMoves.eventDay))
    .limit(1)

  return {
    quarterly: Number(q?.count ?? 0),
    yearly: Number(y?.count ?? 0),
    disclosures: Number(a?.count ?? 0),
    news: Number(n?.count ?? 0),
    issueMoves: Number(m?.count ?? 0),
    latestDisclosureDay: latestAnn[0]?.day ? String(latestAnn[0].day) : undefined,
    latestIssueMoveDay: latestMove[0]?.day ? String(latestMove[0].day) : undefined,
  }
}

async function ensureCompanyDataOnDemand(symbol: string): Promise<void> {
  // 한국 주식 6자리 종목코드만 온디맨드 수집 대상으로 처리.
  if (!/^\d{6}$/.test(symbol)) return

  await ingestNaverFinancialsOnDemand(symbol).catch(() => {})
  await ingestDartAnnouncementsOnDemand(symbol, 120).catch(() => {})
  await ingestYahooDailyOnDemand(symbol, "2y").catch(() => {})
  await ingestGoogleNewsForSymbol({ symbol, limit: 20, days: 14 }).catch(() => {})
  await detectIssueMovesOnDemand(symbol, 365, 5, 5).catch(() => {})
}

async function ingestNaverFinancialsOnDemand(symbol: string): Promise<void> {
  const db = getDb()
  const res = await fetch(`https://finance.naver.com/item/main.naver?code=${encodeURIComponent(symbol)}`, {
    headers: { "User-Agent": "Mozilla/5.0 stock-analyze" },
  })
  if (!res.ok) return
  const html = await res.text()
  const $ = load(html)

  const name =
    $("div.wrap_company h2 a").first().text().trim() ||
    $("title").first().text().replace(/\s*:\s*네이버페이 증권.*/i, "").trim() ||
    symbol
  const sector = $("em.h_sub span").first().text().trim() || "Unknown"
  const marketCap = parseKoreanMarketCapToWon($("#_market_sum").first().text())

  await db
    .insert(companies)
    .values({
      symbol,
      name,
      sector,
      marketCap: marketCap ?? undefined,
      currency: "KRW",
      profile: { source: "on-demand:naver" },
    })
    .onConflictDoUpdate({
      target: companies.symbol,
      set: {
        name,
        sector,
        marketCap: marketCap ?? undefined,
        updatedAt: new Date(),
      },
    })

  const tables = $("table.tb_type1.tb_num.tb_type1_ifrs, table.tb_type1.tb_num")
    .toArray()
    .map((el) => $(el))
  const table = tables.find((t) => {
    const txt = t.text()
    return txt.includes("매출액") && txt.includes("영업이익")
  })
  if (!table) return

  const headerRows = table.find("thead tr").toArray().map((tr) =>
    $(tr)
      .find("th")
      .toArray()
      .map((th) => $(th).text().replace(/\s+/g, " ").trim())
      .filter(Boolean),
  )
  const periodRow =
    headerRows
      .slice()
      .reverse()
      .find((cols) => cols.some((c) => /\d{4}[./]\d{2}/.test(c))) ?? headerRows[headerRows.length - 1] ?? []
  const colLabels = periodRow.map((s) => s.replace(/\(.*?\)/g, "").trim())

  const rows: Record<string, string[]> = {}
  table.find("tbody tr").each((_, tr) => {
    const th = $(tr).find("th").first().text().replace(/\s+/g, " ").trim()
    if (!th) return
    rows[th] = $(tr)
      .find("td")
      .toArray()
      .map((td) => $(td).text().replace(/\s+/g, " ").trim())
  })

  const revenueRow = rows["매출액"] ?? rows["매출"] ?? null
  const opRow = rows["영업이익"] ?? null
  const netRow = rows["당기순이익"] ?? rows["순이익"] ?? null
  const roeRow = rows["ROE(%)"] ?? null
  const epsRow = rows["EPS(원)"] ?? null
  if (!revenueRow || !opRow || !netRow) return

  const yearlyCount = Math.min(4, colLabels.length)
  for (let i = 0; i < colLabels.length; i++) {
    const label = colLabels[i]!
    const period = i < yearlyCount ? { type: "year" as const, key: label.slice(0, 4) } : detectPeriodLabel(label)
    if (!period) continue

    const revenue = toNumber(revenueRow[i] ?? "")
    const operatingIncome = toNumber(opRow[i] ?? "")
    const netIncome = toNumber(netRow[i] ?? "")
    const roe = roeRow ? toNumber(roeRow[i] ?? "") : null
    const eps = epsRow ? toNumber(epsRow[i] ?? "") : null
    const extra = { source: "naver", label, unitHint: "table_unit_maybe_억원" }

    if (period.type === "year") {
      await db
        .insert(financialYearly)
        .values({
          symbol,
          year: period.key,
          revenue: revenue != null ? Math.round(revenue * 100_000_000) : null,
          operatingIncome: operatingIncome != null ? Math.round(operatingIncome * 100_000_000) : null,
          netIncome: netIncome != null ? Math.round(netIncome * 100_000_000) : null,
          roe: roe != null ? String(roe) as any : null,
          extra,
        })
        .onConflictDoUpdate({
          target: [financialYearly.symbol, financialYearly.year],
          set: {
            revenue: revenue != null ? Math.round(revenue * 100_000_000) : null,
            operatingIncome: operatingIncome != null ? Math.round(operatingIncome * 100_000_000) : null,
            netIncome: netIncome != null ? Math.round(netIncome * 100_000_000) : null,
            roe: roe != null ? String(roe) as any : null,
            extra,
          },
        })
    } else {
      await db
        .insert(financialQuarterly)
        .values({
          symbol,
          period: period.key,
          revenue: revenue != null ? Math.round(revenue * 100_000_000) : null,
          operatingIncome: operatingIncome != null ? Math.round(operatingIncome * 100_000_000) : null,
          netIncome: netIncome != null ? Math.round(netIncome * 100_000_000) : null,
          eps: eps != null ? String(eps) as any : null,
          extra,
        })
        .onConflictDoUpdate({
          target: [financialQuarterly.symbol, financialQuarterly.period],
          set: {
            revenue: revenue != null ? Math.round(revenue * 100_000_000) : null,
            operatingIncome: operatingIncome != null ? Math.round(operatingIncome * 100_000_000) : null,
            netIncome: netIncome != null ? Math.round(netIncome * 100_000_000) : null,
            eps: eps != null ? String(eps) as any : null,
            extra,
          },
        })
    }
  }
}

async function ingestDartAnnouncementsOnDemand(symbol: string, days: number): Promise<void> {
  const dartKey = process.env.DART_API_KEY
  if (!dartKey) return
  const db = getDb()

  const corpCode = await resolveCorpCode(dartKey, symbol)
  if (!corpCode) return
  const end = new Date()
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const bgn = yyyymmdd(start)
  const endd = yyyymmdd(end)
  const url =
    `https://opendart.fss.or.kr/api/list.json?crtfc_key=${encodeURIComponent(dartKey)}` +
    `&corp_code=${encodeURIComponent(corpCode)}` +
    `&bgn_de=${encodeURIComponent(bgn)}&end_de=${encodeURIComponent(endd)}` +
    `&page_no=1&page_count=100`
  const res = await fetch(url, { headers: { "User-Agent": "stock-analyze/1.0" } })
  if (!res.ok) return
  const json = await res.json()
  if (json?.status !== "000") return
  const list: any[] = Array.isArray(json?.list) ? json.list : []

  for (const it of list) {
    const rceptNo = String(it.rcept_no ?? "").trim()
    const reportNm = String(it.report_nm ?? "").trim()
    const rceptDt = String(it.rcept_dt ?? "").trim()
    if (!rceptNo || !reportNm || rceptDt.length !== 8) continue
    const day = `${rceptDt.slice(0, 4)}-${rceptDt.slice(4, 6)}-${rceptDt.slice(6, 8)}`
    const link = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(rceptNo)}`
    await db
      .insert(announcements)
      .values({
        symbol,
        title: reportNm,
        day: day as any,
        category: categorizeAnnouncement(reportNm),
        source: "DART",
        url: link,
        summary: "",
        raw: { ...it, corp_code: corpCode },
      })
      .onConflictDoNothing()
  }
}

async function ingestYahooDailyOnDemand(symbol: string, range: string): Promise<void> {
  const db = getDb()
  const yahooSymbol = `${symbol}.KS`
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
    `?range=${encodeURIComponent(range)}&interval=1d&includePrePost=false&events=div%7Csplit`
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 10000)
  const res = await fetch(url, {
    signal: ctrl.signal,
    headers: { "User-Agent": "stock-analyze/1.0" },
  }).finally(() => clearTimeout(timeout))
  if (!res.ok) return
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  const timestamps: number[] = result?.timestamp ?? []
  const quote = result?.indicators?.quote?.[0]
  const opens: (number | null)[] = quote?.open ?? []
  const highs: (number | null)[] = quote?.high ?? []
  const lows: (number | null)[] = quote?.low ?? []
  const closes: (number | null)[] = quote?.close ?? []
  const volumes: (number | null)[] = quote?.volume ?? []
  const rows = timestamps
    .map((ts, i) => {
      const close = closes[i]
      if (close == null) return null
      const d = new Date(ts * 1000).toISOString().slice(0, 10)
      return {
        day: d,
        open: opens[i] ?? close,
        high: highs[i] ?? close,
        low: lows[i] ?? close,
        close,
        volume: volumes[i] ?? null,
      }
    })
    .filter(Boolean) as Array<{ day: string; open: number; high: number; low: number; close: number; volume: number | null }>
  if (rows.length < 20) return

  const closesOnly = rows.map((r) => r.close)
  const rsi14 = rsiSeries(closesOnly, 14)
  const ema12 = emaSeries(closesOnly, 12)
  const ema26 = emaSeries(closesOnly, 26)
  const macd = ema12.map((v, i) => v - ema26[i]!)
  const signal = emaSeries(macd, 9)
  const hist = macd.map((v, i) => v - signal[i]!)

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    await db
      .insert(dailyStats)
      .values({
        symbol,
        day: r.day as any,
        open: String(r.open) as any,
        high: String(r.high) as any,
        low: String(r.low) as any,
        close: String(r.close) as any,
        volume: r.volume ?? undefined,
        indicators: {
          rsi14: Number(rsi14[i]!.toFixed(2)),
          macd: Number(macd[i]!.toFixed(4)),
          macdSignal: Number(signal[i]!.toFixed(4)),
          macdHist: Number(hist[i]!.toFixed(4)),
        },
      })
      .onConflictDoUpdate({
        target: [dailyStats.symbol, dailyStats.day],
        set: {
          open: String(r.open) as any,
          high: String(r.high) as any,
          low: String(r.low) as any,
          close: String(r.close) as any,
          volume: r.volume ?? undefined,
          indicators: {
            rsi14: Number(rsi14[i]!.toFixed(2)),
            macd: Number(macd[i]!.toFixed(4)),
            macdSignal: Number(signal[i]!.toFixed(4)),
            macdHist: Number(hist[i]!.toFixed(4)),
          },
        },
      })
  }
}

async function detectIssueMovesOnDemand(
  symbol: string,
  days: number,
  thresholdPct: number,
  lookaheadDays: number,
): Promise<void> {
  const db = getDb()
  const startDay = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const anns = await db
    .select()
    .from(announcements)
    .where(eq(announcements.symbol, symbol))
    .orderBy(desc(announcements.day))
    .limit(300)
  const news = await db
    .select()
    .from(newsItems)
    .where(eq(newsItems.symbol, symbol))
    .orderBy(desc(newsItems.publishedAt))
    .limit(300)
  const bars = await db
    .select()
    .from(dailyStats)
    .where(eq(dailyStats.symbol, symbol))
    .orderBy(desc(dailyStats.day))
    .limit(600)

  const priceRows = bars
    .map((b) => ({ day: String(b.day), close: Number(b.close ?? 0) }))
    .filter((b) => b.day >= startDay && Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => (a.day < b.day ? -1 : 1))
  if (!priceRows.length) return

  const events = [
    ...anns.map((a) => ({
      source: "DART" as const,
      eventId: a.id,
      eventDay: String(a.day),
      eventTitle: a.title,
    })),
    ...news.map((n) => ({
      source: "NEWS" as const,
      eventId: n.id,
      eventDay: new Date(n.publishedAt).toISOString().slice(0, 10),
      eventTitle: n.title,
    })),
  ]
    .filter((e) => e.eventDay >= startDay)
    .sort((a, b) => (a.eventDay < b.eventDay ? -1 : 1))

  for (const ev of events) {
    const baseIdx = priceRows.findIndex((p) => p.day >= ev.eventDay)
    if (baseIdx < 0) continue
    const base = priceRows[baseIdx]!
    const window = priceRows.slice(baseIdx + 1, baseIdx + 1 + lookaheadDays)
    if (!window.length) continue
    let maxUp = -Infinity
    let maxDown = Infinity
    let upFirst: { day: string; pct: number } | null = null
    let downFirst: { day: string; pct: number } | null = null
    for (const p of window) {
      const pct = ((p.close - base.close) / base.close) * 100
      if (pct > maxUp) maxUp = pct
      if (pct < maxDown) maxDown = pct
      if (!upFirst && pct >= thresholdPct) upFirst = { day: p.day, pct }
      if (!downFirst && pct <= -thresholdPct) downFirst = { day: p.day, pct }
    }
    const upHit = maxUp >= thresholdPct
    const downHit = maxDown <= -thresholdPct
    if (!upHit && !downHit) continue
    const moveType = upHit && downHit ? "BOTH" : upHit ? "SURGE" : "DROP"
    const movePoint =
      moveType === "SURGE"
        ? upFirst
        : moveType === "DROP"
          ? downFirst
          : upFirst && downFirst
            ? upFirst.day <= downFirst.day
              ? upFirst
              : downFirst
            : upFirst ?? downFirst

    await db
      .insert(issuePriceMoves)
      .values({
        symbol,
        eventSource: ev.source,
        eventId: ev.eventId,
        eventDay: ev.eventDay as any,
        eventTitle: ev.eventTitle,
        thresholdPct: thresholdPct.toFixed(4),
        lookaheadDays,
        baseDay: base.day as any,
        baseClose: base.close.toFixed(4),
        maxUpPct: Number.isFinite(maxUp) ? maxUp.toFixed(4) : null,
        maxDownPct: Number.isFinite(maxDown) ? maxDown.toFixed(4) : null,
        moveType,
        moveDay: movePoint?.day as any,
        movePct: movePoint ? movePoint.pct.toFixed(4) : null,
        context: { window, eventDay: ev.eventDay },
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [issuePriceMoves.symbol, issuePriceMoves.eventSource, issuePriceMoves.eventId],
        set: {
          thresholdPct: thresholdPct.toFixed(4),
          lookaheadDays,
          baseDay: base.day as any,
          baseClose: base.close.toFixed(4),
          maxUpPct: Number.isFinite(maxUp) ? maxUp.toFixed(4) : null,
          maxDownPct: Number.isFinite(maxDown) ? maxDown.toFixed(4) : null,
          moveType,
          moveDay: movePoint?.day as any,
          movePct: movePoint ? movePoint.pct.toFixed(4) : null,
          context: { window, eventDay: ev.eventDay },
          updatedAt: new Date(),
        },
      })
  }
}

function toNumber(raw: string): number | null {
  const s = String(raw).replace(/[\s,]/g, "").trim()
  if (!s || s === "-" || s === "N/A") return null
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

function parseKoreanMarketCapToWon(raw: string): number | null {
  const txt = String(raw ?? "").replace(/\s+/g, " ").trim()
  if (!txt) return null
  const joMatch = txt.match(/([\d,]+)\s*조/)
  const afterJo = txt.replace(/.*조/, "").trim()
  const eokMatch = afterJo.match(/([\d,]+)/)
  const jo = joMatch ? Number(joMatch[1].replace(/,/g, "")) : 0
  const eok = eokMatch ? Number(eokMatch[1].replace(/,/g, "")) : 0
  if (!Number.isFinite(jo) || !Number.isFinite(eok)) return null
  const won = jo * 1_0000_0000_0000 + eok * 1_0000_0000
  return won > 0 ? won : null
}

function detectPeriodLabel(label: string): { type: "quarter"; key: string } | null {
  const m = label.trim().match(/^(\d{4})[./](\d{2})/)
  if (!m) return null
  const y = m[1]!
  const mm = m[2]!
  const q = mm === "03" ? "Q1" : mm === "06" ? "Q2" : mm === "09" ? "Q3" : mm === "12" ? "Q4" : null
  if (!q) return { type: "quarter", key: `${y} ${mm}` }
  return { type: "quarter", key: `${y} ${q}` }
}

function categorizeAnnouncement(reportNm: string): string {
  const t = reportNm
  if (/(잠정|실적|매출|영업이익|분기|사업보고서|반기보고서|분기보고서)/.test(t)) return "실적"
  if (/(배당|현금배당|중간배당|기말배당)/.test(t)) return "배당"
  if (/(유상증자|무상증자|전환사채|신주인수권|BW|CB)/i.test(t)) return "증자/자금조달"
  if (/(합병|분할|영업양수|영업양도)/.test(t)) return "M&A/구조"
  if (/(자기주식|자사주|소각)/.test(t)) return "주주환원"
  if (/(수주|공급계약|계약|특허)/.test(t)) return "수주/계약"
  return "기타"
}

async function resolveCorpCode(crtfcKey: string, stockCode: string): Promise<string | null> {
  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${encodeURIComponent(crtfcKey)}`
  const res = await fetch(url, { headers: { "User-Agent": "stock-analyze/1.0" } })
  if (!res.ok) return null
  const buf = await res.arrayBuffer()
  const JSZip = (await import("jszip")).default
  const { XMLParser } = await import("fast-xml-parser")
  const zip = await JSZip.loadAsync(buf)
  const file = zip.file(/CORPCODE\.xml/i)[0] ?? zip.file(/corpCode\.xml/i)[0] ?? zip.file(/\.xml$/i)[0]
  if (!file) return null
  const xmlText = await file.async("text")
  const parser = new XMLParser({ ignoreAttributes: false })
  const parsed = parser.parse(xmlText)
  const list = parsed?.result?.list
  const arr = Array.isArray(list) ? list : list ? [list] : []
  const normalized = String(stockCode).trim().replace(/^0+/, "")
  const found = arr.find((x: any) => String(x.stock_code ?? "").trim() === normalized)
  if (!found?.corp_code) return null
  return String(found.corp_code).trim().padStart(8, "0")
}

function yyyymmdd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}${m}${day}`
}

function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  let prev = values[0] ?? 0
  out.push(prev)
  for (let i = 1; i < values.length; i++) {
    const v = values[i]!
    prev = v * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

function rsiSeries(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(50)
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period && i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!
    if (diff >= 0) gain += diff
    else loss -= diff
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!
    const g = diff > 0 ? diff : 0
    const l = diff < 0 ? -diff : 0
    gain = (gain * (period - 1) + g) / period
    loss = (loss * (period - 1) + l) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

