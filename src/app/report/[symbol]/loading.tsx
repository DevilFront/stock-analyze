import { AnalysisLoading } from "@/app/_components/analysis-loading"

export default function Loading() {
  return (
    <div className="relative flex min-h-screen flex-col bg-slate-950 px-4 py-6 text-slate-50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">
          Equity Research Report
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
            리포트 화면 로딩 중
          </div>
          <p className="mt-3 text-sm text-slate-300">
            기본 데이터를 불러와 리포트 화면을 준비하고 있습니다.
          </p>
          <AnalysisLoading badgeText="리포트 UI 초기화 중..." />
        </div>
      </div>
    </div>
  )
}

