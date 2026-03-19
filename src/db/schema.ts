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
// AI usage & budget (monthly cap)
// -----------------------------------------------------------------------------

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    month: text("month").notNull(), // YYYY-MM
    feature: text("feature").notNull(), // e.g. "dart_enrich_fulltext"
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    costKrw: integer("cost_krw").default(0).notNull(),
    meta: jsonb("meta").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    monthIdx: index("ai_usage_events_month_idx").on(t.month),
    featureIdx: index("ai_usage_events_feature_idx").on(t.feature),
  }),
)

export const aiUsageMonthly = pgTable(
  "ai_usage_monthly",
  {
    month: text("month").primaryKey(), // YYYY-MM
    limitKrw: integer("limit_krw").default(30000).notNull(),
    spentKrw: integer("spent_krw").default(0).notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
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

export const quantScores = pgTable(
  "quant_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => companies.symbol, { onDelete: "cascade" }),
    day: date("day").notNull(),
    modelVersion: text("model_version").default("v1").notNull(),
    totalScore: numeric("total_score", { precision: 8, scale: 3 }).notNull(),
    sectorPercentile: numeric("sector_percentile", { precision: 6, scale: 2 }),
    marketPercentile: numeric("market_percentile", { precision: 6, scale: 2 }),
    grade: text("grade"),
    scoreValue: numeric("score_value", { precision: 8, scale: 3 }),
    scoreQuality: numeric("score_quality", { precision: 8, scale: 3 }),
    scoreGrowth: numeric("score_growth", { precision: 8, scale: 3 }),
    scoreMomentum: numeric("score_momentum", { precision: 8, scale: 3 }),
    scoreRisk: numeric("score_risk", { precision: 8, scale: 3 }),
    scoreSupply: numeric("score_supply", { precision: 8, scale: 3 }),
    scoreSentiment: numeric("score_sentiment", { precision: 8, scale: 3 }),
    factors: jsonb("factors").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    symbolDayModelUnique: uniqueIndex("quant_scores_symbol_day_model_unique").on(
      t.symbol,
      t.day,
      t.modelVersion,
    ),
    symbolDayIdx: index("quant_scores_symbol_day_idx").on(t.symbol, t.day),
    totalScoreIdx: index("quant_scores_total_score_idx").on(t.day, t.totalScore),
  }),
)

export const signalEvents = pgTable(
  "signal_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => companies.symbol, { onDelete: "cascade" }),
    signalType: text("signal_type").notNull(),
    signalDay: date("signal_day").notNull(),
    signalValue: numeric("signal_value", { precision: 18, scale: 6 }),
    regime: text("regime"),
    features: jsonb("features").default({}).notNull(),
    return1d: numeric("return_1d", { precision: 10, scale: 4 }),
    return5d: numeric("return_5d", { precision: 10, scale: 4 }),
    return10d: numeric("return_10d", { precision: 10, scale: 4 }),
    return20d: numeric("return_20d", { precision: 10, scale: 4 }),
    maxDrawdown20d: numeric("max_drawdown_20d", { precision: 10, scale: 4 }),
    hit5d: boolean("hit_5d"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    symbolSignalDayUnique: uniqueIndex("signal_events_symbol_signal_day_unique").on(
      t.symbol,
      t.signalType,
      t.signalDay,
    ),
    typeDayIdx: index("signal_events_type_day_idx").on(t.signalType, t.signalDay),
    symbolDayIdx: index("signal_events_symbol_day_idx").on(t.symbol, t.signalDay),
  }),
)

export const signalBacktestStats = pgTable(
  "signal_backtest_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    signalType: text("signal_type").notNull(),
    asOfDay: date("as_of_day").notNull(),
    sampleSize: integer("sample_size").default(0).notNull(),
    winRate5d: numeric("win_rate_5d", { precision: 6, scale: 2 }),
    winRate10d: numeric("win_rate_10d", { precision: 6, scale: 2 }),
    avgReturn5d: numeric("avg_return_5d", { precision: 10, scale: 4 }),
    avgReturn10d: numeric("avg_return_10d", { precision: 10, scale: 4 }),
    medianReturn5d: numeric("median_return_5d", { precision: 10, scale: 4 }),
    medianReturn10d: numeric("median_return_10d", { precision: 10, scale: 4 }),
    sharpe20d: numeric("sharpe_20d", { precision: 10, scale: 4 }),
    maxDrawdown: numeric("max_drawdown", { precision: 10, scale: 4 }),
    byRegime: jsonb("by_regime").default({}).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    signalAsOfUnique: uniqueIndex("signal_backtest_stats_signal_as_of_unique").on(
      t.signalType,
      t.asOfDay,
    ),
    signalAsOfIdx: index("signal_backtest_stats_signal_as_of_idx").on(t.signalType, t.asOfDay),
  }),
)

export const communitySentimentDaily = pgTable(
  "community_sentiment_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => companies.symbol, { onDelete: "cascade" }),
    day: date("day").notNull(),
    source: text("source").notNull(),
    mentionCount: integer("mention_count").default(0).notNull(),
    uniqueAuthors: integer("unique_authors").default(0).notNull(),
    positiveCount: integer("positive_count").default(0).notNull(),
    negativeCount: integer("negative_count").default(0).notNull(),
    neutralCount: integer("neutral_count").default(0).notNull(),
    sentimentScore: numeric("sentiment_score", { precision: 8, scale: 4 }),
    buzzZscore: numeric("buzz_zscore", { precision: 8, scale: 4 }),
    spamRatio: numeric("spam_ratio", { precision: 8, scale: 4 }),
    raw: jsonb("raw").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    symbolDaySourceUnique: uniqueIndex("community_sentiment_symbol_day_source_unique").on(
      t.symbol,
      t.day,
      t.source,
    ),
    symbolDayIdx: index("community_sentiment_symbol_day_idx").on(t.symbol, t.day),
    sourceDayIdx: index("community_sentiment_source_day_idx").on(t.source, t.day),
  }),
)

export const crosscheckDaily = pgTable(
  "crosscheck_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => companies.symbol, { onDelete: "cascade" }),
    day: date("day").notNull(),
    dartEventCount7d: integer("dart_event_count_7d").default(0).notNull(),
    dartEventScore7d: numeric("dart_event_score_7d", { precision: 8, scale: 4 }),
    priceReturn5d: numeric("price_return_5d", { precision: 10, scale: 4 }),
    volumeZscore: numeric("volume_zscore", { precision: 8, scale: 4 }),
    communityBuzzZscore: numeric("community_buzz_zscore", { precision: 8, scale: 4 }),
    communitySentiment: numeric("community_sentiment", { precision: 8, scale: 4 }),
    divergenceScore: numeric("divergence_score", { precision: 8, scale: 4 }),
    underreactionScore: numeric("underreaction_score", { precision: 8, scale: 4 }),
    convictionScore: numeric("conviction_score", { precision: 8, scale: 4 }),
    flags: jsonb("flags").default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    symbolDayUnique: uniqueIndex("crosscheck_daily_symbol_day_unique").on(t.symbol, t.day),
    symbolDayIdx: index("crosscheck_daily_symbol_day_idx").on(t.symbol, t.day),
    underreactionIdx: index("crosscheck_daily_underreaction_idx").on(t.day, t.underreactionScore),
  }),
)

export const issuePriceMoves = pgTable(
  "issue_price_moves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => companies.symbol, { onDelete: "cascade" }),
    eventSource: text("event_source").notNull(), // DART | NEWS
    eventId: text("event_id").notNull(), // announcements.id | news_items.id
    eventDay: date("event_day").notNull(),
    eventTitle: text("event_title").notNull(),
    thresholdPct: numeric("threshold_pct", { precision: 8, scale: 4 }).notNull(), // 5.0000
    lookaheadDays: integer("lookahead_days").default(5).notNull(),
    baseDay: date("base_day").notNull(), // 실제 비교 기준 거래일
    baseClose: numeric("base_close", { precision: 18, scale: 4 }).notNull(),
    maxUpPct: numeric("max_up_pct", { precision: 10, scale: 4 }),
    maxDownPct: numeric("max_down_pct", { precision: 10, scale: 4 }),
    moveType: text("move_type").notNull(), // SURGE | DROP | BOTH
    moveDay: date("move_day"), // threshold 최초 충족일
    movePct: numeric("move_pct", { precision: 10, scale: 4 }),
    context: jsonb("context").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    symbolEventUnique: uniqueIndex("issue_price_moves_symbol_event_unique").on(
      t.symbol,
      t.eventSource,
      t.eventId,
    ),
    symbolDayIdx: index("issue_price_moves_symbol_day_idx").on(t.symbol, t.eventDay),
    moveTypeIdx: index("issue_price_moves_move_type_idx").on(t.moveType, t.eventDay),
  }),
)

