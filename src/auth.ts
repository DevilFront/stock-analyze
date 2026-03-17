import NextAuth, { type NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

import { db } from "@/db"
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  userPasswords,
  userCredits,
} from "@/db/schema"

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db as any, {
    usersTable: users as any,
    accountsTable: accounts as any,
    sessionsTable: sessions as any,
    verificationTokensTable: verificationTokens as any,
  }) as any,
  session: { strategy: "database" },
  providers: [
    GoogleProvider({
      clientId: requiredEnv("AUTH_GOOGLE_ID"),
      clientSecret: requiredEnv("AUTH_GOOGLE_SECRET"),
      allowDangerousEmailAccountLinking: false,
    }),
    CredentialsProvider({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email ?? "").trim().toLowerCase()
        const password = credentials?.password ?? ""
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
      // 유저 생성 시 크레딧 row를 미리 만들어둔다.
      await db
        .insert(userCredits)
        .values({ userId: user.id, balance: 0, freeReportUsed: false })
        .onConflictDoNothing()
    },
  },
  pages: {
    signIn: "/login",
  },
}

export const { handlers, auth } = NextAuth(authOptions)

