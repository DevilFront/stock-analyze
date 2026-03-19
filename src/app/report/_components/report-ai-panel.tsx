"use client"

import { useState, useRef, useEffect, isValidElement } from "react"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { fetchCompanyReport } from "@/app/_lib/company-api"
import type { CompanyRawResponse } from "@/app/_lib/company-api"
import { AnalysisLoading } from "@/app/_components/analysis-loading"
import { calculateIssueScore } from "../_lib/issue-score"
import { EpsGauge } from "./eps-gauge"
import { MomentumTimeline } from "./momentum-timeline"
import {
  FileCheck2,
  TrendingUp,
  Activity,
  GitBranch,
  BarChart3,
  AlertTriangle,
  Target,
  Gauge,
} from "lucide-react"

type Props = {
  symbol: string
  companyData?: CompanyRawResponse | null
  onReportGenerated?: () => void
  showTimelineBeforeGenerate?: boolean
}

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "executive summary": FileCheck2,
  "key takeaways": FileCheck2,
  "이슈 반응 통계": Activity,
  "사업 현황": TrendingUp,
  "재무": BarChart3,
  "모멘텀": Activity,
  "모멘텀 분석": Activity,
  "ai 이슈 타임라인": GitBranch,
  "기관": BarChart3,
  "수급": BarChart3,
  "종합 전망": Target,
  "리스크": AlertTriangle,
}

function getSectionIcon(title: string) {
  const key = String(title).toLowerCase().trim()
  for (const [k, Icon] of Object.entries(SECTION_ICONS)) {
    if (key.includes(k) || key.startsWith(k)) return Icon
  }
  return FileCheck2
}

function flattenMarkdownChildren(children: React.ReactNode): string {
  if (typeof children === "string") return children
  if (Array.isArray(children)) return children.map(flattenMarkdownChildren).join("")
  if (children && isValidElement(children)) {
    const next = (children as React.ReactElement<{ children?: React.ReactNode }>).props?.children
    return next != null ? flattenMarkdownChildren(next) : ""
  }
  return ""
}

export function ReportAiPanel({
  symbol,
  companyData,
  onReportGenerated,
  showTimelineBeforeGenerate = false,
}: Props) {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasReportedGenerated = useRef(false)
  const normalizedText = normalizeReportMarkdown(text)

  useEffect(() => {
    if (!loading && text.length > 0 && onReportGenerated && !hasReportedGenerated.current) {
      hasReportedGenerated.current = true
      onReportGenerated()
    }
  }, [loading, text, onReportGenerated])

  const handleGenerate = async () => {
    hasReportedGenerated.current = false
    setLoading(true)
    setError(null)
    setText("")

    try {
      const stream = await fetchCompanyReport(symbol)
      const reader = stream.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setText((prev) => prev + chunk)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "AI 리포트 생성 중 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    if (!text) return
    window.print()
  }

  const epsScore = companyData?.disclosures?.find((d) => typeof d.epsImpactScore === "number")
    ?.epsImpactScore ?? null
  const avgEps =
    companyData?.disclosures?.filter((d) => typeof d.epsImpactScore === "number").length
      ? (companyData.disclosures
          .filter((d) => typeof d.epsImpactScore === "number")
          .reduce((s, d) => s + (d.epsImpactScore ?? 0), 0) /
          companyData.disclosures.filter((d) => typeof d.epsImpactScore === "number").length)
      : null
  const displayEps = avgEps ?? epsScore ?? null
  const moveStats = getIssueMoveStats(companyData)

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900/90 p-5 text-sm text-slate-100 shadow-xl">
      {/* 헤더: 액션만 (기업명/종목/날짜는 상단 ReportHeader에서) */}
      <div className="mb-4 flex items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">
            AI 인사이트 리포트
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            공시 · 실적 · 뉴스 데이터를 교차 분석한 기관 리포트 스타일의 분석입니다.
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-slate-700 bg-slate-900/60 text-[11px] text-slate-200 hover:bg-slate-800"
              onClick={handlePrint}
              disabled={!text}
            >
              PDF로 내보내기
            </Button>
            <Button
              size="sm"
              className="bg-sky-500 text-[11px] font-semibold text-slate-950 hover:bg-sky-400"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? "생성 중..." : "리포트 생성"}
            </Button>
          </div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
            {symbol.toUpperCase()}
          </div>
        </div>
      </div>

      {error && (
        <p className="mb-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {/* 본문: 3:7 사이드바 / 메인 */}
      <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,0.3fr)_minmax(0,0.7fr)]">
        {/* 왼쪽 사이드바 — 카드 형태 */}
        <aside className="flex flex-col gap-3 text-xs">
          <Card className="border-slate-800 bg-slate-950/50 px-3 py-3">
            <CardHeader className="p-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-400">
                <Gauge className="h-3.5 w-3.5" />
                AI 수급 점수
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-sky-400">
                  {moveStats.scoreLabel}
                </span>
                <span className="text-[11px] text-slate-500">/ 100</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-1.5 rounded-full bg-linear-to-r from-emerald-400 via-sky-400 to-amber-300"
                  style={{ width: `${moveStats.barWidth}%` }}
                />
              </div>
              <p className="mt-2 leading-relaxed text-[11px] text-slate-500">
                {moveStats.description}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-950/50 px-3 py-3">
            <CardHeader className="p-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                투자 의견
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              <p className="font-semibold text-slate-100">Hold · 데이터 기반 해석</p>
              <p className="mt-1 leading-relaxed text-[11px] text-slate-500">
                본 리포트는 매수/매도 권유가 아닌, 핵심 데이터와 인과관계 정리입니다.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-950/50 px-3 py-3">
            <CardHeader className="p-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300">
                <Target className="h-3.5 w-3.5" />
                Target Price (추정치)
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              <p className="text-lg font-bold tabular-nums text-slate-100">–</p>
              <p className="mt-1 text-[11px] text-slate-500">
                적정주가 제시는 하지 않습니다. 시나리오별 체크포인트를 참고하세요.
              </p>
            </CardContent>
          </Card>

          {companyData && displayEps != null && (
            <Card className="border-slate-800 bg-slate-950/50 px-3 py-3">
              <CardContent className="p-0">
                <EpsGauge value={displayEps} label="EPS 영향력 (공시)" />
              </CardContent>
            </Card>
          )}
        </aside>

        {/* 오른쪽 메인: 섹션별 카드 + 타임라인 */}
        <main className="flex min-h-0 flex-col gap-4">
          <div className="flex-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60">
            {text ? (
              <div className="report-body report-prose min-h-0 px-4 py-4 text-sm">
                <ReactMarkdown
                  components={{
                    h1: ({ children, ...props }) => {
                      const title = flattenMarkdownChildren(children)
                      const Icon = getSectionIcon(title)
                      return (
                        <div className="mb-3 mt-6 border-b border-slate-700/80 pb-2 first:mt-0">
                          <h1
                            className="flex items-center gap-2 font-serif text-xl font-semibold text-slate-50"
                            {...props}
                          >
                            <Icon className="h-5 w-5 shrink-0 text-sky-400/90" />
                            {children}
                          </h1>
                        </div>
                      )
                    },
                    h2: ({ children, ...props }) => {
                      const title = flattenMarkdownChildren(children)
                      const Icon = getSectionIcon(title)
                      return (
                        <div className="mb-3 mt-6 border-b border-slate-700/80 pb-2 first:mt-0">
                          <h2
                            className="flex items-center gap-2 font-serif text-lg font-semibold text-slate-50"
                            {...props}
                          >
                            <Icon className="h-5 w-5 shrink-0 text-sky-400/90" />
                            {children}
                          </h2>
                        </div>
                      )
                    },
                    h3: ({ children, ...props }) => (
                      <h3
                        className="mb-2 mt-4 text-sm font-semibold text-slate-200"
                        {...props}
                      >
                        {children}
                      </h3>
                    ),
                    p: ({ children, ...props }) => (
                      <p
                        className="mb-4 leading-[1.65] text-slate-100 last:mb-0"
                        {...props}
                      >
                        {children}
                      </p>
                    ),
                    strong: ({ children, ...props }) => (
                      <strong className="font-bold text-cyan-200" {...props}>
                        {children}
                      </strong>
                    ),
                    table: ({ children, ...props }) => (
                      <div className="my-4 overflow-x-auto rounded-lg border border-slate-700/60">
                        <table
                          className="w-full border-collapse text-xs"
                          {...props}
                        >
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children, ...props }) => (
                      <thead {...props}>
                        <tr className="border-b border-slate-700 bg-slate-800/80">
                          {children}
                        </tr>
                      </thead>
                    ),
                    th: ({ children, ...props }) => (
                      <th
                        className="px-3 py-2 text-left font-semibold text-slate-200"
                        {...props}
                      >
                        {children}
                      </th>
                    ),
                    td: ({ children, ...props }) => (
                      <td
                        className="border-b border-slate-800/80 px-3 py-2 text-slate-300"
                        {...props}
                      >
                        {children}
                      </td>
                    ),
                    tr: ({ children, ...props }) => (
                      <tr className="border-b border-slate-800/50" {...props}>
                        {children}
                      </tr>
                    ),
                    ul: ({ children, ...props }) => (
                      <ul
                        className="mb-4 list-disc space-y-1.5 pl-5 leading-[1.65] text-slate-100 [&>li]:mb-0.5"
                        {...props}
                      >
                        {children}
                      </ul>
                    ),
                    ol: ({ children, ...props }) => (
                      <ol
                        className="mb-4 list-decimal space-y-1.5 pl-5 leading-[1.65] text-slate-100 [&>li]:mb-0.5"
                        {...props}
                      >
                        {children}
                      </ol>
                    ),
                  }}
                >
                  {normalizedText}
                </ReactMarkdown>
              </div>
            ) : loading ? (
              <div className="px-4 py-6">
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
                  실시간 수집 및 리포트 생성 중
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  종목 데이터 수집 → DB 반영 → 비교 분석 → 리포트 작성 순서로 진행됩니다.
                </p>
                <AnalysisLoading />
              </div>
            ) : (
              <div className="flex flex-col gap-4 px-4 py-6">
                <p className="leading-relaxed text-slate-500">
                  상단의 &quot;리포트 생성&quot; 버튼을 누르면, 공시·실적·뉴스를 교차 분석한
                  기관 리포트 스타일의 Markdown 분석이 이 영역에 표시됩니다.
                </p>
                {showTimelineBeforeGenerate &&
                  companyData &&
                  (companyData.disclosures.length > 0 || companyData.news.length > 0) && (
                  <Card className="border-slate-800 bg-slate-900/50 p-4">
                    <MomentumTimeline
                      disclosures={companyData.disclosures}
                      news={companyData.news}
                    />
                  </Card>
                )}
              </div>
            )}
          </div>

          {/* 타임라인 위치는 상위 컨테이너에서 제어 (ReportPageContent) */}
        </main>
      </div>
    </div>
  )
}

function normalizeReportMarkdown(input: string): string {
  // 모델이 종종 헤딩을 마크다운(#)이 아닌 "1. Executive Summary" 같은 일반 텍스트로 출력함.
  // 렌더링 스타일이 깨지지 않도록 흔한 패턴을 헤딩으로 정규화한다.
  const lines = String(input ?? "").split("\n")
  const out: string[] = []
  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\.\s+(.+?)\s*$/)
    if (m) {
      out.push(`## ${m[2]}`)
      continue
    }
    const m2 = line.match(/^\s*[-*]{0,2}\s*Key Takeaways\s*$/i)
    if (m2) {
      out.push(`### Key Takeaways`)
      continue
    }
    out.push(line)
  }
  return out.join("\n")
}

function getIssueMoveStats(companyData?: CompanyRawResponse | null): {
  score: number | null
  scoreLabel: string
  barWidth: number
  description: string
} {
  const calculated = calculateIssueScore(companyData?.issueMoves)
  if (!calculated.total) {
    return {
      score: null,
      scoreLabel: "–",
      barWidth: 0,
      description: "이슈 급등락 데이터가 아직 없어 점수를 계산할 수 없습니다.",
    }
  }

  return {
    score: calculated.score,
    scoreLabel: calculated.scoreLabel,
    barWidth: calculated.barWidth,
    description: `최근 라벨 ${calculated.total}건 기준 (급등 ${calculated.surgeRate.toFixed(1)}% / 급락 ${calculated.dropRate.toFixed(1)}%).`,
  }
}
