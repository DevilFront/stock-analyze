"use client"

import type { FinancialFlow } from "../_lib/chart-data"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"

function formatTrillion(value: number) {
  const tr = value / 1_0000_0000_0000
  return `${tr >= 1 ? tr.toFixed(1) : (value / 1_0000_0000).toFixed(0)}`
}

function formatUnit(value: number) {
  return value >= 1_0000_0000_0000 ? "조" : "억"
}

type Props = {
  data: FinancialFlow
  className?: string
}

/** 매출 → … → 순이익 돈의 흐름 (가로 플로우) */
export function SankeyFlowChart({ data, className }: Props) {
  const total = data.revenue
  if (total <= 0) return null

  const steps = [
    { key: "매출", value: data.revenue, color: "cyan" },
    { key: "원가·비용", value: data.costs, color: "violet" },
    { key: "영업이익", value: data.operatingIncome, color: "cyan" },
    { key: "세금·기타", value: data.taxAndOther, color: "violet" },
    { key: "순이익", value: data.netIncome, color: "cyan" },
  ]

  return (
    <div className={cn("w-full", className)}>
      <p className="mb-3 text-xs text-slate-400">
        돈의 흐름 (당기 기준, 단위: {data.revenue >= 1_0000_0000_0000 ? "조원" : "억원"})
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {steps.map((step, i) => {
          const pct = total > 0 ? (step.value / total) * 100 : 0
          const widthPct = Math.max(10, Math.min(100, pct))
          return (
            <span key={step.key} className="flex items-center gap-1">
              <div
                className={cn(
                  "group flex flex-col rounded-lg border border-slate-600/50 bg-slate-800/60 px-2 py-1.5 transition-colors hover:border-slate-500/60 hover:bg-slate-700/60",
                  step.color === "cyan" && "border-cyan-500/30 hover:border-cyan-400/40",
                  step.color === "violet" && "border-violet-500/30 hover:border-violet-400/40",
                )}
                style={{ minWidth: 56 }}
              >
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  {step.key}
                </span>
                <span className="text-xs font-bold tabular-nums text-slate-100">
                  {formatTrillion(step.value)}
                  {formatUnit(step.value)}
                </span>
                <div
                  className={cn(
                    "mt-1 h-1.5 w-full rounded-full",
                    step.color === "cyan" && "bg-gradient-to-r from-cyan-400/80 to-cyan-500/60",
                    step.color === "violet" && "bg-gradient-to-r from-violet-400/70 to-violet-500/50",
                  )}
                  style={{ width: `${widthPct}%`, minWidth: 20 }}
                />
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              )}
            </span>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-700/50 pt-2 text-[10px] text-slate-500">
        <span>매출 {formatTrillion(data.revenue)}{formatUnit(data.revenue)}</span>
        <span className="text-cyan-400/80">→</span>
        <span>순이익 {formatTrillion(data.netIncome)}{formatUnit(data.netIncome)}</span>
      </div>
    </div>
  )
}
