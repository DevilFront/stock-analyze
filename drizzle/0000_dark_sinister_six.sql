CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "accounts" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"title" text NOT NULL,
	"day" date NOT NULL,
	"category" text,
	"source" text,
	"url" text,
	"summary" text,
	"sentiment" text,
	"eps_impact_score" integer,
	"price_impact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sector" text NOT NULL,
	"market_cap" bigint,
	"currency" text DEFAULT 'KRW',
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_topups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"stripe_checkout_session_id" text NOT NULL,
	"credits" integer NOT NULL,
	"amount" numeric,
	"currency" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"day" date NOT NULL,
	"open" numeric(18, 2),
	"high" numeric(18, 2),
	"low" numeric(18, 2),
	"close" numeric(18, 2),
	"volume" bigint,
	"net_foreign" bigint DEFAULT 0,
	"net_inst" bigint DEFAULT 0,
	"net_individual" bigint DEFAULT 0,
	"indicators" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_free_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id_hash" text NOT NULL,
	"first_claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_user_id" text,
	"first_ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "ip_daily_free_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cost_credits" integer DEFAULT 0 NOT NULL,
	"was_free" boolean DEFAULT false NOT NULL,
	"prompt_version" text DEFAULT 'v1' NOT NULL,
	"model" text DEFAULT 'gpt-4o-mini' NOT NULL,
	"markdown" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sector_averages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector" text NOT NULL,
	"day" date NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"company_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_customers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"free_report_used" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_symbol_companies_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."companies"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_topups" ADD CONSTRAINT "credit_topups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_symbol_companies_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."companies"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_free_claims" ADD CONSTRAINT "device_free_claims_first_user_id_users_id_fk" FOREIGN KEY ("first_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_customers" ADD CONSTRAINT "stripe_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_unique" ON "accounts" USING btree ("provider","providerAccountId");--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "announcements_symbol_day_idx" ON "announcements" USING btree ("symbol","day");--> statement-breakpoint
CREATE INDEX "announcements_category_idx" ON "announcements" USING btree ("symbol","category");--> statement-breakpoint
CREATE INDEX "companies_sector_idx" ON "companies" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "credit_ledger_user_created_idx" ON "credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_topups_stripe_session_unique" ON "credit_topups" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "credit_topups_user_created_idx" ON "credit_topups" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_stats_symbol_day_unique" ON "daily_stats" USING btree ("symbol","day");--> statement-breakpoint
CREATE INDEX "daily_stats_symbol_day_idx" ON "daily_stats" USING btree ("symbol","day");--> statement-breakpoint
CREATE INDEX "daily_stats_day_idx" ON "daily_stats" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "device_free_claims_device_unique" ON "device_free_claims" USING btree ("device_id_hash");--> statement-breakpoint
CREATE INDEX "device_free_claims_first_user_idx" ON "device_free_claims" USING btree ("first_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ip_daily_free_claims_ip_day_unique" ON "ip_daily_free_claims" USING btree ("ip","day");--> statement-breakpoint
CREATE INDEX "reports_user_created_idx" ON "reports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_symbol_created_idx" ON "reports" USING btree ("symbol","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sector_averages_sector_day_unique" ON "sector_averages" USING btree ("sector","day");--> statement-breakpoint
CREATE INDEX "sector_averages_sector_day_idx" ON "sector_averages" USING btree ("sector","day");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_customers_customer_unique" ON "stripe_customers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verificationToken_identifier_token_unique" ON "verificationToken" USING btree ("identifier","token");