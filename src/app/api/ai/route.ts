import { NextRequest } from "next/server"
import OpenAI from "openai"
import { getCompanyRaw } from "@/app/_lib/company-data"
import { auth } from "@/auth"
import { getDb } from "@/db"
import {
  creditLedger,
  dailyStats,
  deviceFreeClaims,
  ipDailyFreeClaims,
  reports,
  userCredits,
} from "@/db/schema"
import { and, desc, eq } from "drizzle-orm"
import crypto from "crypto"

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const db = getDb()
  if (!process.env.OPENAI_API_KEY) {
    return new Response("OPENAI_API_KEY is not set", { status: 500 })
  }

  const demoMode = process.env.REPORT_DEMO_MODE === "1"

  // 데모 모드에서는 로그인/과금 로직을 우회하고 리포트 품질만 확인한다.
  const session = demoMode ? null : await auth()
  const userId = demoMode ? undefined : ((session?.user as any)?.id as string | undefined)
  if (!demoMode && !userId) {
    return new Response("UNAUTHORIZED", { status: 401 })
  }

  const deviceId = (req.headers.get("x-device-id") ?? "").trim()
  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    ""

  const body = (await req.json()) as {
    symbol: string
  }

  const symbol = (body.symbol ?? "").trim() || "005930"

  let wasFree = true
  let costCredits = 0

  if (!demoMode) {
    // 크레딧/무료1회 정책
    const REPORT_COST = 10
    const today = new Date()
    const day = today.toISOString().slice(0, 10) // YYYY-MM-DD

    const deviceIdHash = deviceId
      ? crypto.createHash("sha256").update(deviceId).digest("hex")
      : ""

    const creditRow =
      (await db.query.userCredits.findFirst({
        where: eq(userCredits.userId, userId!),
      })) ?? null

    // 첫 로그인/마이그레이션 대비: row 없으면 생성
    if (!creditRow) {
      await db
        .insert(userCredits)
        .values({ userId: userId!, balance: 0, freeReportUsed: false })
        .onConflictDoNothing()
    }

    const afterCreditRow =
      creditRow ??
      (await db.query.userCredits.findFirst({
        where: eq(userCredits.userId, userId!),
      }))

    if (!afterCreditRow) {
      return new Response("CREDIT_ROW_INIT_FAILED", { status: 500 })
    }

    wasFree = false
    costCredits = 0

    if (!afterCreditRow.freeReportUsed) {
      // 악용 방지 1) 디바이스 1회 제한
      if (deviceIdHash) {
        const existingDevice = await db.query.deviceFreeClaims.findFirst({
          where: eq(deviceFreeClaims.deviceIdHash, deviceIdHash),
        })
        if (existingDevice && existingDevice.firstUserId && existingDevice.firstUserId !== userId) {
          if (afterCreditRow.balance < REPORT_COST) {
            return new Response("FREE_ALREADY_USED_ON_DEVICE", { status: 403 })
          }
        }
      }

      // 악용 방지 2) IP 일일 무료 발급 상한
      if (ip) {
        const ipRow = await db.query.ipDailyFreeClaims.findFirst({
          where: and(eq(ipDailyFreeClaims.ip, ip), eq(ipDailyFreeClaims.day, day as any)),
        })
        if (ipRow && ipRow.count >= 5) {
          if (afterCreditRow.balance < REPORT_COST) {
            return new Response("FREE_LIMIT_REACHED", { status: 429 })
          }
        }
      }

      wasFree = true
      costCredits = 0

      await db.transaction(async (tx) => {
        await tx
          .update(userCredits)
          .set({ freeReportUsed: true, updatedAt: new Date() })
          .where(eq(userCredits.userId, userId!))

        await tx.insert(creditLedger).values({
          userId: userId!,
          delta: 0,
          reason: "FREE_REPORT",
          metadata: { symbol },
        })

        if (deviceIdHash) {
          await tx
            .insert(deviceFreeClaims)
            .values({
              deviceIdHash,
              firstUserId: userId!,
              firstIp: ip || null,
              userAgent: req.headers.get("user-agent"),
            })
            .onConflictDoNothing()
        }

        if (ip) {
          const existing = await tx.query.ipDailyFreeClaims.findFirst({
            where: and(eq(ipDailyFreeClaims.ip, ip), eq(ipDailyFreeClaims.day, day as any)),
          })
          if (!existing) {
            await tx.insert(ipDailyFreeClaims).values({ ip, day: day as any, count: 1 })
          } else {
            await tx
              .update(ipDailyFreeClaims)
              .set({ count: existing.count + 1, updatedAt: new Date() })
              .where(and(eq(ipDailyFreeClaims.ip, ip), eq(ipDailyFreeClaims.day, day as any)))
          }
        }
      })
    } else {
      if (afterCreditRow.balance < REPORT_COST) {
        return new Response("INSUFFICIENT_CREDITS", { status: 402 })
      }
      wasFree = false
      costCredits = REPORT_COST

      await db.transaction(async (tx) => {
        await tx
          .update(userCredits)
          .set({ balance: afterCreditRow.balance - REPORT_COST, updatedAt: new Date() })
          .where(eq(userCredits.userId, userId!))
        await tx.insert(creditLedger).values({
          userId: userId!,
          delta: -REPORT_COST,
          reason: "REPORT_SPEND",
          metadata: { symbol },
        })
      })
    }
  }

  const company = await getCompanyRaw(symbol)

  // DB에 시세가 있으면(도커/네온) 최근 가격/지표 요약을 프롬프트에 포함
  let priceSnippet = ""
  try {
    const bars = await db
      .select()
      .from(dailyStats)
      .where(eq(dailyStats.symbol, symbol))
      .orderBy(desc(dailyStats.day))
      .limit(30)

    if (bars.length >= 5) {
      const latest = bars[0]!
      const closes = bars
        .map((b) => Number(b.close ?? 0))
        .filter((v) => Number.isFinite(v) && v > 0)
        .reverse()
      const lastClose = closes[closes.length - 1] ?? 0
      const firstClose = closes[0] ?? lastClose
      const change = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0
      const rsi14 = (latest.indicators as any)?.rsi14
      const macd = (latest.indicators as any)?.macd
      const macdHist = (latest.indicators as any)?.macdHist

      priceSnippet = `
[최근 가격/기술 지표 (DB)]
- 최근 30거래일 기준 종가 변화: ${change.toFixed(2)}%
- 최신 종가(${String(latest.day)}): ${Number(latest.close ?? 0).toLocaleString()} (거래량: ${(latest.volume ?? 0).toLocaleString()})
- RSI(14): ${typeof rsi14 === "number" ? rsi14.toFixed(2) : "n/a"}
- MACD: ${typeof macd === "number" ? macd.toFixed(4) : "n/a"} (hist: ${typeof macdHist === "number" ? macdHist.toFixed(4) : "n/a"})
`
    }
  } catch {
    // ignore
  }

  const latestQuarter = company.quarterly[0]
  const latestFinancialSummary = latestQuarter
    ? `최근 분기(${latestQuarter.period}) 매출 ${Math.round(
        latestQuarter.revenue / 1_000_000_000,
      )}억, 영업이익 ${Math.round(
        latestQuarter.operatingIncome / 1_000_000_000,
      )}억, 순이익 ${Math.round(
        latestQuarter.netIncome / 1_000_000_000,
      )}억, EPS ${latestQuarter.eps.toLocaleString()}원`
    : "최근 분기 재무 데이터 부족"

  const recentNewsAndDarts = [
    ...company.disclosures.map((d) => {
      const meta: string[] = []
      if (d.category) meta.push(`카테고리: ${d.category}`)
      if (typeof d.epsImpactScore === "number") {
        meta.push(`EPS 영향 추정 점수: ${d.epsImpactScore}/10`)
      }
      if (d.sentiment) meta.push(`톤: ${d.sentiment}`)
      const metaStr = meta.length ? ` (${meta.join(" · ")})` : ""
      return `- [공시] (${d.date}) ${d.title}${metaStr} — ${d.summary} [출처: ${d.source}]`
    }),
    ...company.news.map((n) => {
      const meta: string[] = []
      if (typeof n.sentimentScore === "number") {
        meta.push(`감성 점수: ${n.sentimentScore.toFixed(2)}`)
      }
      if (n.topicTags?.length) {
        meta.push(`태그: ${n.topicTags.join(", ")}`)
      }
      const metaStr = meta.length ? ` (${meta.join(" · ")})` : ""
      return `- [뉴스] (${n.date}) ${n.title}${metaStr} — ${n.summary} [출처: ${n.source}]`
    }),
  ].join("\n")

  const prompt = `
너는 '골드만삭스' 혹은 '미래에셋' 출신의 수석 애널리스트다.
단순 정보 나열이 아니라, 정량·정성 데이터를 결합해 기업의 미래 가치와 리스크를 논리적으로 추론하는 리포트를 작성해야 한다.
투자 권유 멘트(매수/매도, 추천, 적정주가 제시 등)는 절대 쓰지 말고, 의사결정에 필요한 인과관계와 체크포인트만 설명하라.

[기업 기본 정보]
- 기업명: ${company.profile.name}
- 종목 코드: ${company.profile.symbol}
- 업종: ${company.profile.sector}
- 시가총액: 약 ${Math.round(
    company.profile.marketCap / 1_000_000_000_000,
  )}조원 (${company.profile.currency})
- 최근 분기 핵심 재무: ${latestFinancialSummary}
${priceSnippet}

[최근 분기/연간 재무 데이터(요약)]
${company.quarterly
  .map(
    (q) =>
      `- ${q.period}: 매출 ${Math.round(
        q.revenue / 1_000_000_000,
      )}억, 영업이익 ${Math.round(
        q.operatingIncome / 1_000_000_000,
      )}억, 순이익 ${Math.round(
        q.netIncome / 1_000_000_000,
      )}억, EPS ${q.eps.toLocaleString()}원`,
  )
  .join("\n")}

연간 데이터:
${company.yearly
  .map(
    (y) =>
      `- ${y.year}년: 매출 ${Math.round(
        y.revenue / 1_000_000_000,
      )}억, 영업이익 ${Math.round(
        y.operatingIncome / 1_000_000_000,
      )}억, 순이익 ${Math.round(
        y.netIncome / 1_000_000_000,
      )}억, ROE ${y.roe.toFixed(1)}%`,
  )
  .join("\n")}

[최신 공시/뉴스 데이터]
${recentNewsAndDarts || "- 최신 공시/뉴스 데이터 부족"}

[분석 원칙]
1. 정량적 데이터(수익성, 마진, ROE 등 재무지표)와 정성적 데이터(뉴스, 공시)를 반드시 **교차 분석(Cross-Analysis)** 하라.
   - 예: "HBM CAPEX 확대" 뉴스가 있으면, 메모리 사이클과 투자 집행이 향후 손익계산서와 현금흐름에 어떤 시차를 두고 영향을 줄지까지 연결해서 설명한다.
2. "불확실하다"라는 표현 대신, "향후 시장의 기대치", "하방 리스크 요인", "업황 민감도" 같은 형태로 구체화해서 설명하라.
3. 유료 사용자가 궁금해하는 핵심 질문은 **"그래서 이 공시/뉴스가 내일~향후 3~6개월 주가에 어떤 방향성 신호를 주는가?"** 이다. 이 질문에 답하는 문장을 각 섹션에 녹여라.
4. 투자자가 실제 의사결정을 내릴 수 있도록, 리포트 상단에 '핵심 요약(Key Takeaways)'을 반드시 포함하라.
5. 모든 리포트는 Markdown 형식으로 작성하고, 섹션/리스트/강조(굵게)를 적극 활용해 시각적으로 전문성 있게 구성하라.

[공시/뉴스 심각도 및 EPS 영향 평가]
- 각 주요 공시/뉴스에 대해 다음을 포함하라:
  - 이 이슈가 기업의 주당순이익(EPS)에 미칠 영향력을 1~10점 사이로 평가 (1: 거의 영향 없음, 10: 구조적으로 큰 영향).
  - 왜 그런 점수를 부여했는지 한 문장으로 요약.
  - **[호재 / 악재 / 중립]** 중 하나로 분류.

[수익성 분석의 깊이]
- 단순 매출 규모나 증가 여부보다, 영업이익률과 순이익률의 변화 방향에 주목하라.
- 최근 분기와 과거 분기/연간 데이터를 비교해 마진이 개선/악화되는지 설명하라.
- 판관비나 원가율 변동이 시사하는 바를 해석하되, 일회성 요인일 가능성과 구조적 변화 가능성을 구분해서 설명하라.
- 현금흐름 데이터가 없더라도, 실적 패턴과 업황을 기반으로 현금창출력의 안정성/변동성을 추론하라.

[요청 리포트 구조]
아래 섹션 제목과 순서를 그대로 사용하고, 각 섹션은 Markdown 헤딩으로 표현하라.

1. Executive Summary
   - 현재 이 기업을 관통하는 가장 중요한 키워드 3가지를 불릿 포인트로 제시하라.
   - 각 키워드마다, 재무 데이터와 뉴스/공시를 근거로 "왜 지금 이 키워드가 중요한지" 인과관계를 설명하라.
   - 마지막에 **Key Takeaways** 하위 섹션을 만들고, 유료 사용자가 바로 이해할 수 있는 3~5개의 핵심 포인트를 정리하되,
     - "그래서 단기/중기 주가 방향에 어떤 신호인가?"라는 관점에서 문장을 작성하라.

2. 사업 현황 분석 (재무 관점)
   - 최근 분기 및 연간 실적을 바탕으로, 매출 성장성·영업이익률·순이익률 추이를 숫자로 설명하라.
   - 업황(예: 메모리 사이클, 소비 경기, 규제 등)을 고려했을 때 현재 수익성이 "정상 수준/과도하게 높음/압박받는 중" 중 어디에 가까운지 논리적으로 판단하라.
   - ROE, 이익 체력, 투자 여력을 함께 언급해, 자본 효율성과 재투자 여지를 평가하라.

3. 모멘텀 분석 (공시/뉴스 인과관계)
   - 최신 공시/뉴스를 하나씩 훑으며, 각각이 향후 주가와 실적에 줄 수 있는 긍정적/부정적 영향을 상세히 설명하라.
   - 단기 이벤트(예: 일회성 비용, 단기 실적 쇼크)와 중장기 방향성을 바꾸는 이슈(예: 대규모 CAPEX, 신사업, 규제 변화)를 구분해 서술하라.
   - 각 공시/뉴스에 대해:
     - EPS 영향력 점수 (1~10점) — 데이터에 제공된 epsImpactScore가 있으면 이를 활용하라.
     - 호재/악재/중립 분류 — sentiment, sentimentScore를 참고하되, 네가 재판단해도 좋다.
     - 핵심 논리 1~2문장
   - 알림 시스템에 들어갈 수 있도록, "**[요약 알림 문구]**" 형식의 한 줄 설명을 함께 작성하라.

4. AI 이슈 타임라인 & 연결 분석
   - 최근 3~5개의 핵심 공시/뉴스를 시간 순으로 나열하고, 서로 어떤 **이슈 클러스터**를 형성하는지 설명하라.
   - 예를 들어 "HBM CAPEX 확대" 뉴스와 "실적 호조 공시"가 함께 있을 경우,
     - 설비투자→생산능력 확대→향후 매출/마진에 미칠 수 있는 영향까지 하나의 **스토리라인**으로 묶어라.
   - "뉴스/공시에서는 호재가 많은데, 재무제표에는 아직 반영되지 않은 구간"이나
     "악재성 뉴스가 나오지만 실적은 아직 견조한 구간" 등 **다이버전스(괴리)** 가 있는지 찾고,
     - 있다면 왜 그런지, 시장의 기대치와 어떤 긴장이 있는지 설명하라.

5. 기관/외인 수급과의 상관관계 (데이터 가정)
   - 실제 수급 데이터가 제공되지 않은 경우, "현재 수급 데이터는 제공되지 않음"을 명시하되,
     - 공시/뉴스의 성격과 과거 유사 이벤트에서의 전형적인 수급 패턴을 기반으로, **합리적인 시나리오**를 제시하라.
   - 만약 향후에 일별 수급 데이터(기관/외인 순매수)가 제공된다고 가정했을 때,
     - "이런 유형의 공시/뉴스 이후, 기관/외인의 매매 패턴이 어떻게 달라지는지"를 체크해야 하는지 논리적으로 제안하라.
   - 예시 형식:
     - "이 유형의 실적/배당 공시는 과거 사례에서 기관의 저점 매수 유입과 동행하는 경우가 많았으며, 이번에도 비슷한 패턴이 나온다면 ○○ 구간이 기관의 관심 가격대로 해석될 수 있다."

6. AI 종합 전망 (보수적/낙관적 시나리오)
   - 보수적 시나리오와 낙관적 시나리오를 나누어, 각각 어떤 전제(매출 성장, 마진 수준, 업황, 정책 등)에 기반하는지 명시하라.
   - 각 시나리오에서 예상되는 재무 궤적(성장률 방향, 마진 레벨 변화, 배당 여력 등)을 서술하되, 숫자는 범위/레벨 중심으로 설명하라.
   - "어떤 데이터가 추가로 나와야 시나리오가 강화/약화되는지"를 체크포인트 형태로 정리하라.

7. 리스크 체크 (대외 변수 중심)
   - 금리, 환율, 원자재 가격, 업황 사이클, 경쟁 심화, 규제/정책 등 외부 변수를 중심으로 리스크를 구조화해 설명하라.
   - 각 리스크 요인별로, 회사의 취약도(낮음/보통/높음)를 평가하고 그 근거를 제시하라.
   - 마지막 문단에는 반드시 다음과 유사한 문장을 포함하라:
     "이 리포트는 과거 및 공개된 데이터를 기반으로 한 특징 설명일 뿐, 향후 주가나 실적을 보장하지 않습니다."

Markdown으로 위 구조에 맞는 리포트를 작성하라.
`

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    stream: true,
    messages: [
      {
        role: "system",
        content:
          "너는 한국 상장기업을 분석하는 수석 애널리스트다. 투자 권유는 금지되며, 정량·정성 데이터를 결합한 논리적 인과관계 설명과 리스크 정리가 핵심이다.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  })

  const encoder = new TextEncoder()
  let fullText = ""

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            fullText += content
            controller.enqueue(encoder.encode(content))
          }
        }

        // 생성 완료 후 저장 (스트리밍 UX 유지)
        if (!demoMode) {
          await db.insert(reports).values({
            userId: userId!,
            symbol,
            costCredits,
            wasFree,
            promptVersion: "v1",
            model: "gpt-4o-mini",
            markdown: fullText,
            meta: { ip: ip || null },
          })
        }

        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}


