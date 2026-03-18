import { auth } from "@/auth"
import { getDb } from "@/db"
import { reports, userCredits } from "@/db/schema"
import { eq, sql } from "drizzle-orm"

export const runtime = "nodejs"

export async function GET() {
  const db = getDb()
  const session = await auth()
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) return new Response("UNAUTHORIZED", { status: 401 })

  const credits = await db.query.userCredits.findFirst({
    where: eq(userCredits.userId, userId),
  })

  const reportCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(reports)
    .where(eq(reports.userId, userId))

  return Response.json({
    user: session?.user ?? null,
    credits: credits?.balance ?? 0,
    freeReportUsed: credits?.freeReportUsed ?? false,
    reportCount: Number(reportCount?.[0]?.count ?? 0),
  })
}

