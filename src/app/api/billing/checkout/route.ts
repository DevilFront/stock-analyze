import { NextRequest } from "next/server"
import { auth } from "@/auth"
import { getStripe } from "@/app/_lib/stripe"
import { getDb } from "@/db"
import { creditTopups } from "@/db/schema"

export const runtime = "nodejs"

const PACKS: Record<string, { credits: number; amount: number; currency: string }> = {
  starter: { credits: 100, amount: 9900, currency: "krw" },
  pro: { credits: 300, amount: 24900, currency: "krw" },
}

export async function POST(req: NextRequest) {
  const db = getDb()
  const session = await auth()
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) return new Response("UNAUTHORIZED", { status: 401 })

  if (!process.env.STRIPE_SECRET_KEY) {
    return new Response("STRIPE_SECRET_KEY is not set", { status: 500 })
  }
  const stripe = getStripe()

  const body = (await req.json()) as { pack?: keyof typeof PACKS }
  const packKey = body.pack ?? "starter"
  const pack = PACKS[packKey]
  if (!pack) return new Response("INVALID_PACK", { status: 400 })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${baseUrl}/?checkout=success`,
    cancel_url: `${baseUrl}/?checkout=cancel`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: pack.currency,
          unit_amount: pack.amount,
          product_data: {
            name: `크레딧 충전 (${pack.credits} credits)`,
          },
        },
      },
    ],
    metadata: {
      userId,
      credits: String(pack.credits),
      pack: packKey,
    },
  })

  await db.insert(creditTopups).values({
    userId,
    stripeCheckoutSessionId: checkout.id,
    credits: pack.credits,
    amount: String(pack.amount) as any,
    currency: pack.currency,
    status: "pending",
    raw: { pack: packKey },
  })

  return Response.json({ url: checkout.url })
}

