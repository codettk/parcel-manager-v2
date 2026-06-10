# 보구곶리 지적편집도 v2

보구곶리(인천 강화군) 농지 필지를 공동체가 협업으로 색상 표시하고 이름 붙이는 모바일 웹 앱 — v2 재구축.

v1(`../bogugot-map`)과 별도 폴더·별도 서비스·별도 Supabase 프로젝트로 독립 운영한다.
전체 계획: `../bogugot-map/docs/plans/2026-06-11_v2-마이그레이션_작업명세서.md`

## 개발 기동

```bash
# 1. 로컬 Supabase 스택 (Postgres·Realtime·Studio — Docker 컨테이너는 CLI가 관리)
pnpm exec supabase start

# 2. 앱 (web :5173 + api :3000)
docker compose -f docker/docker-compose.yml up

# 3. http://localhost:5173
```

Docker 없이 호스트에서 직접 실행하려면:

```bash
pnpm install
pnpm dev        # Vite (5173, /api는 3000으로 프록시)
pnpm dev:api    # Express dev server (3000)
```

`.env`는 `.env.example`을 복사해 작성한다. 로컬 Supabase 키는 `supabase start` 출력에 표시된다.

## 검사

```bash
pnpm lint          # ESLint
pnpm format:check  # Prettier
pnpm typecheck     # tsc -b (src + server + api)
pnpm test          # Vitest 단위 테스트
pnpm build         # 프로덕션 빌드
```

## 배포

Vercel (프론트 정적 빌드 + `api/` 서버리스 함수). Docker는 개발 환경 전용.
