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
-- 확장 스키마 (퀀트 스코어링 / 백테스트 / 멀티소스 교차검증)
-- =============================================================================

-- 퀀트 스코어 일별 스냅샷 (상위 1% 등급 산출 근거)
CREATE TABLE IF NOT EXISTS quant_scores (
  id                BIGSERIAL PRIMARY KEY,
  symbol            VARCHAR(20) NOT NULL REFERENCES companies(symbol) ON DELETE CASCADE,
  date              DATE NOT NULL,
  total_score       NUMERIC(8, 3) NOT NULL,
  sector_percentile NUMERIC(6, 2),        -- 같은 섹터 내 백분위
  market_percentile NUMERIC(6, 2),        -- 전체 시장 백분위
  grade             VARCHAR(10),           -- 예: S, A+, A, B ...
  -- 컴포넌트 스코어 (가중합 산출용)
  score_value       NUMERIC(8, 3),
  score_quality     NUMERIC(8, 3),
  score_growth      NUMERIC(8, 3),
  score_momentum    NUMERIC(8, 3),
  score_risk        NUMERIC(8, 3),
  score_supply      NUMERIC(8, 3),         -- 수급 점수 (외인/기관 매집 반영)
  score_sentiment   NUMERIC(8, 3),         -- 뉴스/커뮤니티 심리 점수
  model_version     VARCHAR(50) DEFAULT 'v1',
  factors           JSONB DEFAULT '{}',    -- 세부 팩터 원시값/정규화값
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, date, model_version)
);

CREATE INDEX IF NOT EXISTS idx_quant_scores_symbol_date ON quant_scores(symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_quant_scores_total_score ON quant_scores(date DESC, total_score DESC);

-- 백테스트 가능한 신호 발생 이력 (예: 골든크로스, 거래량 급증)
CREATE TABLE IF NOT EXISTS signal_events (
  id                BIGSERIAL PRIMARY KEY,
  symbol            VARCHAR(20) NOT NULL REFERENCES companies(symbol) ON DELETE CASCADE,
  signal_type       VARCHAR(80) NOT NULL,  -- 예: GOLDEN_CROSS_5_20
  signal_day        DATE NOT NULL,
  signal_value      NUMERIC(18, 6),        -- 신호 강도/지표값
  regime            VARCHAR(50),           -- 상승장/하락장/횡보장 구분
  features          JSONB DEFAULT '{}',    -- 당시 컨텍스트 특성치
  -- 미래 수익률 라벨(백테스트 재활용)
  return_1d         NUMERIC(10, 4),
  return_5d         NUMERIC(10, 4),
  return_10d        NUMERIC(10, 4),
  return_20d        NUMERIC(10, 4),
  max_drawdown_20d  NUMERIC(10, 4),
  hit_5d            BOOLEAN,               -- 5일 기준 성공/실패
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, signal_type, signal_day)
);

CREATE INDEX IF NOT EXISTS idx_signal_events_type_day ON signal_events(signal_type, signal_day DESC);
CREATE INDEX IF NOT EXISTS idx_signal_events_symbol_day ON signal_events(symbol, signal_day DESC);

-- 신호별 백테스트 요약 통계 (리포트에 바로 노출할 문구용)
CREATE TABLE IF NOT EXISTS signal_backtest_stats (
  id                BIGSERIAL PRIMARY KEY,
  signal_type       VARCHAR(80) NOT NULL,
  as_of_date        DATE NOT NULL,
  sample_size       INT NOT NULL DEFAULT 0,
  win_rate_5d       NUMERIC(6, 2),         -- 예: 80.00 (%)
  win_rate_10d      NUMERIC(6, 2),
  avg_return_5d     NUMERIC(10, 4),
  avg_return_10d    NUMERIC(10, 4),
  median_return_5d  NUMERIC(10, 4),
  median_return_10d NUMERIC(10, 4),
  sharpe_20d        NUMERIC(10, 4),
  max_drawdown      NUMERIC(10, 4),
  by_regime         JSONB DEFAULT '{}',    -- 장세별 분해 통계
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(signal_type, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_signal_backtest_stats_type_date ON signal_backtest_stats(signal_type, as_of_date DESC);

-- 커뮤니티/소셜 심리 일별 집계 (멀티소스 교차검증의 한 축)
CREATE TABLE IF NOT EXISTS community_sentiment_daily (
  id                BIGSERIAL PRIMARY KEY,
  symbol            VARCHAR(20) NOT NULL REFERENCES companies(symbol) ON DELETE CASCADE,
  date              DATE NOT NULL,
  source            VARCHAR(50) NOT NULL,  -- 예: NAVER_STOCK, DCINSIDE, YOUTUBE
  mention_count     INT DEFAULT 0,
  unique_authors    INT DEFAULT 0,
  positive_count    INT DEFAULT 0,
  negative_count    INT DEFAULT 0,
  neutral_count     INT DEFAULT 0,
  sentiment_score   NUMERIC(8, 4),         -- -1 ~ +1
  buzz_zscore       NUMERIC(8, 4),         -- 평소 대비 언급 급증 정도
  spam_ratio        NUMERIC(8, 4),         -- 품질 낮은 언급 비율
  raw               JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, date, source)
);

CREATE INDEX IF NOT EXISTS idx_community_sentiment_symbol_date ON community_sentiment_daily(symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_community_sentiment_source_date ON community_sentiment_daily(source, date DESC);

-- 공시 + 차트 + 커뮤니티를 결합한 교차검증 결과 (리포트 핵심 문장 생성용)
CREATE TABLE IF NOT EXISTS crosscheck_daily (
  id                    BIGSERIAL PRIMARY KEY,
  symbol                VARCHAR(20) NOT NULL REFERENCES companies(symbol) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  dart_event_count_7d   INT DEFAULT 0,
  dart_event_score_7d   NUMERIC(8, 4),     -- 공시 중요도/긍부정 반영
  price_return_5d       NUMERIC(10, 4),
  volume_zscore         NUMERIC(8, 4),
  community_buzz_zscore NUMERIC(8, 4),
  community_sentiment   NUMERIC(8, 4),
  divergence_score      NUMERIC(8, 4),     -- 가격 vs 심리/공시 괴리
  underreaction_score   NUMERIC(8, 4),     -- 호재 대비 가격 미반응 점수
  conviction_score      NUMERIC(8, 4),     -- 신호 신뢰도 종합
  flags                 JSONB DEFAULT '[]',-- 예: ["LOW_ATTENTION_VALUE", "DISCLOSURE_POSITIVE"]
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_crosscheck_daily_symbol_date ON crosscheck_daily(symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_crosscheck_daily_underreaction ON crosscheck_daily(date DESC, underreaction_score DESC);

-- 이슈(공시/뉴스) 발생 후 단기 급등/급락 라벨
CREATE TABLE IF NOT EXISTS issue_price_moves (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol         VARCHAR(20) NOT NULL REFERENCES companies(symbol) ON DELETE CASCADE,
  event_source   VARCHAR(20) NOT NULL,      -- DART | NEWS
  event_id       VARCHAR(100) NOT NULL,     -- announcements.id | news_items.id
  event_day      DATE NOT NULL,
  event_title    VARCHAR(500) NOT NULL,
  threshold_pct  NUMERIC(8, 4) NOT NULL,    -- 기본 5.0000
  lookahead_days INT NOT NULL DEFAULT 5,
  base_day       DATE NOT NULL,             -- 실제 비교 기준 거래일(이벤트일 이후 첫 거래일)
  base_close     NUMERIC(18, 4) NOT NULL,
  max_up_pct     NUMERIC(10, 4),
  max_down_pct   NUMERIC(10, 4),
  move_type      VARCHAR(20) NOT NULL,      -- SURGE | DROP | BOTH
  move_day       DATE,                      -- threshold 첫 충족일
  move_pct       NUMERIC(10, 4),
  context        JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, event_source, event_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_price_moves_symbol_day ON issue_price_moves(symbol, event_day DESC);
CREATE INDEX IF NOT EXISTS idx_issue_price_moves_move_type_day ON issue_price_moves(move_type, event_day DESC);

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
