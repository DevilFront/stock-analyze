"use client"

import type { DisclosureItem, NewsItem } from "@/app/_lib/company-api"
import { cn } from "@/lib/utils"
import { FileText, Newspaper } from "lucide-react"

type TimelineItem = {
  id: string
  date: string
  title: string
  summary: string
  type: "disclosure" | "news"
  sentiment: "positive" | "negative" | "neutral"
}

function normalizeSentiment(
  d: DisclosureItem | NewsItem
): "positive" | "negative" | "neutral" {
  if ("sentiment" in d && d.sentiment) return d.sentiment
  if ("sentimentScore" in d && typeof d.sentimentScore === "number") {
    if (d.sentimentScore > 0.15) return "positive"
    if (d.sentimentScore < -0.15) return "negative"
  }
  return "neutral"
}

function toTimelineItems(
  disclosures: DisclosureItem[],
  news: NewsItem[]
): TimelineItem[] {
  const fromDisclosures: TimelineItem[] = disclosures.slice(0, 8).map((d) => ({
    id: d.id,
    date: d.date,
    title: d.title,
    summary: d.summary,
    type: "disclosure",
    sentiment: normalizeSentiment(d),
  }))
  const fromNews: TimelineItem[] = news.slice(0, 5).map((n) => ({
    id: n.id,
    date: n.date,
    title: n.title,
    summary: n.summary,
    type: "news",
    sentiment: normalizeSentiment(n),
  }))
  const merged = [...fromDisclosures, ...fromNews].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
  return merged.slice(0, 10)
}

type Props = {
  disclosures: DisclosureItem[]
  news: NewsItem[]
  className?: string
}

export function MomentumTimeline({ disclosures, news, className }: Props) {
  const items = toTimelineItems(disclosures, news)

  return (
    <div className={cn("space-y-0", className)}>
      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        <span>모멘텀 · 호재/악재 타임라인</span>
      </div>
      <div className="relative border-l border-slate-700/80 pl-4">
        {items.map((item, i) => (
          <div
            key={item.id}
            className={cn(
              "relative pb-6 last:pb-0",
              i > 0 && "pt-0"
            )}
          >
            {/* dot */}
            <span
              className={cn(
                "absolute left-0 top-0.5 h-2.5 w-2.5 -translate-x-[calc(0.5rem+5px)] rounded-full border-2 border-slate-900",
                item.sentiment === "positive" && "bg-emerald-500",
                item.sentiment === "negative" && "bg-rose-500",
                item.sentiment === "neutral" && "bg-slate-500"
              )}
            />
            <div className="flex gap-2 text-xs">
              <span className="shrink-0 font-medium tabular-nums text-slate-500">
                {item.date}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  {item.type === "disclosure" ? (
                    <FileText className="h-3 w-3 shrink-0 text-sky-400" />
                  ) : (
                    <Newspaper className="h-3 w-3 shrink-0 text-amber-400" />
                  )}
                  <span className="font-medium text-slate-200">{item.title}</span>
                </div>
                <p className="leading-relaxed text-slate-400">{item.summary}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
