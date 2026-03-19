import { auth } from "@/auth"
import { getDb } from "@/db"
import { aiUsageEvents, reports, userCredits } from "@/db/schema"
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

  const usage = await db
    .select({
      generated: sql<number>`count(*)::int`,
      inputTokens: sql<number>`COALESCE(sum(${aiUsageEvents.inputTokens}), 0)::int`,
      outputTokens: sql<number>`COALESCE(sum(${aiUsageEvents.outputTokens}), 0)::int`,
      costKrw: sql<number>`COALESCE(sum(${aiUsageEvents.costKrw}), 0)::int`,
    })
    .from(aiUsageEvents)
    .where(
      sql`${aiUsageEvents.feature} = 'report_generate' AND COALESCE(${aiUsageEvents.meta}->>'userId','') = ${userId}`,
    )

  return Response.json({
    user: session?.user ?? null,
    credits: credits?.balance ?? 0,
    freeReportUsed: credits?.freeReportUsed ?? false,
    reportCount: Number(reportCount?.[0]?.count ?? 0),
    usage: {
      generated: Number(usage?.[0]?.generated ?? 0),
      inputTokens: Number(usage?.[0]?.inputTokens ?? 0),
      outputTokens: Number(usage?.[0]?.outputTokens ?? 0),
      costKrw: Number(usage?.[0]?.costKrw ?? 0),
    },
  })
}

