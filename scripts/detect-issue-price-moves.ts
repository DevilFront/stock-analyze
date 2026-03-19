import { getDb } from "@/db"
import { announcements, dailyStats, issuePriceMoves, newsItems } from "@/db/schema"
import { and, desc, eq, gte, sql } from "drizzle-orm"

type Args = {
  symbol: string
  days: number
  thresholdPct: number
  lookaheadDays: number
}

type EventRow = {
  source: "DART" | "NEWS"
  eventId: string
  eventDay: string
  eventTitle: string
}

type PriceRow = {
  day: string
  close: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (k: string) => {
    const idx = argv.indexOf(`--${k}`)
    return idx >= 0 ? argv[idx + 1] : undefined
  }

  return {
    symbol: get("symbol") ?? "005930",
    days: Number(get("days") ?? "180"),
    thresholdPct: Number(get("thresholdPct") ?? "5"),
    lookaheadDays: Number(get("lookaheadDays") ?? "5"),
  }
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function asNumber(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function classifyMove(maxUpPct: number, maxDownPct: number, thresholdPct: number) {
  const upHit = maxUpPct >= thresholdPct
  const downHit = maxDownPct <= -thresholdPct
  if (upHit && downHit) return "BOTH" as const
  if (upHit) return "SURGE" as const
  return "DROP" as const
}

async function main() {
  const { symbol, days, thresholdPct, lookaheadDays } = parseArgs()
  const db = getDb()

  const startDay = toDateOnly(new Date(Date.now() - days * 24 * 60 * 60 * 1000))

  const annRows = await db
    .select({
      source: sql<"DART">`'DART'`,
      eventId: announcements.id,
      eventDay: announcements.day,
      eventTitle: announcements.title,
    })
    .from(announcements)
    .where(and(eq(announcements.symbol, symbol), gte(announcements.day, startDay as any)))

  const newsRows = await db
    .select({
      source: sql<"NEWS">`'NEWS'`,
      eventId: newsItems.id,
      eventDay: sql<string>`CAST(${newsItems.publishedAt} AS DATE)`,
      eventTitle: newsItems.title,
    })
    .from(newsItems)
    .where(and(eq(newsItems.symbol, symbol), gte(newsItems.publishedAt, new Date(startDay))))

  const events: EventRow[] = [...annRows, ...newsRows]
    .map((r) => ({
      source: r.source,
      eventId: String(r.eventId),
      eventDay: String(r.eventDay),
      eventTitle: String(r.eventTitle ?? ""),
    }))
    .sort((a, b) => (a.eventDay < b.eventDay ? -1 : 1))

  const prices = await db
    .select({
      day: dailyStats.day,
      close: dailyStats.close,
    })
    .from(dailyStats)
    .where(and(eq(dailyStats.symbol, symbol), gte(dailyStats.day, startDay as any)))
    .orderBy(desc(dailyStats.day))

  const priceRows: PriceRow[] = prices
    .map((p) => ({ day: String(p.day), close: asNumber(p.close) ?? NaN }))
    .filter((p) => Number.isFinite(p.close))
    .sort((a, b) => (a.day < b.day ? -1 : 1))

  let scanned = 0
  let labeled = 0

  for (const ev of events) {
    scanned++
    const baseIdx = priceRows.findIndex((p) => p.day >= ev.eventDay)
    if (baseIdx < 0) continue
    const base = priceRows[baseIdx]
    const window = priceRows.slice(baseIdx + 1, baseIdx + 1 + lookaheadDays)
    if (window.length === 0 || base.close <= 0) continue

    let maxUpPct = -Infinity
    let maxDownPct = Infinity
    let upFirst: { day: string; pct: number } | null = null
    let downFirst: { day: string; pct: number } | null = null

    for (const p of window) {
      const pct = ((p.close - base.close) / base.close) * 100
      if (pct > maxUpPct) maxUpPct = pct
      if (pct < maxDownPct) maxDownPct = pct
      if (!upFirst && pct >= thresholdPct) upFirst = { day: p.day, pct }
      if (!downFirst && pct <= -thresholdPct) downFirst = { day: p.day, pct }
    }

    const upHit = maxUpPct >= thresholdPct
    const downHit = maxDownPct <= -thresholdPct
    if (!upHit && !downHit) continue

    const moveType = classifyMove(maxUpPct, maxDownPct, thresholdPct)
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
        eventTitle: ev.eventTitle || "(제목 없음)",
        thresholdPct: thresholdPct.toFixed(4),
        lookaheadDays,
        baseDay: base.day as any,
        baseClose: base.close.toFixed(4),
        maxUpPct: Number.isFinite(maxUpPct) ? maxUpPct.toFixed(4) : null,
        maxDownPct: Number.isFinite(maxDownPct) ? maxDownPct.toFixed(4) : null,
        moveType,
        moveDay: movePoint?.day as any,
        movePct: movePoint ? movePoint.pct.toFixed(4) : null,
        context: {
          window,
          eventDay: ev.eventDay,
        },
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [issuePriceMoves.symbol, issuePriceMoves.eventSource, issuePriceMoves.eventId],
        set: {
          thresholdPct: thresholdPct.toFixed(4),
          lookaheadDays,
          baseDay: base.day as any,
          baseClose: base.close.toFixed(4),
          maxUpPct: Number.isFinite(maxUpPct) ? maxUpPct.toFixed(4) : null,
          maxDownPct: Number.isFinite(maxDownPct) ? maxDownPct.toFixed(4) : null,
          moveType,
          moveDay: movePoint?.day as any,
          movePct: movePoint ? movePoint.pct.toFixed(4) : null,
          context: {
            window,
            eventDay: ev.eventDay,
          },
          updatedAt: new Date(),
        },
      })

    labeled++
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        symbol,
        startDay,
        thresholdPct,
        lookaheadDays,
        scannedEvents: scanned,
        labeledEvents: labeled,
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

