"use client"

import { cn } from "@/lib/utils"

type Props = {
  /** 0 ~ 10 */
  value: number
  label?: string
  className?: string
}

export function EpsGauge({ value, label = "EPS 영향력", className }: Props) {
  const clamped = Math.min(10, Math.max(0, Number(value)))
  const pct = (clamped / 10) * 100

  const barColor =
    pct <= 33
      ? "bg-slate-500"
      : pct <= 66
        ? "bg-amber-500/80"
        : "bg-emerald-500/90"

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <span className="font-bold tabular-nums text-slate-100">
          {clamped.toFixed(1)} <span className="font-normal text-slate-500">/ 10</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn("h-2 rounded-full transition-[width] duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
