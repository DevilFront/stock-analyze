import type { Metadata } from "next"
import "./globals.css"
import { AppSessionProvider } from "./_components/session-provider"

export const metadata: Metadata = {
  title: "Stock Analyze",
  description: "AI 기반 주식 수급/매집 분석 SaaS",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <AppSessionProvider>{children}</AppSessionProvider>
      </body>
    </html>
  )
}
