import { getDb } from "@/db"
import { companies, dailyStats } from "@/db/schema"

type Args = {
  symbol: string
  name?: string
  sector?: string
  stooqSymbol: string
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (k: string) => {
    const idx = argv.indexOf(`--${k}`)
    return idx >= 0 ? argv[idx + 1] : undefined
  }
  const symbol = get("symbol") ?? "005930"
  const stooqSymbol = get("stooq") ?? "005930.KS"
  const name = get("name")
  const sector = get("sector")
  return { symbol, stooqSymbol, name, sector }
}

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`)
  return await res.text()
}

function ema(values: number[], period: number): number[] {
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

function rsi(closes: number[], period = 14): number[] {
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

async function main() {
  const { symbol, stooqSymbol, name, sector } = parseArgs()
  const db = getDb()

  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`
  const csv = await fetchCsv(url)
  const lines = csv.trim().split("\n")
  if (lines.length < 2) throw new Error("No data in CSV")

  const header = lines[0]!.split(",").map((s) => s.trim().toLowerCase())
  const idxDate = header.indexOf("date")
  const idxOpen = header.indexOf("open")
  const idxHigh = header.indexOf("high")
  const idxLow = header.indexOf("low")
  const idxClose = header.indexOf("close")
  const idxVol = header.indexOf("volume")
  if ([idxDate, idxOpen, idxHigh, idxLow, idxClose].some((i) => i < 0)) {
    throw new Error(`Unexpected header: ${lines[0]}`)
  }

  const rows = lines
    .slice(1)
    .map((l) => l.split(","))
    .filter((c) => c.length >= 5)
    .map((c) => ({
      day: c[idxDate]!,
      open: Number(c[idxOpen]!),
      high: Number(c[idxHigh]!),
      low: Number(c[idxLow]!),
      close: Number(c[idxClose]!),
      volume: idxVol >= 0 ? Number(c[idxVol]!) : null,
    }))
    .filter((r) => r.day && Number.isFinite(r.close))
    .sort((a, b) => a.day.localeCompare(b.day))

  const closes = rows.map((r) => r.close)
  const rsi14 = rsi(closes, 14)
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const macd = ema12.map((v, i) => v - ema26[i]!)
  const signal = ema(macd, 9)
  const hist = macd.map((v, i) => v - signal[i]!)

  await db
    .insert(companies)
    .values({
      symbol,
      name: name ?? symbol,
      sector: sector ?? "Unknown",
      currency: "KRW",
      profile: { source: "stooq", stooqSymbol },
    })
    .onConflictDoUpdate({
      target: companies.symbol,
      set: {
        name: name ?? symbol,
        sector: sector ?? "Unknown",
        updatedAt: new Date(),
        profile: { source: "stooq", stooqSymbol },
      },
    })

  // upsert daily bars
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

  const last = rows[rows.length - 1]!
  console.log(
    JSON.stringify(
      {
        ok: true,
        symbol,
        stooqSymbol,
        rows: rows.length,
        last: { day: last.day, close: last.close },
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

