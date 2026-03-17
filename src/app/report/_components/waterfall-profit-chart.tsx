"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  type TooltipProps,
} from "recharts"
import type { WaterfallData } from "../_lib/chart-data"
import { cn } from "@/lib/utils"

function formatY(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_0000_0000_0000) return `${(value / 1_0000_0000_0000).toFixed(1)}조`
  return `${(value / 1_0000_0000).toFixed(0)}억`
}

function WaterfallTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 shadow-xl">
      <p className="mb-1 font-semibold text-slate-100">{p.name}</p>
      <p className="text-sm tabular-nums text-slate-200">
        {formatY(p.value)}원
      </p>
    </div>
  )
}

type Props = {
  data: WaterfallData
  className?: string
}

export function WaterfallProfitChart({ data, className }: Props) {
  const { previousOperatingIncome, steps, currentOperatingIncome, periodLabel, previousPeriodLabel } = data

  const barData = [
    { name: previousPeriodLabel, value: previousOperatingIncome, isSubtotal: true },
    ...steps.map((s) => ({ name: s.label, value: s.value, isSubtotal: false })),
    { name: periodLabel, value: currentOperatingIncome, isSubtotal: true },
  ]

  return (
    <div className={cn("h-[260px] w-full", className)}>
      <p className="mb-2 text-xs text-slate-400">
        영업이익 변동 요인 (전 분기 대비)
      </p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={barData}
          margin={{ top: 8, right: 16, bottom: 24, left: 16 }}
          barCategoryGap="20%"
        >
          <XAxis
            dataKey="name"
            tick={{ fill: "rgb(148 163 184)", fontSize: 10 }}
            tickLine={{ stroke: "rgb(71 85 105 / 0.5)" }}
            axisLine={{ stroke: "rgb(71 85 105 / 0.5)" }}
          />
          <YAxis
            tick={{ fill: "rgb(148 163 184)", fontSize: 10 }}
            tickLine={{ stroke: "rgb(71 85 105 / 0.5)" }}
            axisLine={{ stroke: "rgb(71 85 105 / 0.5)" }}
            tickFormatter={formatY}
          />
          <Tooltip content={<WaterfallTooltip />} cursor={{ fill: "rgb(51 65 85 / 0.35)" }} />
          <ReferenceLine y={0} stroke="rgb(71 85 105 / 0.6)" strokeWidth={0.5} />
          <Bar dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={36}>
            {barData.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={
                  entry.isSubtotal
                    ? "rgb(34 211 238 / 0.4)"
                    : entry.value >= 0
                      ? "rgb(34 211 238 / 0.7)"
                      : "rgb(239 68 68 / 0.6)"
                }
                stroke={entry.isSubtotal ? "rgb(34 211 238 / 0.8)" : undefined}
                strokeWidth={entry.isSubtotal ? 1 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
