import { NextRequest } from "next/server"
import { db } from "@/db"
import { users, userPasswords, userCredits } from "@/db/schema"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { email?: string; password?: string; name?: string }
  const email = (body.email ?? "").trim().toLowerCase()
  const password = body.password ?? ""
  const name = (body.name ?? "").trim() || null

  if (!email || !password || password.length < 8) {
    return new Response("Invalid email/password", { status: 400 })
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existing) {
    return new Response("Email already exists", { status: 409 })
  }

  const id = crypto.randomUUID()
  const passwordHash = await bcrypt.hash(password, 12)

  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id, email, name })
    await tx.insert(userPasswords).values({ userId: id, passwordHash })
    await tx.insert(userCredits).values({ userId: id, balance: 0, freeReportUsed: false })
  })

  return Response.json({ ok: true })
}

