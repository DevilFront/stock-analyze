-- =============================================================================
-- 주식 리포트 고도화용 PostgreSQL 스키마
-- 전략: ① 섹터 내 상대적 위치 ② 공시-주가 Event Study ③ 수급 주체별 누적 매집
-- =============================================================================

-- 기업 기본 정보 및 섹터 분류
CREATE TABLE IF NOT EXISTS companies (
  symbol       VARCHAR(20) PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  sector       VARCHAR(100) NOT NULL,
  market_cap   BIGINT,
  currency     VARCHAR(10) DEFAULT 'KRW',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies(sector);

-- 일일 주가 + 수급 + 기술지표 (레이더/누적 수급 차트용)
CREATE TABLE IF NOT EXISTS daily_stats (
  id           BIGSERIAL PRIMARY KEY,
  symbol       VARCHAR(20) NOT NULL REFERENCES companies(symbol) ON DELETE CASCADE,
  date         DATE NOT NULL,
  open         NUMERIC(18, 2),
  high         NUMERIC(18, 2),
  low          NUMERIC(18, 2),
  close        NUMERIC(18, 2),
  volume       BIGINT,
  -- 수급 주체별 순매수 수량 (누적 집계용)
  net_foreign  BIGINT DEFAULT 0,
  net_inst     BIGINT DEFAULT 0,
  net_individual BIGINT DEFAULT 0,
  -- 레이더/상대위치용 지표 (JSONB로 확장 가능)
  metrics      JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_symbol_date ON daily_stats(symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC);

-- metrics 예시: { "profitability": 72, "growth": 65, "stability": 80, "dividend": 45, "valuation": 55 }

-- 섹터별 평균 지표 (매일 스케줄러로 계산·저장)
CREATE TABLE IF NOT EXISTS sector_averages (
  id           BIGSERIAL PRIMARY KEY,
  sector       VARCHAR(100) NOT NULL,
  date         DATE NOT NULL,
  metrics      JSONB NOT NULL DEFAULT '{}',
  company_count INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sector, date)
);

CREATE INDEX IF NOT EXISTS idx_sector_averages_sector_date ON sector_averages(sector, date DESC);

-- 공시 이력 + 공시 시점 주가 반응 (Event Study용)
CREATE TABLE IF NOT EXISTS announcements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol          VARCHAR(20) NOT NULL REFERENCES companies(symbol) ON DELETE CASCADE,
  title           VARCHAR(500),
  date            DATE NOT NULL,
  category        VARCHAR(50),
  source          VARCHAR(100),
  url             TEXT,
  summary         TEXT,
  sentiment       VARCHAR(20),
  -- 공시일 기준 N일 후 수익률 등 (Event Study 결과 저장)
  price_impact    JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- price_impact 예시: { "return_1d": -1.2, "return_5d": 2.1, "return_10d": 5.3 }

CREATE INDEX IF NOT EXISTS idx_announcements_symbol_date ON announcements(symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_category ON announcements(symbol, category);

-- =============================================================================
-- 뷰/함수 예시 (선택)
-- =============================================================================

-- 종목별 최근 수급 누적 (120일) — Stacked Area Chart용
-- CREATE OR REPLACE VIEW v_cumulative_flow AS
-- SELECT
--   symbol,
--   date,
--   SUM(net_foreign) OVER (PARTITION BY symbol ORDER BY date) AS cum_foreign,
--   SUM(net_inst) OVER (PARTITION BY symbol ORDER BY date) AS cum_inst,
--   SUM(net_individual) OVER (PARTITION BY symbol ORDER BY date) AS cum_individual
-- FROM daily_stats;
