import * as React from "react"
import { cn } from "@/lib/utils"

const variants = {
  default: "border-slate-600 bg-slate-800/80 text-slate-200",
  positive: "border-emerald-600/60 bg-emerald-500/15 text-emerald-300",
  negative: "border-rose-600/60 bg-rose-500/15 text-rose-300",
  neutral: "border-slate-500/60 bg-slate-600/20 text-slate-400",
}

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof variants
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}
