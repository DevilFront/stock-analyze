import { NextRequest } from "next/server"
import { getStripe } from "@/app/_lib/stripe"
import { getDb } from "@/db"
import { creditLedger, creditTopups, userCredits } from "@/db/schema"
import { eq } from "drizzle-orm"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const db = getDb()
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return new Response("STRIPE_WEBHOOK_SECRET is not set", { status: 500 })

  const sig = req.headers.get("stripe-signature")
  if (!sig) return new Response("Missing signature", { status: 400 })

  const rawBody = await req.text()

  let event: any
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err: any) {
    return new Response(`Webhook Error: ${err?.message ?? "invalid"}`, { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any
    const userId = session?.metadata?.userId as string | undefined
    const credits = Number(session?.metadata?.credits ?? 0)
    const checkoutId = session?.id as string | undefined

    if (userId && credits > 0 && checkoutId) {
      await db.transaction(async (tx) => {
        // topup 상태 업데이트
        await tx
          .update(creditTopups)
          .set({ status: "paid", paidAt: new Date(), raw: session })
          .where(eq(creditTopups.stripeCheckoutSessionId, checkoutId))

        // 크레딧 반영 (row 없으면 생성)
        const row = await tx.query.userCredits.findFirst({
          where: eq(userCredits.userId, userId),
        })
        if (!row) {
          await tx.insert(userCredits).values({ userId, balance: credits, freeReportUsed: false })
        } else {
          await tx
            .update(userCredits)
            .set({ balance: row.balance + credits, updatedAt: new Date() })
            .where(eq(userCredits.userId, userId))
        }

        await tx.insert(creditLedger).values({
          userId,
          delta: credits,
          reason: "STRIPE_TOPUP",
          metadata: { checkoutId },
        })
      })
    }
  }

  return new Response("ok")
}

