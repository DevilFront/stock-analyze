import { ingestGoogleNewsForSymbol } from "@/app/_lib/news-ingest"

type Args = {
  symbol: string
  name?: string
  limit: number
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
    name: get("name"),
    limit: Number(get("limit") ?? "20"),
    days: Number(get("days") ?? "14"),
  }
}

async function main() {
  const { symbol, name, limit, days } = parseArgs()
  const result = await ingestGoogleNewsForSymbol({
    symbol,
    companyName: name,
    limit,
    days,
  })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

