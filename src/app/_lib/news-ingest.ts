import { getDb } from "@/db"
import { companies, newsItems } from "@/db/schema"
import { and, eq, gte } from "drizzle-orm"
import { XMLParser } from "fast-xml-parser"

type IngestNewsParams = {
  symbol: string
  companyName?: string
  limit?: number
  days?: number
}

export async function ingestGoogleNewsForSymbol(params: IngestNewsParams) {
  const symbol = params.symbol.trim()
  const limit = Math.max(1, Math.min(50, params.limit ?? 20))
  const days = Math.max(1, Math.min(30, params.days ?? 14))
  const db = getDb()

  const companyName = params.companyName?.trim() || (await resolveCompanyName(symbol))
  const query = buildQuery(symbol, companyName, days)
  const url = buildGoogleNewsRssUrl(query)

  const res = await fetch(url, {
    headers: { "User-Agent": "stock-analyze/1.0" },
  })
  if (!res.ok) {
    throw new Error(`Google News RSS fetch failed: HTTP ${res.status}`)
  }

  const xml = await res.text()
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true })
  const parsed = parser.parse(xml)
  const rawItems = normalizeItems(parsed?.rss?.channel?.item).slice(0, limit)

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  let inserted = 0
  let skipped = 0

  for (const item of rawItems) {
    const link = String(item.link ?? "").trim()
    const titleRaw = String(item.title ?? "").trim()
    if (!link || !titleRaw) {
      skipped++
      continue
    }

    const publishedAt = parsePublishedAt(item.pubDate ?? item.isoDate)
    if (publishedAt < since) {
      skipped++
      continue
    }

    const source = extractSource(item.source, titleRaw)
    const title = stripSourceSuffix(titleRaw, source)
    const summary = sanitizeHtml(String(item.description ?? ""))

    const existing = await db
      .select({ id: newsItems.id })
      .from(newsItems)
      .where(and(eq(newsItems.symbol, symbol), eq(newsItems.url, link)))
      .limit(1)
    if (existing.length > 0) {
      skipped++
      continue
    }

    await db.insert(newsItems).values({
      symbol,
      publishedAt,
      title,
      source: source || "Google News",
      url: link,
      summary: summary || undefined,
      topicTags: ["google-news-rss"],
      raw: item,
    })
    inserted++
  }

  return {
    ok: true,
    symbol,
    query,
    fetched: rawItems.length,
    inserted,
    skipped,
  }
}

async function resolveCompanyName(symbol: string): Promise<string> {
  const db = getDb()
  const c = await db.query.companies.findFirst({
    where: eq(companies.symbol, symbol),
  })
  return c?.name?.trim() || symbol
}

function buildQuery(symbol: string, companyName: string, days: number): string {
  return `${companyName} ${symbol} 주식 when:${days}d`
}

function buildGoogleNewsRssUrl(query: string): string {
  const q = encodeURIComponent(query)
  return `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`
}

function normalizeItems(v: any): any[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function parsePublishedAt(v: any): Date {
  const d = new Date(String(v ?? ""))
  return Number.isFinite(d.getTime()) ? d : new Date()
}

function stripSourceSuffix(title: string, source: string): string {
  const suffix = source ? ` - ${source}` : ""
  if (suffix && title.endsWith(suffix)) return title.slice(0, -suffix.length).trim()
  return title
}

function extractSource(sourceField: any, title: string): string {
  if (typeof sourceField === "string" && sourceField.trim()) return sourceField.trim()
  if (sourceField && typeof sourceField === "object") {
    const text = sourceField["#text"] || sourceField.__text
    if (typeof text === "string" && text.trim()) return text.trim()
  }
  const m = title.match(/\s-\s([^-\n]+)$/)
  return m?.[1]?.trim() ?? ""
}

function sanitizeHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

