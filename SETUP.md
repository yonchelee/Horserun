# Horserun · 멀티플레이 + 카카오 로그인 셋업

PartyKit이 작년 Cloudflare에 인수되면서 `partykit.io`의 호스팅 대시보드가 불안정해졌습니다 (500 MIDDLEWARE_INVOCATION_FAILED 등). 이 프로젝트는 그래서 `partyserver` + `wrangler`로 **Cloudflare Workers에 직접 배포**하도록 구성돼 있습니다. 더 안정적이고 무료 티어도 충분합니다.

## 0. 환경변수 요약

| 환경변수 | 의미 | 필수? |
|---|---|---|
| `VITE_PARTYKIT_HOST` | Worker 호스트 (e.g. `horserun.username.workers.dev`) | 멀티플레이 필요시 |
| `VITE_PARTYKIT_ROOM` | 룸 ID (기본 `main`) | 선택 |
| `VITE_KAKAO_JS_KEY` | 카카오 디벨로퍼스의 JavaScript Key | 카카오 로그인 필요시 |

`.env.example`을 `.env.local`로 복사한 뒤 채우세요. 둘 다 비워두면 **게스트 + 봇 single-player** 모드로 동작합니다.

## 1. Cloudflare Workers에 서버 배포

### 1-1. Cloudflare 계정
https://dash.cloudflare.com 가입 (무료). 카드 등록 없이 Workers 무료 티어 사용 가능 (월 100,000 요청).

### 1-2. wrangler 로그인 + 배포
프로젝트 루트에서:
```bash
npm install
npx wrangler login   # 브라우저 OAuth (Cloudflare 계정 인증)
npm run deploy:party
```

`wrangler login`은 PartyKit과 달리 안정적으로 작동합니다. OAuth 콜백이 안전하게 처리됩니다.

배포 성공하면 다음과 같이 출력됩니다:
```
Published horserun (1.23 sec)
  https://horserun.<your-handle>.workers.dev
Current Deployment ID: ...
```

이 URL을 `.env.local`의 `VITE_PARTYKIT_HOST`에 넣으세요 (스킴 `https://` 제외):
```
VITE_PARTYKIT_HOST=horserun.<your-handle>.workers.dev
```

### 1-3. 로컬에서 서버 띄우기 (선택)
배포 없이 로컬에서만 테스트하려면:
```bash
# 터미널 1
npm run dev:party    # → 127.0.0.1:8787
# 터미널 2
npm run dev          # → 127.0.0.1:5173

# .env.local
VITE_PARTYKIT_HOST=127.0.0.1:8787
```

같은 Wi-Fi의 폰에서도 LAN IP로 접속 가능합니다.

### 1-4. 자동 배포 (GitHub Actions)
`.github/workflows/deploy-worker.yml`이 default 브랜치(`claude/horse-racing-game-fiALg`)로 push될 때마다 Worker를 자동 배포합니다. Actions 탭에서 수동 트리거(`workflow_dispatch`)도 가능합니다.

활성화 절차 (한 번만):
1. Cloudflare 대시보드 → My Profile → API Tokens → **Create Token** → "Edit Cloudflare Workers" 템플릿. 만든 토큰 값 복사.
2. Cloudflare 대시보드 우측의 **Account ID** 복사 (Workers & Pages 섹션에서도 확인 가능).
3. GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret**:
   - `CLOUDFLARE_API_TOKEN` = 1단계 토큰
   - `CLOUDFLARE_ACCOUNT_ID` = 2단계 ID

두 시크릿이 등록된 뒤 default로 push되면 워크플로우가 `npm ci` → `wrangler deploy`를 자동으로 실행합니다. 시크릿이 없으면 워크플로우는 실패하고 안전하게 멈춥니다 — 운영 중인 Worker엔 영향 없음.

## 2. 카카오 로그인 등록

### 2-1. 앱 생성
https://developers.kakao.com → 내 애플리케이션 → 애플리케이션 추가하기

- 앱 이름: 자유 (예: Horse run)
- 사업자명: 개인은 본인 이름 가능

### 2-2. JavaScript Key 발급
앱 상세 → "앱 키" → **JavaScript 키** 복사

### 2-3. 플랫폼 등록
"플랫폼" → "Web 플랫폼 등록" → 서비스 도메인 추가:
- 로컬 개발: `http://localhost:5173`
- 배포 후: `https://horserun.vercel.app` 등 실제 도메인

### 2-4. 카카오 로그인 활성화
"카카오 로그인" → "활성화 설정" ON → "동의 항목"에서:
- 닉네임 (필수)
- 프로필 사진 (선택)

### 2-5. 환경변수에 키 입력
```
# .env.local
VITE_KAKAO_JS_KEY=발급받은_JS_KEY
```

## 3. 클라이언트 배포 (Vercel 추천)

1. Vercel에 GitHub 저장소 import
2. 환경변수 추가:
   - `VITE_PARTYKIT_HOST=horserun.<your-handle>.workers.dev`
   - `VITE_PARTYKIT_ROOM=main`
   - `VITE_KAKAO_JS_KEY=...`
3. 배포 버튼

배포된 도메인을 다시 카카오 디벨로퍼스의 "플랫폼" → 서비스 도메인에 추가해야 OAuth가 작동합니다.

## 4. 멀티플레이 동작 방식

- 룸 정원 5명 (기본 `main`). 빈자리는 봇이 채움.
- 입장 즉시 게스트/카카오 신원으로 식별.
- "I'm Ready" 누르면 본인 ready. **5명 전원 ready** 되면 10초 카운트다운 → 자동 경기 시작.
- 경기 종료 후 15초 뒤 자동으로 로비로 리셋.
- 게임 도중 누군가 이탈하면 그 자리는 봇으로 즉시 대체.

서버는 30Hz로 권위 시뮬레이션을 돌리고 모든 클라이언트에 상태를 브로드캐스트합니다. 탭은 클라이언트 → 서버로만 이동하므로 클라이언트 조작은 의미 없습니다.

## 5. 문제 해결

**`wrangler login` 안 됨** → 브라우저가 안 열리면 출력된 URL을 직접 열어 GitHub로 인증. 같은 머신의 사파리/크롬에서 진행해야 callback이 localhost로 돌아옵니다.

**`Couldn't join the lobby` 오류** → `VITE_PARTYKIT_HOST` 오타 확인. 워커가 살아있는지 `npx wrangler deployments list` 또는 직접 `https://horserun.<handle>.workers.dev/parties/main/main` 접속해서 응답 확인.

**같은 방에서 다른 사람을 못 봄** → 두 사람이 같은 `VITE_PARTYKIT_ROOM`을 쓰는지 확인.

**카카오 로그인 팝업이 뜨자마자 닫힘** → 카카오 디벨로퍼스의 플랫폼 도메인에 현재 접속 도메인이 등록됐는지 확인.

## 6. 비용

- **Cloudflare Workers 무료 티어**: 월 100,000 요청, 30 GB-s CPU 시간. 작은 멀티플레이 게임엔 충분합니다.
- **Durable Objects**: 무료 티어에 1M req/month 포함.
- **Vercel 프론트엔드**: 무료 hobby 플랜으로 충분.

소소하게 사람 많이 들어오기 시작하면 Workers Paid 플랜 ($5/월) 검토.
