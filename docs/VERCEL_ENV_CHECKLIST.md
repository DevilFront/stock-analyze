# Vercel 배포 환경변수 체크리스트

이 문서는 현재 코드 기준(온디맨드 수집 + 리포트 생성 + 사용량 기록)으로
Vercel에 설정해야 할 환경변수를 빠르게 점검하기 위한 체크리스트다.

## 1) 필수 (없으면 핵심 기능 불가)

- `OPENAI_API_KEY`
  - 리포트 생성 LLM 호출
- `DATABASE_URL`
  - PostgreSQL 연결 (리포트/공시/뉴스/사용량 저장)
- `DART_API_KEY`
  - 온디맨드 공시 수집
- `NEXTAUTH_SECRET`
  - Auth.js 세션 서명
- `NEXTAUTH_URL`
  - 예: `https://your-app.vercel.app`

## 2) 권장 (운영 안정성/비용 추적)

- `REPORT_DEMO_MODE`
  - `0`: 정상 과금/인증 흐름
  - `1`: 데모 모드(인증/크레딧 우회)
- `REPORT_DEMO_MEASURE_USAGE`
  - 데모 모드에서도 토큰/비용 로깅 유지 여부 (`1` 권장)
- `AI_BUDGET_KRW_MONTHLY`
  - 월 예산 상한 (기본 30000)
- `AI_COST_INPUT_KRW_PER_1M`
- `AI_COST_OUTPUT_KRW_PER_1M`
  - 1M 토큰당 KRW 단가. 비우면 `0` 처리되어 비용 대신 토큰 상한 사용
- `AI_TOKEN_BUDGET_MONTHLY`
  - 단가 미설정 시 토큰 상한 (기본 5000000)

## 3) 선택 (사용 시에만)

- Google 로그인 사용 시
  - `AUTH_GOOGLE_ID`
  - `AUTH_GOOGLE_SECRET`
- 결제(Stripe) 사용 시
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`

## 4) Vercel 설정 순서

1. Vercel 프로젝트 생성 후 `Environment Variables`에 위 값 입력
2. `Production` + `Preview` 둘 다 체크 (권장)
3. 저장 후 Redeploy
4. 원격 DB에 마이그레이션 적용:
   - `npm run db:migrate`

## 5) 배포 후 동작 점검 시나리오

1. `/report/000660` 진입
   - 페이지 로드만 수행, 수집/비용 발생 없음
2. `리포트 생성` 버튼 클릭
   - 온디맨드 수집(재무/공시/시세/뉴스/이슈) 후 리포트 생성
3. 대시보드 계정 패널에서 확인
   - 생성 횟수, 입력/출력 토큰, 예상 비용 집계 노출

## 6) 주의사항

- `.env.local`은 로컬 전용. 절대 Git에 커밋하지 말 것.
- 키 값은 문서/코드에 하드코딩하지 말고 Vercel 환경변수에만 저장.
- 현재 Next.js 앱이 API까지 포함하므로, 별도 `uvicorn` 서버는 이 플로우에 필수 아님.

