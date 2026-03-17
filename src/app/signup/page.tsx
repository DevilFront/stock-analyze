"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignup = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      })
      if (!res.ok) {
        const t = await res.text()
        if (res.status === 409) throw new Error("이미 가입된 이메일입니다.")
        throw new Error(t || "회원가입에 실패했습니다.")
      }
      router.push("/login")
    } catch (e: any) {
      setError(e?.message ?? "회원가입에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900/40 p-6 text-slate-100">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">회원가입</h1>
        <p className="mt-2 text-sm text-slate-400">
          이메일/비밀번호로 계정을 만들 수 있습니다. (Google 로그인도 가능)
        </p>

        <div className="mt-5 grid gap-2">
          <Input placeholder="이름(선택)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />
          <Input
            placeholder="비밀번호 (8자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button onClick={handleSignup} disabled={loading || !email || password.length < 8}>
            {loading ? "가입 중..." : "회원가입"}
          </Button>
        </div>
      </Card>
    </div>
  )
}

