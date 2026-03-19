# Vercel 배포 가이드

## 1. Git 권한 문제 해결 (현재 오류 시)

터미널에서 프로젝트 폴더로 이동한 뒤:

```bash
# .git 폴더 소유권 확인 후 필요시 수정 (macOS/Linux)
sudo chown -R $(whoami) .git
```

이후 다시:

```bash
git add -A
git status
git commit -m "Prepare for Vercel deployment"
```

---

## 2. GitHub에 올리기

1. **GitHub에서 새 저장소 생성**
   - https://github.com/new
   - 저장소 이름 예: `stock-analyze`
   - Public 선택 후 Create repository

2. **로컬에서 원격 추가 후 푸시**

```bash
git remote add origin https://github.com/YOUR_USERNAME/stock-analyze.git
git branch -M main
git push -u origin main
```

(GitHub 사용자명으로 `YOUR_USERNAME` 변경)

---

## 3. Vercel 배포

1. **Vercel 접속**  
   https://vercel.com → 로그인 (GitHub 연동 권장)

2. **프로젝트 가져오기**
   - "Add New..." → "Project"
   - "Import Git Repository"에서 방금 푸시한 `stock-analyze` 선택
   - Framework Preset: **Next.js** (자동 감지됨)
   - Root Directory: 그대로
   - "Deploy" 클릭

3. **환경 변수 설정 (필수)**  
   현재는 리포트 생성 + DB 저장 + 공시/뉴스 온디맨드 수집이 동작하므로
   아래 값들을 함께 설정해야 합니다.

   - 프로젝트 설정 → **Settings** → **Environment Variables**
   - 필수:
     - `OPENAI_API_KEY`
     - `DATABASE_URL`
     - `DART_API_KEY`
     - `NEXTAUTH_SECRET`
     - `NEXTAUTH_URL` (예: `https://your-app.vercel.app`)
   - 권장:
     - `REPORT_DEMO_MODE`
     - `REPORT_DEMO_MEASURE_USAGE`
     - `AI_BUDGET_KRW_MONTHLY`
     - `AI_COST_INPUT_KRW_PER_1M`
     - `AI_COST_OUTPUT_KRW_PER_1M`
     - `AI_TOKEN_BUDGET_MONTHLY`

   저장 후 **Redeploy** 한 번 해주면 적용됩니다.

   상세 체크리스트는 `docs/VERCEL_ENV_CHECKLIST.md` 참고.

4. **DB 마이그레이션 적용**

```bash
npm run db:migrate
```

---

## 4. 배포 후 확인

- Vercel 대시보드에서 배포된 URL 확인 (예: `stock-analyze-xxx.vercel.app`)
- 해당 URL로 접속해 동작 확인

---

## 참고

- `.env.local`은 `.gitignore`에 포함되어 있어 Git에는 올라가지 않습니다.
- API 키는 반드시 Vercel 환경 변수로만 설정하고, 코드나 공개 저장소에 넣지 마세요.
