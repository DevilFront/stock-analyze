import { load } from "cheerio"
import { getDb } from "@/db"
import { companies, financialQuarterly, financialYearly } from "@/db/schema"

type Args = {
  symbol: string
  name?: string
  sector?: string
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (k: string) => {
    const idx = argv.indexOf(`--${k}`)
    return idx >= 0 ? argv[idx + 1] : undefined
  }
  return {
    symbol: get("symbol") ?? "005930",
    name: get("name"),
    sector: get("sector"),
  }
}

async function fetchHtml(symbol: string): Promise<string> {
  const url = `https://finance.naver.com/item/main.naver?code=${encodeURIComponent(symbol)}`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 stock-analyze" },
  })
  if (!res.ok) throw new Error(`Naver fetch failed: HTTP ${res.status}`)
  return await res.text()
}

function toNumber(raw: string): number | null {
  const s = raw.replace(/[\s,]/g, "").trim()
  if (!s || s === "-" || s === "N/A") return null
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

function detectPeriod(label: string): { type: "year" | "quarter"; key: string } | null {
  const t = label.trim()
  // 분기: "2024.12(E)" 또는 "2024.09" 같은 형태 -> 분기 추정
  const m2 = t.match(/^(\d{4})[./](\d{2})/)
  if (m2) {
    const y = m2[1]!
    const mm = m2[2]!
    const q =
      mm === "03" ? "Q1" :
      mm === "06" ? "Q2" :
      mm === "09" ? "Q3" :
      mm === "12" ? "Q4" : null
    if (q) return { type: "quarter", key: `${y} ${q}` }
    return { type: "quarter", key: `${y} ${mm}` }
  }
  return null
}

function pickFinancialTable($: ReturnType<typeof load>) {
  // 재무 하이라이트 테이블은 보통 ifrs 클래스에 존재
  const candidates = $("table.tb_type1.tb_num.tb_type1_ifrs, table.tb_type1.tb_num")
    .toArray()
    .map((el) => $(el))

  for (const t of candidates) {
    const text = t.text()
    if (text.includes("매출액") && text.includes("영업이익")) return t
  }
  return null
}

function parseTable($: ReturnType<typeof load>, table: ReturnType<typeof load> extends any ? any : any) {
  const headerRows: string[][] = table.find("thead tr").toArray().map((tr: any) =>
    $(tr)
      .find("th")
      .toArray()
      .map((th: any) => $(th).text().replace(/\s+/g, " ").trim())
      .filter(Boolean),
  )

  // 네이버는 보통 thead가 2줄: (최근 연간/최근 분기) + (기간 라벨)
  // 기간 라벨이 있는 행을 골라서 사용한다.
  const periodRow =
    headerRows
      .slice()
      .reverse()
      .find((cols: string[]) => cols.some((c: string) => /\d{4}[./]\d{2}/.test(c))) ??
    headerRows[headerRows.length - 1] ??
    []

  // 네이버 표는 기간 라벨 행에 "주요재무정보" 헤더가 포함되지 않는 구조(행 병합)라
  // slice(1)로 자르면 인덱스 정렬이 깨진다. periodRow 전체를 그대로 사용한다.
  const colLabels = periodRow.map((s) => s.replace(/\(.*?\)/g, "").trim())

  const rows: Record<string, string[]> = {}
  table.find("tbody tr").each((_: any, tr: any) => {
    const th = $(tr).find("th").first().text().replace(/\s+/g, " ").trim()
    if (!th) return
    const tds = $(tr)
      .find("td")
      .toArray()
      .map((td: any) => $(td).text().replace(/\s+/g, " ").trim())
    rows[th] = tds
  })

  return { colLabels, rows }
}

async function main() {
  const { symbol, name, sector } = parseArgs()
  const db = getDb()

  const html = await fetchHtml(symbol)
  const $ = load(html)
  const marketCap = parseKoreanMarketCapToWon($("#_market_sum").first().text())

  const table = pickFinancialTable($)
  if (!table) throw new Error("Failed to find financial table on Naver page")

  const { colLabels, rows } = parseTable($, table)

  const revenueRow = rows["매출액"] ?? rows["매출"] ?? null
  const opRow = rows["영업이익"] ?? null
  const netRow = rows["당기순이익"] ?? rows["순이익"] ?? null
  const roeRow = rows["ROE(%)"] ?? null
  const epsRow = rows["EPS(원)"] ?? null

  if (!revenueRow || !opRow || !netRow) {
    throw new Error("Missing 핵심 재무 row (매출액/영업이익/당기순이익)")
  }

  await db
    .insert(companies)
    .values({
      symbol,
      name: name ?? symbol,
      sector: sector ?? "Unknown",
      marketCap: marketCap ?? undefined,
      currency: "KRW",
      profile: { source: "naver-finance" },
    })
    .onConflictDoUpdate({
      target: companies.symbol,
      set: {
        name: name ?? symbol,
        sector: sector ?? "Unknown",
        marketCap: marketCap ?? undefined,
        updatedAt: new Date(),
      },
    })

  // 네이버 표는 보통 [연간 4개] + [분기 5개] (총 9개) 형태
  const yearlyCount = Math.min(4, colLabels.length)

  // 컬럼별로 연간/분기 구분해서 적재
  for (let i = 0; i < colLabels.length; i++) {
    const label = colLabels[i]!
    const p = i < yearlyCount
      ? ({ type: "year", key: label.slice(0, 4) } as const)
      : detectPeriod(label)
    if (!p) continue

    const revenue = toNumber(revenueRow[i] ?? "")
    const operatingIncome = toNumber(opRow[i] ?? "")
    const netIncome = toNumber(netRow[i] ?? "")
    const roe = roeRow ? toNumber(roeRow[i] ?? "") : null
    const eps = epsRow ? toNumber(epsRow[i] ?? "") : null

    // 네이버 표 단위가 "억원"인 경우가 많음 → extra에 단위 정보 저장
    const extra = {
      source: "naver",
      label,
      unitHint: "table_unit_maybe_억원",
    }

    if (p.type === "year") {
      await db
        .insert(financialYearly)
        .values({
          symbol,
          year: p.key,
          revenue: revenue != null ? Math.round(revenue * 100_000_000) : null, // 억원 → 원
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
          period: p.key,
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

  console.log(
    JSON.stringify(
      {
        ok: true,
        symbol,
        cols: colLabels.length,
        inserted: { yearly: true, quarterly: true },
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

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

