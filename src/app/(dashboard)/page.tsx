 "use client"

import { useEffect, useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AnalysisLoading } from "../_components/analysis-loading"
import { signIn, signOut, useSession } from "next-auth/react"

function ReportSearchForm() {
  const [symbol, setSymbol] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = symbol.trim()
    if (!trimmed) return
    setLoading(true)
    router.push(`/report/${encodeURIComponent(trimmed)}`)
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 flex flex-col gap-3 md:flex-row"
    >
      <Input
        placeholder="종목 코드 또는 회사명 (예: 005930, 삼성전자)"
        className="h-11 bg-slate-900/60 text-base text-slate-50 placeholder:text-slate-500"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
      />
      <Button
        type="submit"
        className="h-11 bg-sky-500 text-sm font-semibold text-slate-950 hover:bg-sky-400"
        disabled={loading}
      >
        {loading ? "이동 중..." : "기업 리포트 보기"}
      </Button>
    </form>
  )
}

function AccountPanel() {
  const { data: session, status } = useSession()
  const [credits, setCredits] = useState<number | null>(null)
  const [reportCount, setReportCount] = useState<number | null>(null)
  const [freeUsed, setFreeUsed] = useState<boolean | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)

  useEffect(() => {
    const run = async () => {
      if (status !== "authenticated") {
        setCredits(null)
        setReportCount(null)
        setFreeUsed(null)
        return
      }
      const res = await fetch("/api/me")
      if (!res.ok) return
      const json = await res.json()
      setCredits(json.credits)
      setReportCount(json.reportCount)
      setFreeUsed(json.freeReportUsed)
    }
    run()
  }, [status])

  const handleTopup = async () => {
    setBillingLoading(true)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: "starter" }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { url } = await res.json()
      if (url) window.location.href = url
    } finally {
      setBillingLoading(false)
    }
  }

  return (
    <Card className="border-slate-800 bg-slate-900/70 p-5">
      <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
        계정
      </div>
      <div className="mt-3 space-y-3 text-sm text-slate-300">
        {status === "loading" ? (
          <div className="text-xs text-slate-500">불러오는 중...</div>
        ) : status !== "authenticated" ? (
          <div className="flex flex-col gap-2">
            <div className="text-xs text-slate-500">
              리포트 생성은 로그인 후 가능합니다.
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => signIn(undefined, { callbackUrl: "/" })}>
                로그인
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700" asChild>
                <a href="/signup">회원가입</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-slate-400">
              {session.user?.email ?? "로그인됨"}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-slate-900/60 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Credits</div>
                <div className="mt-1 text-base font-semibold text-slate-100">
                  {credits ?? "–"}
                </div>
              </div>
              <div className="rounded-md bg-slate-900/60 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Reports</div>
                <div className="mt-1 text-base font-semibold text-slate-100">
                  {reportCount ?? "–"}
                </div>
              </div>
              <div className="rounded-md bg-slate-900/60 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Free</div>
                <div className="mt-1 text-base font-semibold text-slate-100">
                  {freeUsed == null ? "–" : freeUsed ? "사용" : "가능"}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleTopup} disabled={billingLoading || credits == null}>
                {billingLoading ? "이동 중..." : "크레딧 충전(Starter)"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                로그아웃
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

export default function DashboardPage() {
  return (
    <div className="grid h-full gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
      <section className="flex flex-col gap-4">
        <Card className="border-slate-800 bg-slate-900/70 p-6 shadow-xl">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400">
            AI COMPANY REPORT
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-50">
            내 관심 종목의 공시·실적·뉴스를
            <br />
            한 장짜리 AI 리포트로.
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            공시와 실적 발표를 일일이 읽지 않아도, 핵심 숫자와 이벤트만 빠르게
            훑어볼 수 있는 개인 투자자용 리포트입니다.
          </p>
          <ReportSearchForm />
          <p className="mt-2 text-xs text-slate-500">
            현재는 삼성전자(005930) 목업 데이터로 동작합니다. 이후 실제 공시·실적·뉴스
            API로 확장할 예정입니다.
          </p>
        </Card>

        <AnalysisLoading />
      </section>

      <section className="flex flex-col gap-4">
        <AccountPanel />
        <Card className="border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            최근 본 리포트 (샘플)
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <div className="flex items-center justify-between rounded-md bg-slate-900/60 px-3 py-2">
              <div>
                <div className="font-medium">삼성전자 (005930)</div>
                <div className="text-xs text-slate-500">
                  메모리 업황 회복 · 배당 정책 유지
                </div>
              </div>
              <span className="text-[11px] text-slate-500">오늘</span>
            </div>
          </div>
        </Card>

        <Card className="border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-semibold text-slate-50">
            리포트 구독으로 할 수 있는 일 (로드맵)
          </h2>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <div className="rounded-md bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
              - 관심 종목에 새 공시/실적이 뜨면, 자동으로 리포트 생성 후 알림 전송
            </div>
            <div className="rounded-md bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
              - 과거 리포트 히스토리를 모아, 이벤트 전후 실적과 주가를 비교
            </div>
            <div className="rounded-md bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
              - 내 포트폴리오 전체에 대한 분기별 실적 리포트 생성
            </div>
          </div>
        </Card>
      </section>
    </div>
  )
}


