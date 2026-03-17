import { NextRequest } from "next/server"
import { getCompanyRaw } from "@/app/_lib/company-data"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = (searchParams.get("symbol") ?? "").trim() || "005930"

  try {
    const data = await getCompanyRaw(symbol)
    return Response.json(data)
  } catch {
    return new Response("해당 종목의 목업 데이터가 없습니다.", { status: 404 })
  }
}

