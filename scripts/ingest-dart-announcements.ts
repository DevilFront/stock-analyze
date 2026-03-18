import { getDb } from "@/db"
import { announcements, companies } from "@/db/schema"
import { eq } from "drizzle-orm"
import JSZip from "jszip"
import { XMLParser } from "fast-xml-parser"

type Args = {
  symbol: string
  days: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (k: string) => {
    const idx = argv.indexOf(`--${k}`)
    return idx >= 0 ? argv[idx + 1] : undefined
  }
  return {
    symbol: get("symbol") ?? "005930",
    days: Number(get("days") ?? "30"),
  }
}

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { headers: { "User-Agent": "stock-analyze/1.0" } })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  return await res.arrayBuffer()
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "User-Agent": "stock-analyze/1.0" } })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  return await res.json()
}

async function resolveCorpCode(crtfcKey: string, stockCode: string): Promise<string> {
  // DART corpCode.xml is a zip
  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${encodeURIComponent(crtfcKey)}`
  const buf = await fetchBuffer(url)
  const zip = await JSZip.loadAsync(buf)
  const file = zip.file(/CORPCODE\.xml/i)[0] ?? zip.file(/corpCode\.xml/i)[0] ?? zip.file(/\.xml$/i)[0]
  if (!file) throw new Error("corpCode xml not found in zip")
  const xmlText = await file.async("text")
  const parser = new XMLParser({ ignoreAttributes: false })
  const parsed = parser.parse(xmlText)
  const list = parsed?.result?.list
  if (!list) throw new Error("unexpected corpCode xml shape")
  const arr = Array.isArray(list) ? list : [list]
  const found = arr.find((x: any) => String(x.stock_code ?? "").trim() === stockCode)
  if (!found?.corp_code) throw new Error(`corp_code not found for stock_code=${stockCode}`)
  return String(found.corp_code).trim()
}

function yyyymmdd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}${m}${day}`
}

function categorize(reportNm: string): string {
  const t = reportNm
  if (/(잠정|실적|매출|영업이익|분기|사업보고서|반기보고서|분기보고서)/.test(t)) return "실적"
  if (/(배당|현금배당|중간배당|기말배당)/.test(t)) return "배당"
  if (/(유상증자|무상증자|전환사채|신주인수권|BW|CB)/i.test(t)) return "증자/자금조달"
  if (/(합병|분할|영업양수|영업양도)/.test(t)) return "M&A/구조"
  if (/(자기주식|자사주|소각)/.test(t)) return "주주환원"
  if (/(수주|공급계약|계약|특허)/.test(t)) return "수주/계약"
  return "기타"
}

async function main() {
  const { symbol, days } = parseArgs()
  const crtfcKey = requiredEnv("DART_API_KEY")
  const db = getDb()

  // ensure company exists (for FK)
  const c = await db.query.companies.findFirst({ where: eq(companies.symbol, symbol) })
  if (!c) {
    throw new Error(`companies row not found for ${symbol}. Run ingest scripts first.`)
  }

  const corpCode = await resolveCorpCode(crtfcKey, symbol)

  const end = new Date()
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const bgn = yyyymmdd(start)
  const endd = yyyymmdd(end)

  const listUrl =
    `https://opendart.fss.or.kr/api/list.json?` +
    `crtfc_key=${encodeURIComponent(crtfcKey)}` +
    `&corp_code=${encodeURIComponent(corpCode)}` +
    `&bgn_de=${encodeURIComponent(bgn)}` +
    `&end_de=${encodeURIComponent(endd)}` +
    `&page_no=1&page_count=100`

  const json = await fetchJson(listUrl)
  if (json?.status !== "000") {
    throw new Error(`DART error: ${json?.status} ${json?.message}`)
  }

  const items: any[] = Array.isArray(json?.list) ? json.list : []

  let upserts = 0
  for (const it of items) {
    const rceptNo = String(it.rcept_no ?? "").trim()
    const reportNm = String(it.report_nm ?? "").trim()
    const rceptDt = String(it.rcept_dt ?? "").trim() // YYYYMMDD
    if (!rceptNo || !reportNm || rceptDt.length !== 8) continue

    const day = `${rceptDt.slice(0, 4)}-${rceptDt.slice(4, 6)}-${rceptDt.slice(6, 8)}`
    const url = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(rceptNo)}`
    const category = categorize(reportNm)

    await db
      .insert(announcements)
      .values({
        symbol,
        title: reportNm,
        day: day as any,
        category,
        source: "DART",
        url,
        summary: "",
        raw: { ...it, corp_code: corpCode },
      })
      .onConflictDoNothing()

    upserts++
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        symbol,
        corpCode,
        range: { bgn, end: endd },
        fetched: items.length,
        inserted: upserts,
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

