import Stripe from "stripe"

let cached: Stripe | null = null

export function getStripe() {
  if (cached) return cached
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set")
  }
  cached = new Stripe(key, {
    // SDK 타입에서 허용되는 최신 버전 문자열만 사용 (버전 불일치로 빌드가 깨지는 것 방지)
    apiVersion: "2026-02-25.clover",
  })
  return cached
}

