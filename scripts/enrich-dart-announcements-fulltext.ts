import OpenAI from "openai"
import JSZip from "jszip"
import { load } from "cheerio"
import { getDb } from "@/db"
import { announcements } from "@/db/schema"
import { and, eq, desc, sql } from "drizzle-orm"
import { assertBudgetAvailable, recordUsage } from "./_lib/ai-budget"

type Args = {
  symbol: string
  limit: number
  importantOnly: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (k: string) => {
    const idx = argv.indexOf(`--${k}`)
    return idx >= 0 ? argv[idx + 1] : undefined
  }
  return {
    symbol: get("symbol") ?? "005930",
    limit: Number(get("limit") ?? "15"),
    importantOnly: (get("importantOnly") ?? "1") === "1",
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

function extractRceptNo(raw: any): string {
  const v = raw?.rcept_no ?? raw?.rceptNo ?? raw?.rceptno
  return String(v ?? "").trim()
}

async function fetchDartDocumentText(crtfcKey: string, rceptNo: string): Promise<string> {
  const url = `https://opendart.fss.or.kr/api/document.xml?crtfc_key=${encodeURIComponent(
    crtfcKey,
  )}&rcept_no=${encodeURIComponent(rceptNo)}`
  const buf = await fetchBuffer(url)
  const zip = await JSZip.loadAsync(buf)
  const files = Object.keys(zip.files)
  // 우선순위: html > htm > xhtml > xml
  const pick =
    files.find((n) => /\.html?$/i.test(n)) ??
    files.find((n) => /\.xhtml$/i.test(n)) ??
    files.find((n) => /\.xml$/i.test(n)) ??
    files[0]
  if (!pick) return ""
  const text = await zip.file(pick)!.async("text")
  // html이면 텍스트만 추출
  if (/<html/i.test(text) || /<body/i.test(text)) {
    const $ = load(text)
    const bodyText = $("body").text()
    return bodyText.replace(/\s+/g, " ").trim()
  }
  // xml이면 태그 제거 수준으로 처리
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

const client = new OpenAI({ apiKey: requiredEnv("OPENAI_API_KEY") })

async function summarizeWithContext(input: {
  title: string
  category?: string | null
  excerpt: string
}) {
  const prompt = `
너는 한국 상장기업 공시를 읽는 애널리스트다.
아래 공시 제목과 본문 발췌를 바탕으로 "투자 판단을 돕는 요약"을 2~3문장으로 작성하라.
투자 권유(매수/매도/추천)는 금지.

출력은 반드시 JSON만:
{
  "summary": "string (max 220 chars)",
  "sentiment": "positive|negative|neutral",
  "epsImpactScore": number (1~10),
  "category": "실적|배당|증자/자금조달|주주환원|M&A/구조|수주/계약|지배구조|기타"
}

[공시 제목]
${input.title}

[본문 발췌]
${input.excerpt}

[현재 분류(참고)]
${input.category ?? "없음"}
`.trim()

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  })

  const content = res.choices[0]?.message?.content ?? "{}"
  const json = JSON.parse(content)
  return {
    summary: String(json.summary ?? "").slice(0, 260),
    sentiment: ["positive", "negative", "neutral"].includes(json.sentiment) ? json.sentiment : "neutral",
    epsImpactScore: Math.max(1, Math.min(10, Number(json.epsImpactScore ?? 3))),
    category: typeof json.category === "string" ? json.category : undefined,
  }
}

async function main() {
  const { symbol, limit, importantOnly } = parseArgs()
  const db = getDb()
  const dartKey = requiredEnv("DART_API_KEY")

  const IMPORTANT = new Set([
    "실적",
    "배당",
    "주주환원",
    "증자/자금조달",
    "수주/계약",
    "M&A/구조",
  ])

  // fulltext로 이미 요약된 건은 건너뛴다.
  const notFulltext = sql`COALESCE(${announcements.raw}->>'summary_mode','') <> 'fulltext'`

  const candidates = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.symbol, symbol),
        notFulltext,
      ),
    )
    .orderBy(desc(announcements.day), desc(announcements.createdAt))
    .limit(Math.max(limit * 6, limit))

  const rows = candidates
    .filter((r) => (importantOnly ? IMPORTANT.has(String(r.category ?? "기타")) : true))
    .slice(0, limit)

  let updated = 0
  for (const row of rows) {
    const rceptNo = extractRceptNo(row.raw)
    if (!rceptNo) continue

    // 예산 캡: 단가가 설정되어 있으면 대략적인 1회 호출 비용을 가정하고 초과 시 중단
    // (단가 미설정이면 토큰만 로깅되고 cap은 사실상 비활성)
    await assertBudgetAvailable(0)

    // 원문은 길 수 있으니 앞부분만 잘라서 사용
    const full = await fetchDartDocumentText(dartKey, rceptNo)
    const excerpt = full.slice(0, 2500)
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `
너는 한국 상장기업 공시를 읽는 애널리스트다.
아래 공시 제목과 본문 발췌를 바탕으로 "투자 판단을 돕는 요약"을 2~3문장으로 작성하라.
투자 권유(매수/매도/추천)는 금지.

출력은 반드시 JSON만:
{
  "summary": "string (max 220 chars)",
  "sentiment": "positive|negative|neutral",
  "epsImpactScore": number (1~10),
  "category": "실적|배당|증자/자금조달|주주환원|M&A/구조|수주/계약|지배구조|기타"
}

[공시 제목]
${row.title}

[본문 발췌]
${excerpt}

[현재 분류(참고)]
${row.category ?? "없음"}
`.trim(),
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    })
    const content = res.choices[0]?.message?.content ?? "{}"
    const json = JSON.parse(content)
    const s = {
      summary: String(json.summary ?? "").slice(0, 260),
      sentiment: ["positive", "negative", "neutral"].includes(json.sentiment) ? json.sentiment : "neutral",
      epsImpactScore: Math.max(1, Math.min(10, Number(json.epsImpactScore ?? 3))),
      category: typeof json.category === "string" ? json.category : undefined,
    }

    const usage = (res as any).usage
    if (usage) {
      await recordUsage(
        {
          feature: "dart_enrich_fulltext",
          model: "gpt-4o-mini",
          meta: { symbol, rceptNo },
        },
        {
          inputTokens: Number(usage.prompt_tokens ?? 0),
          outputTokens: Number(usage.completion_tokens ?? 0),
        },
      )
    }

    await db
      .update(announcements)
      .set({
        summary: s.summary || row.title,
        sentiment: s.sentiment,
        epsImpactScore: s.epsImpactScore,
        category: s.category ?? row.category,
        raw: { ...(row.raw as any), extracted_text_head: excerpt, summary_mode: "fulltext" },
      })
      .where(eq(announcements.id, row.id))

    updated++
  }

  console.log(
    JSON.stringify(
      { ok: true, symbol, importantOnly, processed: rows.length, updated },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

