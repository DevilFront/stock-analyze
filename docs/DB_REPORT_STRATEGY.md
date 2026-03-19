# DB를 활용한 리포트 고도화 전략

DB를 활용하면 조금 더 고품질·고도화된 정보 제공이 가능하다. 아래는 제미나이 추천 컨텐츠를 바탕으로 정리한 **DB 활용 리포트 고도화를 위한 차별화 전략 3가지**와 기술적 조언, 스키마 설계 가이드이다.

---

## 1. 섹터 내 '상대적 위치' 시각화 (Radar Chart & Scatter Plot)

단일 기업 데이터만 보여주지 않고, **DB에 저장된 같은 섹터(예: 반도체) 내 다른 기업들과의 데이터를 실시간 비교**한다.

| 항목 | 내용 |
|------|------|
| **차트** | **레이더 차트(Radar Chart)** — 해당 기업의 [수익성, 성장성, 안정성, 배당, 밸류에이션] 점수를 **섹터 평균과 겹쳐서** 표시 |
| **감탄 포인트** | "삼성전자가 절대적으로 좋다가 아니라, 하이닉스나 마이크론 대비 **현재 어떤 지표가 저평가되어 있는지**"를 AI가 DB 데이터를 근거로 설명 |
| **DB 역할** | **섹터별 평균 지표**를 매일 스케줄러로 계산하여 저장 |

---

## 2. 공시/뉴스 '히스토리'와 주가의 상관관계 (Event Study Chart)

과거에 발생했던 **유사한 공시가 실제 주가에 어떤 영향을 미쳤는지** 통계적으로 보여준다.

| 항목 | 내용 |
|------|------|
| **차트** | **혼합 차트(Combi Chart)** — 하단: 타임라인 형식으로 과거 주요 공시(증자, 수주, 실적발표) 표시 / 상단: 해당 시점 이후 5거래일간 주가 등락률 시각화 |
| **감탄 포인트** | "이 기업은 과거 3번의 유상증자 공시 때마다 **평균 7% 하락 후 10일 만에 반등**하는 패턴을 보였습니다" 같은 **확률적 데이터** 제공 |
| **DB 역할** | **과거 공시 이력과 당시 주가 데이터를 연결(Mapping)**해서 저장 |

---

## 3. '수급 주체별' 누적 매집 흐름 (Stacked Area Chart)

단순 일일 수급이 아니라, **특정 기간(예: 120일) 동안 외인·기관이 어떤 가격대에서 가장 많이 샀는지** '누적' 데이터로 보여준다.

| 항목 | 내용 |
|------|------|
| **차트** | **누적 영역 차트(Stacked Area Chart)** — 외인, 기관, 개인의 **누적 순매수 수량**을 시간 흐름에 따라 쌓아서 표시. 0선 위로 누가 더 많이 쌓여있는지 한눈에 파악 |
| **감탄 포인트** | "현재 주가는 횡보 중이지만, DB 상 **외인의 누적 매집량은 최근 3개월간 역대 최고치**에 도달했습니다" 같은 **숨겨진 매집 신호** 포착 |
| **DB 역할** | **매일 종목별 수급 데이터를 누적**하여 저장·관리 |

---

## 💡 DB 도입 시 '고도화'를 위한 기술적 조언

| 항목 | 설명 |
|------|------|
| **Vector DB (임베딩)** | 과거 리포트 내용이나 뉴스 본문을 벡터화해 저장하면, "3년 전 이맘때 업황과 지금의 뉴스가 얼마나 유사한지"를 AI가 비교 분석 가능 |
| **JSONB 타입** | 주식 데이터는 구조가 유연해야 하므로 **PostgreSQL의 JSONB**로 재무제표·공시 상세 내용을 구조화해 저장하기 적합 |
| **데이터 스케줄러 (Cron)** | 사용자 요청 시에만 긁어오는 방식은 느리다. **새벽에 DB가 미리 섹터 평균·통계 수치를 계산**해 두면 리포트 생성 속도가 빨라져 유료 결제 경험(UX)이 좋아짐 |

---

## 🚀 PostgreSQL 스키마 설계 가이드

### 핵심 테이블 구성

| 테이블 | 용도 |
|--------|------|
| **companies** | 기업 기본 정보 및 **섹터 분류** |
| **daily_stats** | 일일 주가, **수급 주체별 매수량**, 기술적 지표 저장 |
| **sector_averages** | **섹터별 주요 재무 비율 평균** (매일 업데이트) |
| **announcements** | **공시 내용**과 해당 공시 발생 시점의 **주가 변화 데이터** |
| **quant_scores** | 가치/퀄리티/모멘텀/리스크/수급/심리를 결합한 **일별 퀀트 등급** |
| **signal_events** | 골든크로스 등 **신호 발생 시점 + 미래수익률 라벨** 저장 |
| **signal_backtest_stats** | 신호별 승률/평균수익률/샤프/낙폭 등 **백테스트 요약 통계** |
| **community_sentiment_daily** | 커뮤니티 언급량/긍부정/버즈 급증치 **일별 집계** |
| **crosscheck_daily** | 공시 + 가격 + 커뮤니티를 합친 **교차검증 점수** 저장 |
| **issue_price_moves** | 공시/뉴스 이후 N일 내 **±5% 급등락 이벤트 라벨** 저장 |

### 운영 튜닝 포인트 (UI 점수)

- 리포트 좌측 `AI 수급 점수`는 `issue_price_moves` 기반으로 계산
- 가중치 설정 파일: `src/app/report/_lib/issue-score.ts`
  - `baseline`: 중립 점수
  - `balanceMultiplier`: 급등/급락 비중 차이 반영 강도
  - `confidenceMultiplier`: 표본 수에 따른 신뢰도 가점
  - `confidenceSampleCap`: 신뢰도 가점이 포화되는 표본 수

### 테이블 정의 (DDL)

실제 적용용 SQL은 `docs/SCHEMA.sql` 참고.

- **companies**: `symbol`(PK), `name`, `sector`, `market_cap`, `currency`, `created_at` 등
- **daily_stats**: `symbol`, `date`, 주가(open/high/low/close), 거래량, 수급(외인/기관/개인), 기술지표(JSONB) 등
- **sector_averages**: `sector`, `date`, 수익성/성장성/안정성/배당/밸류에이션 등 평균값
- **announcements**: `id`, `symbol`, `title`, `date`, `category`, `summary`, 주가반응(JSONB: 공시일 대비 5일 수익률 등)
- **quant_scores**: `total_score`, `sector_percentile`, `grade`, `score_value~score_sentiment` 등
- **signal_events**: `signal_type`, `signal_day`, `return_1d/5d/10d/20d`, `hit_5d` 등
- **signal_backtest_stats**: `sample_size`, `win_rate_5d`, `avg_return_5d`, `max_drawdown` 등
- **community_sentiment_daily**: `mention_count`, `positive_count`, `buzz_zscore`, `sentiment_score` 등
- **crosscheck_daily**: `underreaction_score`, `divergence_score`, `conviction_score`, `flags` 등
- **issue_price_moves**: `event_source`, `event_id`, `max_up_pct`, `max_down_pct`, `move_type` 등

### 활용 예시

- `companies` + `sector_averages` → **섹터 내 상대적 위치** 계산
- `announcements` + `daily_stats` → **Event Study** (공시–주가 상관관계)
- `daily_stats` 누적 집계 → **수급 주체별 누적 매집** 시각화

### SQL 예시: 섹터 내 상대적 위치 계산

```sql
-- 특정 종목(symbol)의 5개 지표 vs 해당 섹터 평균
WITH company_scores AS (
  SELECT
    c.symbol,
    c.name,
    c.sector,
    ds.date,
    (ds.metrics->>'profitability')::float AS profitability,
    (ds.metrics->>'growth')::float       AS growth,
    (ds.metrics->>'stability')::float    AS stability,
    (ds.metrics->>'dividend')::float     AS dividend,
    (ds.metrics->>'valuation')::float    AS valuation
  FROM companies c
  JOIN daily_stats ds ON ds.symbol = c.symbol
  WHERE c.symbol = '005930'
    AND ds.date = (SELECT MAX(date) FROM daily_stats WHERE symbol = c.symbol)
),
sector_avg AS (
  SELECT sector, date,
    AVG((metrics->>'profitability')::float) AS profitability,
    AVG((metrics->>'growth')::float)        AS growth,
    AVG((metrics->>'stability')::float)     AS stability,
    AVG((metrics->>'dividend')::float)     AS dividend,
    AVG((metrics->>'valuation')::float)    AS valuation
  FROM sector_averages
  WHERE date = (SELECT MAX(date) FROM sector_averages)
  GROUP BY sector, date
)
SELECT
  cs.symbol,
  cs.name,
  cs.sector,
  cs.profitability AS company_profitability,
  sa.profitability AS sector_avg_profitability,
  ROUND((cs.profitability - sa.profitability)::numeric, 2) AS diff_profitability
  -- growth, stability, dividend, valuation 동일 패턴
FROM company_scores cs
JOIN sector_avg sa ON sa.sector = cs.sector;
```

---

## 구현 순서 제안

| 순서 | 항목 | 필요한 테이블 | 비고 |
|------|------|----------------|------|
| 1 | **섹터 내 상대적 위치** | companies, daily_stats, sector_averages | 기존 레이더 차트를 DB 기반 섹터 평균과 연동 |
| 2 | **수급 누적 매집** | daily_stats (net_foreign 등) | 누적 집계 뷰/쿼리 + Stacked Area Chart |
| 3 | **공시–주가 Event Study** | announcements, daily_stats | 공시 이력 + 당일/5일 수익률 매핑 후 Combi Chart |

실제 DDL은 `docs/SCHEMA.sql` 에서 확인 후 DB에 적용하면 된다.

---

## 진행 상태 (2026-03-19)

| 항목 | 상태 | 비고 |
|------|------|------|
| 섹터 상대 비교 (기본) | ✅ | `companies`, `daily_stats`, `sector_averages` |
| 공시 이벤트 스터디 (기본) | ✅ | `announcements.price_impact` |
| 수급 누적 (기본) | ✅ | `daily_stats.net_*` |
| 퀀트 스코어링 | ✅ 스키마 반영 | `quant_scores` 추가 |
| 백테스트 통계 | ✅ 스키마 반영 | `signal_events`, `signal_backtest_stats` 추가 |
| 멀티소스 교차검증 | ✅ 스키마 반영 | `community_sentiment_daily`, `crosscheck_daily` 추가 |
| ETL/스케줄러 구현 | ⏳ 다음 단계 | 수집기와 집계 job 필요 |

---

## 다음 단계

- **어떤 데이터를 먼저 DB화할지** 우선순위 정하기
- **가장 먼저 시도하고 싶은 분석**이 있으면 해당 테이블·스케줄·API부터 구현
- PostgreSQL 연결 시 `DATABASE_URL` 환경 변수 설정 (예: `.env.local`)

DB를 추가하면 서비스 성격이 **'정보 전달'**에서 **'인사이트 제공'**으로 바뀐다.

---

## (추가) 주식 전문가 관점: DB로 더 만들 수 있는 고급 인사이트 아이디어

아래는 “지금 논의한 3가지”보다 한 단계 더 나아가, **DB가 있어야만 가능한** 차별화 포인트들이다. (특히 **확률/비교/패턴/리스크**를 수치로 제시하는 기능이 유료화에 강함)

### 4. 밸류에이션 ‘리레이팅’ 감지 (Multiple Expansion/Compression)

- **무엇을 보여주나**: 주가 상승이 실적 때문인지(이익 증가), 아니면 **PER/PBR 멀티플이 올라서**(리레이팅) 생긴 건지 분해
- **차트**: 워터폴/분해 차트 (수익(이익) 요인 vs 멀티플 요인)
- **감탄 포인트**: “최근 3개월 상승분의 70%가 이익 개선이 아니라 **PER 리레이팅**에서 발생 → 기대감 과열/정당화 여부”처럼 한 문장으로 인사이트
- **DB 역할**: 일별 시가총액/주가 + EPS(추정치 포함) + PER/PBR/EV·EBITDA를 저장하고, 기간별 분해 계산

### 5. ‘실적 서프라이즈’ 후 평균 경로 (Post-Earnings Drift)

- **무엇을 보여주나**: 실적 발표 후 과거 패턴을 통계화해 “발표 직후 반응 → 1~20거래일 평균 경로”를 제시
- **차트**: Event Study 확장(실적 이벤트 전용) — 서프라이즈 크기 구간별 평균 누적수익률(CAR)
- **감탄 포인트**: “서프라이즈 상위 20% 발표 때, 평균적으로 **5거래일 후 추가 +3.1%** 드리프트”
- **DB 역할**: 발표일(공시) + 컨센서스(예상치) + 실제치(발표) + 주가 시계열을 매핑해 ‘서프라이즈’ 산출 및 구간별 집계

### 6. ‘리스크 지문’(Risk Fingerprint): 변동성/낙폭/회복력 프로파일

- **무엇을 보여주나**: 같은 섹터 내에서도 종목마다 리스크가 다르다. 변동성·최대낙폭·회복기간·급락 빈도를 프로파일링
- **차트**: 히트맵/레이더(리스크 축) + 섹터 내 산점도(수익률 vs 변동성)
- **감탄 포인트**: “이 종목은 변동성은 낮지만 **급락 발생 시 회복이 느린 타입**(회복기간 상위 10%)”
- **DB 역할**: 일별 수익률로 롤링 변동성/드로우다운/회복기간 등을 계산해 저장(스케줄러 추천)

### 7. 수급의 ‘가격대’ 매집: 주가-수급 결합(누가 어느 가격에서 샀나)

- **무엇을 보여주나**: 단순 누적 수급을 넘어, **가격 구간별**로 외인/기관/개인이 얼마나 매집했는지(Volume Profile 유사)
- **차트**: 가격대 히스토그램 + 주체별 스택(또는 heatmap)
- **감탄 포인트**: “외인은 62,000~64,000원 구간에 매집이 집중 → **지지/방어 가격대** 후보”
- **DB 역할**: 일별(혹은 더 미세) 가격과 수급을 결합해 가격구간 버킷 집계(기간별)

### 8. ‘유사 국면’ 검색 (Vector DB + 시계열 피처) — 진짜 유료 기능 후보

- **무엇을 보여주나**: “지금이 과거 어느 때와 비슷한가?”를 정량화. 뉴스/공시 텍스트 유사도 + 가격/수급/변동성 패턴 유사도를 함께
- **차트**: 유사 국면 Top-N 카드 + 당시 이후 평균 성과 분포(확률)
- **감탄 포인트**: “현재(뉴스+수급+변동성) 국면은 2019-xx와 2023-xx와 유사. 당시 **20거래일 후 수익률 중앙값 +x%**”
- **DB 역할**: 텍스트 임베딩(Vector DB) + 시계열 피처(리턴, 변동성, 수급, 모멘텀)를 벡터로 저장해 최근 구간과 KNN 검색

### 9. ‘팩터 노출’/스타일 분석 (퀄리티·밸류·모멘텀·사이즈)

- **무엇을 보여주나**: 종목이 어떤 스타일(팩터)에 가까운지, 그리고 최근 스타일이 바뀌고 있는지
- **차트**: 팩터 레이더 + 시계열(노출 변화)
- **감탄 포인트**: “최근 6개월 **밸류 → 모멘텀** 성격으로 전환(리레이팅 구간)”
- **DB 역할**: 기본 재무/밸류에이션/수익률 기반으로 팩터 스코어를 산출해 섹터/시장 대비 Z-score 저장

### 10. ‘이상 징후’ 탐지 (Anomaly Detection): 수급·변동성·거래대금 급변

- **무엇을 보여주나**: 평소 패턴 대비 비정상적인 거래/수급/변동성 급등을 자동 탐지(알림)
- **차트**: 시계열 + 이상치 마커 + “왜 이상인지” 근거(평균 대비 몇 표준편차)
- **감탄 포인트**: “거래대금이 1년 평균 대비 **4.2σ** 급증 + 외인 순매수 동반 → 이벤트 가능성”
- **DB 역할**: 롤링 평균/표준편차 기반 탐지 값 저장 + 임계치 룰/모델 결과 저장 + 알림 큐

### 11. ‘섹터 로테이션’ 대시보드 (시장 전체 관점)

- **무엇을 보여주나**: 섹터별 상대강도(RS), 자금 유입, 이익추정치 변화로 로테이션을 보여줌
- **차트**: 섹터 상대강도 히트맵 + 모멘텀 타임라인 + 자금흐름(섹터 ETF/지수 기반)
- **감탄 포인트**: “2주 연속으로 반도체 섹터가 **이익추정 상향 + 자금유입 동반**으로 선도”
- **DB 역할**: 섹터 단위로 성과/수급/이익추정 변화(가능하면) 집계 테이블을 매일 업데이트

### 12. “내가 산 가격 vs 시장 평균 매집가” 개인화 (유저 포트폴리오 DB가 있을 때)

- **무엇을 보여주나**: 사용자의 평균매수가와, 외인/기관의 추정 매집가(가격대 매집 기반)를 비교해 심리적 의사결정 지원
- **차트**: 개인 평균단가 라인 + 주체별 매집 밀집 구간 + 손익/리스크 시나리오
- **감탄 포인트**: “외인 매집 중심 가격대가 내 단가보다 위/아래인지로 **‘동행/역행’** 판단”
- **DB 역할**: 사용자 포지션(매수/매도 체결) 저장 + 종목 데이터와 조인

### 우선순위 제안 (현실적인 MVP)

- **가장 먼저 추천**: (4) 리레이팅 분해, (6) 리스크 지문, (10) 이상징후 탐지  
  → 데이터가 비교적 단순(일봉 기반)이고 “아, 이건 돈 주고 볼 만하다”는 포인트가 명확함
