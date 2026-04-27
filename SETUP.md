# Horserun · 멀티플레이 + 카카오 로그인 셋업

이 문서는 **PartyKit 서버 배포** + **카카오 로그인 등록**을 위한 단계별 가이드입니다. 아무것도 안 해도 게임은 게스트 + 봇으로 동작하지만, 진짜 사람 5명이 같은 방에서 경기하려면 아래 두 가지를 등록해야 합니다.

## 0. 빠른 요약

| 환경변수 | 의미 | 필수? |
|---|---|---|
| `VITE_PARTYKIT_HOST` | PartyKit 서버 호스트 (e.g. `horserun.username.partykit.dev`) | 멀티플레이 필요시 |
| `VITE_PARTYKIT_ROOM` | 룸 ID (기본 `main`) | 선택 |
| `VITE_KAKAO_JS_KEY` | 카카오 디벨로퍼스의 JavaScript Key | 카카오 로그인 필요시 |

`.env.example`를 `.env.local`로 복사한 뒤 채우세요. 둘 다 비워두면 **게스트 + 봇 single-player** 모드로 동작합니다.

## 1. PartyKit 서버 배포 (실시간 멀티플레이)

### 1-1. Cloudflare 계정
PartyKit은 Cloudflare Workers 위에서 돕니다. https://dash.cloudflare.com 가입 (무료).

### 1-2. PartyKit 로그인 + 배포
프로젝트 루트에서:
```bash
npx partykit login    # 브라우저 팝업으로 Cloudflare 인증
npm run deploy:party
```

배포 성공하면 다음과 비슷한 URL이 출력됩니다:
```
https://horserun.<your-handle>.partykit.dev
```

이걸 `.env.local`의 `VITE_PARTYKIT_HOST`에 넣으세요 (스킴 `https://` 제외하고 호스트만):
```
VITE_PARTYKIT_HOST=horserun.<your-handle>.partykit.dev
```

### 1-3. 로컬에서 서버 띄우기 (선택)
배포 없이 로컬에서만 테스트하려면:
```bash
# 터미널 1
npm run dev:party   # → 127.0.0.1:1999
# 터미널 2
npm run dev          # → 127.0.0.1:5173

# .env.local
VITE_PARTYKIT_HOST=127.0.0.1:1999
```

같은 Wi-Fi의 폰에서도 접속 가능 (LAN IP 사용).

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
   - `VITE_PARTYKIT_HOST=horserun.<your-handle>.partykit.dev`
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

**"Couldn't join the lobby" 오류** → `VITE_PARTYKIT_HOST` 오타 확인. 서버가 배포됐는지 `npx partykit list`로 확인.

**카카오 로그인 팝업이 뜨자마자 닫힘** → 카카오 디벨로퍼스의 플랫폼 도메인에 현재 접속 도메인이 등록됐는지 확인.

**같은 방에서 다른 사람을 못 봄** → 두 사람이 같은 `VITE_PARTYKIT_ROOM`을 쓰는지 확인. 룸 이름이 다르면 다른 방에 들어갑니다.
