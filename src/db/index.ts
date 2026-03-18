import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import * as schema from "./schema"

let cached:
  | ReturnType<typeof drizzle<typeof schema>>
  | null = null

export function getDb() {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set")
  }
  const sql = neon(url)
  cached = drizzle(sql, { schema })
  return cached
}

