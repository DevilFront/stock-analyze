import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

type Props = {
  badgeText?: string
}

export function AnalysisLoading({ badgeText = "AI가 데이터 스캔 중..." }: Props) {
  return (
    <div className="mt-4 space-y-3">
      <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
        {badgeText}
      </div>
      <Card className="border-slate-800 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-4 w-28 bg-slate-800" />
          <Skeleton className="h-4 w-16 bg-slate-800" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20 bg-slate-800" />
            <Skeleton className="h-6 w-16 bg-slate-800" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-24 bg-slate-800" />
            <Skeleton className="h-6 w-20 bg-slate-800" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-24 bg-slate-800" />
            <Skeleton className="h-6 w-24 bg-slate-800" />
          </div>
        </div>
        <div className="mt-4 h-40 rounded-md bg-linear-to-b from-slate-900 to-slate-950">
          <div className="flex h-full items-center justify-center">
            <Skeleton className="h-24 w-3/4 bg-slate-800/70" />
          </div>
        </div>
      </Card>
    </div>
  )
}

