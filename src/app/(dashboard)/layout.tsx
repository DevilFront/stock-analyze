import type { ReactNode } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const sidebarItems = [
  { href: "/history", label: "내 분석 이력" },
  { href: "/trending", label: "인기 급등 종목" },
  { href: "/account", label: "마이페이지" },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-64 flex-col border-r border-slate-800 bg-slate-950/80 px-4 py-6">
        <div className="mb-8">
          <span className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            STOCK ANALYZE
          </span>
          <p className="mt-1 text-xs text-slate-500">
            AI 기반 수급·매집 분석
          </p>
        </div>
        <nav className="space-y-1 text-sm">
          {sidebarItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-50"
              )}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-6 text-xs text-slate-500">
          실시간 데이터는 실제 증권사 API와 다를 수 있습니다.
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/70 px-6 py-4 backdrop-blur">
          <div className="text-sm text-slate-400">
            스마트한 수급 분석으로 리스크를 줄이세요.
          </div>
          <Button variant="outline" size="sm" className="border-slate-700">
            베타 버전
          </Button>
        </header>
        <main className="flex-1 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  )
}

