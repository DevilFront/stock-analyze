"use client"

import { useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import type { CompanyRawResponse } from "@/app/_lib/company-api"
import { ReportAiPanel } from "./report-ai-panel"
import { SankeyFlowChart } from "./sankey-flow-chart"
import { RadarCapabilityChart } from "./radar-capability-chart"
import { WaterfallProfitChart } from "./waterfall-profit-chart"
import { MomentumTimeline } from "./momentum-timeline"
import {
  getFinancialFlow,
  getCapabilityScores,
  getWaterfallData,
} from "../_lib/chart-data"
import { Lock } from "lucide-react"

function SimpleMetricBars({ data }: { data: CompanyRawResponse }) {
  const quarters = [...data.quarterly].slice(0, 4).reverse()
  const maxRevenue = Math.max(...quarters.map((q) => q.revenue))
  const maxNet = Math.max(...quarters.map((q) => q.netIncome))

  return (
    <Card className="h-full border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
        재무/실적 간단 차트
      </div>
      <div className="mb-4 text-xs text-slate-400">
        막대 길이는 상대적인 크기만 표현합니다. (예시 데이터 기준)
      </div>
      <div className="space-y-3">
        {quarters.map((q) => {
          const revWidth =
            maxRevenue > 0 ? Math.max(6, (q.revenue / maxRevenue) * 100) : 0
          const netWidth =
            maxNet > 0 ? Math.max(6, (q.netIncome / maxNet) * 100) : 0
          return (
            <div key={q.period} className="space-y-1 text-[11px]">
              <div className="flex items-center justify-between text-slate-300">
                <span>{q.period}</span>
                <span className="text-slate-500">
                  매출{" "}
                  {Math.round(q.revenue / 1_0000_0000).toLocaleString()}조 /
                  순이익{" "}
                  {Math.round(q.netIncome / 1_0000_0000).toLocaleString()}조
                </span>
              </div>
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-slate-800">
                  <div
                    className="h-1.5 rounded-full bg-sky-500/80"
                    style={{ width: `${revWidth}%` }}
                  />
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800">
                  <div
                    className="h-1.5 rounded-full bg-emerald-400/80"
                    style={{ width: `${netWidth}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

type Props = {
  symbol: string
  data: CompanyRawResponse
}

export function ReportPageContent({ symbol, data }: Props) {
  const [reportGenerated, setReportGenerated] = useState(false)

  const onReportGenerated = useCallback(() => {
    setReportGenerated(true)
  }, [])

  return (
    <>
      <section className="border-t border-slate-800/80 pt-6">
        <ReportAiPanel
          symbol={symbol}
          companyData={data}
          onReportGenerated={onReportGenerated}
          showTimelineBeforeGenerate={false}
        />
      </section>

      {reportGenerated && (data.disclosures.length > 0 || data.news.length > 0) && (
        <section className="border-t border-slate-800/80 pt-6">
          <Card className="border-slate-800 bg-slate-900/50 p-4">
            <MomentumTimeline disclosures={data.disclosures} news={data.news} />
          </Card>
        </section>
      )}

      {/* 하단 패널: 리포트 생성 전에는 블러 + 안내 메시지 */}
      <section className="relative border-t border-slate-800/80 pt-6">
        <div
          className={`transition-all duration-500 ${
            reportGenerated ? "blur-0 opacity-100" : "pointer-events-none select-none blur-md opacity-60"
          }`}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <SimpleMetricBars data={data} />
            </div>

            <Card className="border border-slate-800 bg-slate-900/70 p-4 text-xs text-slate-200">
              <div className="mb-3 border-b border-slate-700/80 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                최근 공시
              </div>
              {data.disclosures.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  아직 공시 데이터가 없습니다. (DART 적재 후 표시됩니다)
                </p>
              ) : (
                <div className="max-h-[360px] space-y-4 overflow-y-auto pr-1">
                  {data.disclosures.slice(0, 12).map((d) => (
                    <div key={d.id} className="space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 text-[13px] font-medium text-slate-50">
                          <div className="truncate">{d.title}</div>
                          {d.category && (
                            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                              {d.category}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">
                          {d.date}
                        </span>
                      </div>
                      {d.summary ? (
                        <p className="leading-relaxed text-[11px] text-slate-400">
                          {d.summary}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          요약은 아직 없습니다. (다음 단계에서 자동 요약/분류 가능)
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="border border-slate-800 bg-slate-900/70 p-4 text-xs text-slate-200">
              <div className="mb-3 border-b border-slate-700/80 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                주요 뉴스
              </div>
              {data.news.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  아직 뉴스 데이터가 없습니다. (RSS/뉴스 API 적재 후 표시됩니다)
                </p>
              ) : (
                <div className="max-h-[360px] space-y-4 overflow-y-auto pr-1">
                  {data.news.slice(0, 10).map((n) => (
                    <div key={n.id} className="space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 text-[13px] font-medium text-slate-50">
                          <div className="truncate">{n.title}</div>
                          {n.topicTags?.length ? (
                            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                              {n.topicTags.slice(0, 3).join(" · ")}
                            </div>
                          ) : null}
                        </div>
                        <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">
                          {n.date}
                        </span>
                      </div>
                      {n.summary ? (
                        <p className="leading-relaxed text-[11px] text-slate-400">
                          {n.summary}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* 전문 시각화: Sankey / Radar / Waterfall */}
          <div className="mt-6 grid gap-4 border-t border-slate-700/60 pt-6 lg:grid-cols-3">
            {getFinancialFlow(data) && (
              <Card className="border-slate-800 bg-slate-900/60 p-4">
                <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  현금 흐름 (Sankey)
                </h3>
                <SankeyFlowChart data={getFinancialFlow(data)!} />
              </Card>
            )}
            <Card className="border-slate-800 bg-slate-900/60 p-4">
              <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                종합 평가 (Radar)
              </h3>
              <RadarCapabilityChart {...getCapabilityScores(data)} />
            </Card>
            {getWaterfallData(data) && (
              <Card className="border-slate-800 bg-slate-900/60 p-4">
                <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  수익 변동 (Waterfall)
                </h3>
                <WaterfallProfitChart data={getWaterfallData(data)!} />
              </Card>
            )}
          </div>
        </div>

        {!reportGenerated && (
          <div
            className="absolute inset-0 flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-700/80 bg-slate-900/40 pt-6"
            aria-hidden
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80">
              <Lock className="h-5 w-5 text-slate-500" />
            </div>
            <p className="text-center text-sm font-medium text-slate-400">
              리포트를 생성하면
              <br />
              재무 요약 · 공시·뉴스 · 현금흐름/레이더/워터폴 차트를 확인할 수 있습니다.
            </p>
            <p className="text-center text-xs text-slate-500">
              상단의 &quot;리포트 생성&quot; 버튼을 눌러주세요.
            </p>
          </div>
        )}
      </section>
    </>
  )
}
