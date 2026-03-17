import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  uniqueIndex,
  index,
  jsonb,
  numeric,
  date,
  bigint,
} from "drizzle-orm/pg-core"

/**
 * Auth.js(NextAuth) 기본 테이블 + 서비스 도메인(크레딧/리포트/악용방지/주식데이터) 테이블.
 * - adapter가 기대하는 테이블/컬럼을 유지하면서, 서비스 특화 컬럼은 별도 테이블로 분리
 */

// -----------------------------------------------------------------------------
// Auth.js tables (Drizzle Adapter)
// -----------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey(), // adapter가 string id 사용
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export const userPasswords = pgTable(
  "user_passwords",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index("user_passwords_user_id_idx").on(t.userId),
  }),
)

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    providerCompound: uniqueIndex("accounts_provider_providerAccountId_unique").on(
      t.provider,
      t.providerAccountId,
    ),
    userIdIdx: index("accounts_userId_idx").on(t.userId),
  }),
)

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("sessionToken").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({
    userIdIdx: index("sessions_userId_idx").on(t.userId),
  }),
)

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({
    compositePk: uniqueIndex("verificationToken_identifier_token_unique").on(t.identifier, t.token),
  }),
)

// -----------------------------------------------------------------------------
// Anti-abuse: free first report protection
// -----------------------------------------------------------------------------

export const deviceFreeClaims = pgTable(
  "device_free_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deviceIdHash: text("device_id_hash").notNull(),
    firstClaimedAt: timestamp("first_claimed_at", { withTimezone: true }).defaultNow().notNull(),
    firstUserId: text("first_user_id").references(() => users.id, { onDelete: "set null" }),
    firstIp: text("first_ip"),
    userAgent: text("user_agent"),
  },
  (t) => ({
    deviceUnique: uniqueIndex("device_free_claims_device_unique").on(t.deviceIdHash),
    firstUserIdx: index("device_free_claims_first_user_idx").on(t.firstUserId),
  }),
)

export const ipDailyFreeClaims = pgTable(
  "ip_daily_free_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ip: text("ip").notNull(),
    day: date("day").notNull(),
    count: integer("count").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ipDayUnique: uniqueIndex("ip_daily_free_claims_ip_day_unique").on(t.ip, t.day),
  }),
)

// -----------------------------------------------------------------------------
// Credits: balance + ledger
// -----------------------------------------------------------------------------

export const userCredits = pgTable(
  "user_credits",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    balance: integer("balance").default(0).notNull(), // credits (service currency)
    freeReportUsed: boolean("free_report_used").default(false).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
)

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(), // +charge / -spend
    reason: text("reason").notNull(), // e.g. "FREE_REPORT", "REPORT_SPEND", "STRIPE_TOPUP"
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCreatedIdx: index("credit_ledger_user_created_idx").on(t.userId, t.createdAt),
  }),
)

// -----------------------------------------------------------------------------
// Reports
// -----------------------------------------------------------------------------

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    costCredits: integer("cost_credits").default(0).notNull(),
    wasFree: boolean("was_free").default(false).notNull(),
    promptVersion: text("prompt_version").default("v1").notNull(),
    model: text("model").default("gpt-4o-mini").notNull(),
    // optional caching / audit
    markdown: text("markdown"),
    meta: jsonb("meta").default({}).notNull(),
  },
  (t) => ({
    userCreatedIdx: index("reports_user_created_idx").on(t.userId, t.createdAt),
    symbolCreatedIdx: index("reports_symbol_created_idx").on(t.symbol, t.createdAt),
  }),
)

// -----------------------------------------------------------------------------
// Payments (Stripe)
// -----------------------------------------------------------------------------

export const stripeCustomers = pgTable(
  "stripe_customers",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    stripeCustomerUnique: uniqueIndex("stripe_customers_customer_unique").on(t.stripeCustomerId),
  }),
)

export const creditTopups = pgTable(
  "credit_topups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
    credits: integer("credits").notNull(),
    amount: numeric("amount"), // currency amount (optional)
    currency: text("currency"),
    status: text("status").default("pending").notNull(), // pending|paid|failed
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    raw: jsonb("raw").default({}).notNull(),
  },
  (t) => ({
    stripeSessionUnique: uniqueIndex("credit_topups_stripe_session_unique").on(
      t.stripeCheckoutSessionId,
    ),
    userCreatedIdx: index("credit_topups_user_created_idx").on(t.userId, t.createdAt),
  }),
)

// -----------------------------------------------------------------------------
// Stock data (DB_REPORT_STRATEGY 기반 확장형 스키마; 상세 수집은 추후 ETL로 채움)
// -----------------------------------------------------------------------------

export const companies = pgTable(
  "companies",
  {
    symbol: text("symbol").primaryKey(),
    name: text("name").notNull(),
    sector: text("sector").notNull(),
    marketCap: bigint("market_cap", { mode: "number" }),
    currency: text("currency").default("KRW"),
    profile: jsonb("profile").default({}).notNull(), // 확장 프로필
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sectorIdx: index("companies_sector_idx").on(t.sector),
  }),
)

export const dailyStats = pgTable(
  "daily_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => companies.symbol, { onDelete: "cascade" }),
    day: date("day").notNull(),
    open: numeric("open", { precision: 18, scale: 2 }),
    high: numeric("high", { precision: 18, scale: 2 }),
    low: numeric("low", { precision: 18, scale: 2 }),
    close: numeric("close", { precision: 18, scale: 2 }),
    volume: bigint("volume", { mode: "number" }),
    netForeign: bigint("net_foreign", { mode: "number" }).default(0),
    netInst: bigint("net_inst", { mode: "number" }).default(0),
    netIndividual: bigint("net_individual", { mode: "number" }).default(0),
    indicators: jsonb("indicators").default({}).notNull(), // RSI, MACD, etc
    metrics: jsonb("metrics").default({}).notNull(), // profitability/growth/stability/dividend/valuation etc
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    symbolDayUnique: uniqueIndex("daily_stats_symbol_day_unique").on(t.symbol, t.day),
    symbolDayIdx: index("daily_stats_symbol_day_idx").on(t.symbol, t.day),
    dayIdx: index("daily_stats_day_idx").on(t.day),
  }),
)

export const sectorAverages = pgTable(
  "sector_averages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sector: text("sector").notNull(),
    day: date("day").notNull(),
    metrics: jsonb("metrics").default({}).notNull(),
    companyCount: integer("company_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sectorDayUnique: uniqueIndex("sector_averages_sector_day_unique").on(t.sector, t.day),
    sectorDayIdx: index("sector_averages_sector_day_idx").on(t.sector, t.day),
  }),
)

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => companies.symbol, { onDelete: "cascade" }),
    title: text("title").notNull(),
    day: date("day").notNull(),
    category: text("category"),
    source: text("source"),
    url: text("url"),
    summary: text("summary"),
    sentiment: text("sentiment"),
    epsImpactScore: integer("eps_impact_score"),
    priceImpact: jsonb("price_impact").default({}).notNull(), // return_1d/5d/10d...
    raw: jsonb("raw").default({}).notNull(), // 공시 원문/파싱 결과
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    symbolDayIdx: index("announcements_symbol_day_idx").on(t.symbol, t.day),
    categoryIdx: index("announcements_category_idx").on(t.symbol, t.category),
  }),
)

export const newsItems = pgTable(
  "news_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => companies.symbol, { onDelete: "cascade" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    source: text("source"),
    url: text("url"),
    summary: text("summary"),
    sentimentScore: numeric("sentiment_score", { precision: 6, scale: 3 }),
    topicTags: jsonb("topic_tags").default([]).notNull(),
    raw: jsonb("raw").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    symbolPublishedIdx: index("news_items_symbol_published_idx").on(t.symbol, t.publishedAt),
  }),
)

export const financialQuarterly = pgTable(
  "financial_quarterly",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => companies.symbol, { onDelete: "cascade" }),
    period: text("period").notNull(), // e.g. "2024 Q4"
    revenue: bigint("revenue", { mode: "number" }),
    operatingIncome: bigint("operating_income", { mode: "number" }),
    netIncome: bigint("net_income", { mode: "number" }),
    eps: numeric("eps", { precision: 18, scale: 4 }),
    extra: jsonb("extra").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    symbolPeriodUnique: uniqueIndex("financial_quarterly_symbol_period_unique").on(t.symbol, t.period),
    symbolPeriodIdx: index("financial_quarterly_symbol_period_idx").on(t.symbol, t.period),
  }),
)

export const financialYearly = pgTable(
  "financial_yearly",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => companies.symbol, { onDelete: "cascade" }),
    year: text("year").notNull(), // e.g. "2024"
    revenue: bigint("revenue", { mode: "number" }),
    operatingIncome: bigint("operating_income", { mode: "number" }),
    netIncome: bigint("net_income", { mode: "number" }),
    roe: numeric("roe", { precision: 8, scale: 3 }),
    extra: jsonb("extra").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    symbolYearUnique: uniqueIndex("financial_yearly_symbol_year_unique").on(t.symbol, t.year),
    symbolYearIdx: index("financial_yearly_symbol_year_idx").on(t.symbol, t.year),
  }),
)

