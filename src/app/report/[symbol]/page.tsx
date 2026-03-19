import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import type { CompanyRawResponse } from "@/app/_lib/company-api"
import { getCompanyRaw } from "@/app/_lib/company-data"
import { ReportPageContent } from "../_components/report-page-content"

type Props = {
  params: Promise<{ symbol: string }>
}

function formatWon(value: number) {
  if (!Number.isFinite(value)) return "-"
  if (value >= 1_0000_0000_0000) {
    return `${(value / 1_0000_0000_0000).toFixed(1)}조원`
  }
  if (value >= 1_0000_0000) {
    return `${(value / 1_0000_0000).toFixed(1)}억원`
  }
  return `${value.toLocaleString()}원`
}

function ReportHeader({ data }: { data: CompanyRawResponse }) {
  const reportDate = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <header className="border-b border-slate-800/80 pb-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">
            Equity Research Report
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
            {data.profile.name}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {data.profile.sector} · 시가총액{" "}
            <span className="font-semibold text-slate-200">
              {formatWon(data.profile.marketCap)}
            </span>
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-500 sm:mt-0">
          <span className="font-medium uppercase tracking-wider text-sky-400/90">
            {data.profile.symbol}
          </span>
          <span className="tabular-nums">{reportDate}</span>
        </div>
      </div>
      {data.dataQuality?.compare && (
        <div className="mt-4 rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-3 text-xs">
          <div className="mb-2 font-medium uppercase tracking-wider text-emerald-300">
            이번 요청 데이터 반영 현황
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <StatCell
              label="분기 재무"
              before={data.dataQuality.compare.before.quarterly}
              after={data.dataQuality.compare.after.quarterly}
            />
            <StatCell
              label="연간 재무"
              before={data.dataQuality.compare.before.yearly}
              after={data.dataQuality.compare.after.yearly}
            />
            <StatCell
              label="공시"
              before={data.dataQuality.compare.before.disclosures}
              after={data.dataQuality.compare.after.disclosures}
            />
            <StatCell
              label="뉴스"
              before={data.dataQuality.compare.before.news}
              after={data.dataQuality.compare.after.news}
            />
            <StatCell
              label="이슈 라벨"
              before={data.dataQuality.compare.before.issueMoves}
              after={data.dataQuality.compare.after.issueMoves}
            />
          </div>
          <div className="mt-2 text-[11px] text-emerald-200/80">
            {data.dataQuality.compare.after.latestDisclosureDay
              ? `최신 공시일: ${data.dataQuality.compare.after.latestDisclosureDay}`
              : "최신 공시일 정보 없음"}
            {" · "}
            {data.dataQuality.compare.after.latestIssueMoveDay
              ? `최신 이슈 라벨일: ${data.dataQuality.compare.after.latestIssueMoveDay}`
              : "최신 이슈 라벨일 정보 없음"}
          </div>
        </div>
      )}
    </header>
  )
}

function StatCell({
  label,
  before,
  after,
}: {
  label: string
  before: number
  after: number
}) {
  const diff = after - before
  const diffText = diff > 0 ? `+${diff}` : `${diff}`
  const diffClass =
    diff > 0 ? "text-emerald-300" : diff < 0 ? "text-amber-300" : "text-slate-400"

  return (
    <div className="rounded-md border border-emerald-900/40 bg-slate-900/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-100">
          {before} → {after}
        </span>
        <span className={`text-xs font-medium ${diffClass}`}>{diffText}</span>
      </div>
    </div>
  )
}

export default async function ReportPage({ params }: Props) {
  const { symbol: rawSymbol } = await params
  const symbol = decodeURIComponent(rawSymbol).trim()

  if (!symbol) {
    notFound()
  }

  let data: CompanyRawResponse | null = null
  let error: string | null = null

  try {
    data = await getCompanyRaw(symbol)
  } catch (e: any) {
    error =
      e?.message ??
      "기업 데이터 조회 중 오류가 발생했습니다. 서버 상태를 확인해주세요."
  }

  if (!data && error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
        <Card className="max-w-md border-red-800/60 bg-red-950/40 px-5 py-4 text-sm text-red-100">
          {error}
        </Card>
      </div>
    )
  }

  if (!data) {
    notFound()
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-950 text-slate-50">
      {/* 은은한 그리드 워터마크 배경 */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgb(148 163 184) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(148 163 184) 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative z-10 flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <ReportHeader data={data} />

        {/* 본문 + 하단 패널(리포트 생성 후 노출) */}
        <ReportPageContent symbol={symbol} data={data} />
      </div>
    </div>
  )
}

