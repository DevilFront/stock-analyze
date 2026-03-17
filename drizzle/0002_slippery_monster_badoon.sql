CREATE TABLE "financial_quarterly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"period" text NOT NULL,
	"revenue" bigint,
	"operating_income" bigint,
	"net_income" bigint,
	"eps" numeric(18, 4),
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_yearly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"year" text NOT NULL,
	"revenue" bigint,
	"operating_income" bigint,
	"net_income" bigint,
	"roe" numeric(8, 3),
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"source" text,
	"url" text,
	"summary" text,
	"sentiment_score" numeric(6, 3),
	"topic_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_quarterly" ADD CONSTRAINT "financial_quarterly_symbol_companies_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."companies"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_yearly" ADD CONSTRAINT "financial_yearly_symbol_companies_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."companies"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_symbol_companies_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."companies"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_quarterly_symbol_period_unique" ON "financial_quarterly" USING btree ("symbol","period");--> statement-breakpoint
CREATE INDEX "financial_quarterly_symbol_period_idx" ON "financial_quarterly" USING btree ("symbol","period");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_yearly_symbol_year_unique" ON "financial_yearly" USING btree ("symbol","year");--> statement-breakpoint
CREATE INDEX "financial_yearly_symbol_year_idx" ON "financial_yearly" USING btree ("symbol","year");--> statement-breakpoint
CREATE INDEX "news_items_symbol_published_idx" ON "news_items" USING btree ("symbol","published_at");