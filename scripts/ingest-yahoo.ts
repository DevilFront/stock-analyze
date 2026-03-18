import { getDb } from "@/db"
import { companies, dailyStats } from "@/db/schema"

type Args = {
  symbol: string
  name?: string
  sector?: string
  yahooSymbol: string
  range: string
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (k: string) => {
    const idx = argv.indexOf(`--${k}`)
    return idx >= 0 ? argv[idx + 1] : undefined
  }
  return {
    symbol: get("symbol") ?? "005930",
    yahooSymbol: get("yahoo") ?? "005930.KS",
    name: get("name"),
    sector: get("sector"),
    range: get("range") ?? "2y",
  }
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

async function fetchYahooChart(yahooSymbol: string, range: string) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
    `?range=${encodeURIComponent(range)}&interval=1d&includePrePost=false&events=div%7Csplit`
  const res = await fetch(url, {
    headers: {
      // 일부 환경에서 UA가 없으면 차단되는 케이스 방어
      "User-Agent": "stock-analyze/1.0",
    },
  })
  if (!res.ok) throw new Error(`Yahoo chart fetch failed: HTTP ${res.status}`)
  return (await res.json()) as any
}

async function main() {
  const { symbol, yahooSymbol, name, sector, range } = parseArgs()
  const db = getDb()

  const json = await fetchYahooChart(yahooSymbol, range)
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
      const d = new Date(ts * 1000)
      const day = d.toISOString().slice(0, 10)
      return {
        day,
        open: opens[i] ?? close,
        high: highs[i] ?? close,
        low: lows[i] ?? close,
        close,
        volume: volumes[i] ?? null,
      }
    })
    .filter(Boolean) as Array<{
    day: string
    open: number
    high: number
    low: number
    close: number
    volume: number | null
  }>

  if (rows.length < 30) throw new Error(`Not enough rows from Yahoo (${rows.length})`)

  const closeSeries = rows.map((r) => r.close)
  const rsi14 = rsi(closeSeries, 14)
  const ema12 = ema(closeSeries, 12)
  const ema26 = ema(closeSeries, 26)
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
      profile: { source: "yahoo", yahooSymbol },
    })
    .onConflictDoUpdate({
      target: companies.symbol,
      set: {
        name: name ?? symbol,
        sector: sector ?? "Unknown",
        updatedAt: new Date(),
        profile: { source: "yahoo", yahooSymbol },
      },
    })

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
        yahooSymbol,
        rows: rows.length,
        last: { day: last.day, close: last.close, volume: last.volume },
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

