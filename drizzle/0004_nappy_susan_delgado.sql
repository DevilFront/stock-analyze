CREATE TABLE "community_sentiment_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"day" date NOT NULL,
	"source" text NOT NULL,
	"mention_count" integer DEFAULT 0 NOT NULL,
	"unique_authors" integer DEFAULT 0 NOT NULL,
	"positive_count" integer DEFAULT 0 NOT NULL,
	"negative_count" integer DEFAULT 0 NOT NULL,
	"neutral_count" integer DEFAULT 0 NOT NULL,
	"sentiment_score" numeric(8, 4),
	"buzz_zscore" numeric(8, 4),
	"spam_ratio" numeric(8, 4),
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crosscheck_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"day" date NOT NULL,
	"dart_event_count_7d" integer DEFAULT 0 NOT NULL,
	"dart_event_score_7d" numeric(8, 4),
	"price_return_5d" numeric(10, 4),
	"volume_zscore" numeric(8, 4),
	"community_buzz_zscore" numeric(8, 4),
	"community_sentiment" numeric(8, 4),
	"divergence_score" numeric(8, 4),
	"underreaction_score" numeric(8, 4),
	"conviction_score" numeric(8, 4),
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_price_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"event_source" text NOT NULL,
	"event_id" text NOT NULL,
	"event_day" date NOT NULL,
	"event_title" text NOT NULL,
	"threshold_pct" numeric(8, 4) NOT NULL,
	"lookahead_days" integer DEFAULT 5 NOT NULL,
	"base_day" date NOT NULL,
	"base_close" numeric(18, 4) NOT NULL,
	"max_up_pct" numeric(10, 4),
	"max_down_pct" numeric(10, 4),
	"move_type" text NOT NULL,
	"move_day" date,
	"move_pct" numeric(10, 4),
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quant_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"day" date NOT NULL,
	"model_version" text DEFAULT 'v1' NOT NULL,
	"total_score" numeric(8, 3) NOT NULL,
	"sector_percentile" numeric(6, 2),
	"market_percentile" numeric(6, 2),
	"grade" text,
	"score_value" numeric(8, 3),
	"score_quality" numeric(8, 3),
	"score_growth" numeric(8, 3),
	"score_momentum" numeric(8, 3),
	"score_risk" numeric(8, 3),
	"score_supply" numeric(8, 3),
	"score_sentiment" numeric(8, 3),
	"factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_backtest_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_type" text NOT NULL,
	"as_of_day" date NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"win_rate_5d" numeric(6, 2),
	"win_rate_10d" numeric(6, 2),
	"avg_return_5d" numeric(10, 4),
	"avg_return_10d" numeric(10, 4),
	"median_return_5d" numeric(10, 4),
	"median_return_10d" numeric(10, 4),
	"sharpe_20d" numeric(10, 4),
	"max_drawdown" numeric(10, 4),
	"by_regime" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"signal_type" text NOT NULL,
	"signal_day" date NOT NULL,
	"signal_value" numeric(18, 6),
	"regime" text,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"return_1d" numeric(10, 4),
	"return_5d" numeric(10, 4),
	"return_10d" numeric(10, 4),
	"return_20d" numeric(10, 4),
	"max_drawdown_20d" numeric(10, 4),
	"hit_5d" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_sentiment_daily" ADD CONSTRAINT "community_sentiment_daily_symbol_companies_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."companies"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosscheck_daily" ADD CONSTRAINT "crosscheck_daily_symbol_companies_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."companies"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_price_moves" ADD CONSTRAINT "issue_price_moves_symbol_companies_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."companies"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quant_scores" ADD CONSTRAINT "quant_scores_symbol_companies_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."companies"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_events" ADD CONSTRAINT "signal_events_symbol_companies_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."companies"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_sentiment_symbol_day_source_unique" ON "community_sentiment_daily" USING btree ("symbol","day","source");--> statement-breakpoint
CREATE INDEX "community_sentiment_symbol_day_idx" ON "community_sentiment_daily" USING btree ("symbol","day");--> statement-breakpoint
CREATE INDEX "community_sentiment_source_day_idx" ON "community_sentiment_daily" USING btree ("source","day");--> statement-breakpoint
CREATE UNIQUE INDEX "crosscheck_daily_symbol_day_unique" ON "crosscheck_daily" USING btree ("symbol","day");--> statement-breakpoint
CREATE INDEX "crosscheck_daily_symbol_day_idx" ON "crosscheck_daily" USING btree ("symbol","day");--> statement-breakpoint
CREATE INDEX "crosscheck_daily_underreaction_idx" ON "crosscheck_daily" USING btree ("day","underreaction_score");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_price_moves_symbol_event_unique" ON "issue_price_moves" USING btree ("symbol","event_source","event_id");--> statement-breakpoint
CREATE INDEX "issue_price_moves_symbol_day_idx" ON "issue_price_moves" USING btree ("symbol","event_day");--> statement-breakpoint
CREATE INDEX "issue_price_moves_move_type_idx" ON "issue_price_moves" USING btree ("move_type","event_day");--> statement-breakpoint
CREATE UNIQUE INDEX "quant_scores_symbol_day_model_unique" ON "quant_scores" USING btree ("symbol","day","model_version");--> statement-breakpoint
CREATE INDEX "quant_scores_symbol_day_idx" ON "quant_scores" USING btree ("symbol","day");--> statement-breakpoint
CREATE INDEX "quant_scores_total_score_idx" ON "quant_scores" USING btree ("day","total_score");--> statement-breakpoint
CREATE UNIQUE INDEX "signal_backtest_stats_signal_as_of_unique" ON "signal_backtest_stats" USING btree ("signal_type","as_of_day");--> statement-breakpoint
CREATE INDEX "signal_backtest_stats_signal_as_of_idx" ON "signal_backtest_stats" USING btree ("signal_type","as_of_day");--> statement-breakpoint
CREATE UNIQUE INDEX "signal_events_symbol_signal_day_unique" ON "signal_events" USING btree ("symbol","signal_type","signal_day");--> statement-breakpoint
CREATE INDEX "signal_events_type_day_idx" ON "signal_events" USING btree ("signal_type","signal_day");--> statement-breakpoint
CREATE INDEX "signal_events_symbol_day_idx" ON "signal_events" USING btree ("symbol","signal_day");