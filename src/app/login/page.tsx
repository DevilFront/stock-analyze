"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCredentials = async () => {
    setLoading(true)
    setError(null)
    const res = await signIn("credentials", {
      email,
      password,
      redirect: true,
      callbackUrl: "/",
    })
    if ((res as any)?.error) setError("로그인에 실패했습니다.")
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900/40 p-6 text-slate-100">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">로그인</h1>
        <p className="mt-2 text-sm text-slate-400">
          리포트 생성은 회원만 가능합니다. (첫 1회 무료, 이후 크레딧 차감)
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <Button
            className="w-full bg-slate-50 text-slate-950 hover:bg-white"
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            Google로 계속하기
          </Button>

          <div className="my-2 border-t border-slate-800" />

          <div className="grid gap-2">
            <Input
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
            <Input
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button onClick={handleCredentials} disabled={loading || !email || !password}>
              {loading ? "로그인 중..." : "이메일/비밀번호 로그인"}
            </Button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            계정이 없다면 <a className="text-sky-300 underline" href="/signup">회원가입</a> 후 로그인하세요.
          </p>
        </div>
      </Card>
    </div>
  )
}

