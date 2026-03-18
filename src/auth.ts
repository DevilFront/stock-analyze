import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

import { getDb } from "@/db"
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  userPasswords,
  userCredits,
} from "@/db/schema"

export const { handlers, auth } = NextAuth(async () => {
  const db = getDb()
  return {
    adapter: DrizzleAdapter(db as any, {
      usersTable: users as any,
      accountsTable: accounts as any,
      sessionsTable: sessions as any,
      verificationTokensTable: verificationTokens as any,
    }) as any,
    session: { strategy: "database" },
    providers: [
      GoogleProvider({
        allowDangerousEmailAccountLinking: false,
      }),
      CredentialsProvider({
        name: "Email & Password",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const email = String((credentials as any)?.email ?? "").trim().toLowerCase()
          const password = String((credentials as any)?.password ?? "")
          if (!email || !password) return null

          const user = await db.query.users.findFirst({
            where: eq(users.email, email),
          })
          if (!user) return null

          const pw = await db.query.userPasswords.findFirst({
            where: eq(userPasswords.userId, user.id),
          })
          if (!pw) return null

          const ok = await bcrypt.compare(password, pw.passwordHash)
          if (!ok) return null

          return { id: user.id, email: user.email, name: user.name, image: user.image }
        },
      }),
    ],
    callbacks: {
      async session({ session, user }) {
        if (session.user) {
          ;(session.user as any).id = user.id
        }
        return session
      },
    },
    events: {
      async createUser({ user }) {
        const userId = String(user.id || "")
        if (!userId) return
        await db
          .insert(userCredits)
          .values({ userId, balance: 0, freeReportUsed: false })
          .onConflictDoNothing()
      },
    },
    pages: {
      signIn: "/login",
    },
  }
})

