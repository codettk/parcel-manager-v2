# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

보구곶리 농지 필지 협업 색칠/메모 모바일 웹 앱의 v2 재구축. v1(`C:\dev\codettk\bogugot-map`)과 **별도 서비스·별도 Supabase DB**로 완전 분리 운영한다.

**기준 문서**: `C:\dev\codettk\bogugot-map\docs\plans\2026-06-11_v2-마이그레이션_작업명세서.md` — 전체 Phase 계획, v1→v2 기능 매핑표(M-1~M-18), DB 스키마, API 명세가 여기 있다. 작업 전 반드시 참조.

**마이그레이션 원칙 (선별적 포팅)**: v1 로직을 그대로 이식하지 않는다. 기능 착수 시 보존/재설계/폐기 판정을 먼저 내린다. 검증된 핵심 로직(렌더 패스 순서, 좌표계, 히트테스트, 400ms 닫힘 가드, clientId 에코 가드)은 동작 보존 대상.

## 명령어

```bash
pnpm dev           # Vite 개발 서버 (5173, /api → 3000 프록시)
pnpm dev:api       # Express dev server (3000, tsx watch)
pnpm exec supabase start   # 로컬 Supabase 스택 (54321 API / 54323 Studio)
pnpm lint          # ESLint
pnpm format        # Prettier 쓰기 (format:check는 검사만)
pnpm typecheck     # tsc -b — src/, server/, api/ 전부 검사
pnpm test          # Vitest 단위 테스트 (tests/unit/)
pnpm test -- tests/unit/geo.test.ts   # 단일 테스트 파일
pnpm build         # tsc -b && vite build
```

Docker 개발: `docker compose -f docker/docker-compose.yml up` (web + api. Supabase는 호스트에서 CLI로 별도 기동, 컨테이너에서 `host.docker.internal:54321`로 접근).

## 아키텍처

- **API 계층 (v1 부채 청산의 핵심)**: 모든 API 로직은 `server/handlers/`의 **런타임 비의존 순수 함수**로만 작성한다 — req/res 객체 직접 접근 금지. `server/adapters/express.ts`(Docker 개발)와 `server/adapters/vercel.ts`(배포)가 동일 핸들러를 양쪽 런타임에 연결하고, `api/*.ts`는 vercelAdapter로 감싼 재export만 한다. v1의 server.js ↔ api/ 로직 분기 재발 방지가 목적.
- **API 타입**: 요청/응답은 `src/types/api/`의 zod 스키마에서 `z.infer`로 추론 — 프론트 클라이언트와 핸들러가 같은 스키마를 import한다.
- **features/ 수직 분할**: 도메인 로직(컴포넌트+훅+로직)은 `src/features/<domain>/` 안에서만. `src/components/ui/`는 도메인 무지 순수 UI만 (도메인 타입 import 금지, 의존 방향: features → ui).
- **지도 렌더**: `src/features/map/engine/`은 React를 import하지 않는 순수 TS Canvas 2D 렌더 엔진으로 작성한다 (현재 `MapCanvas.tsx`는 Phase 0 스파이크 — M-2에서 엔진으로 대체 예정). 렌더 패스는 v1 기준 8개(1차~7차 + 1.5차 색없는그룹) + 별도 라벨 캔버스.
- **정적 지오데이터**: `public/data/parcels.json` (필지 4,409개, v1에서 복사) — **절대 수정 금지**. 구조: `{ bbox, parcels: [{ id, jibun, c: [[lng,lat],...] }] }`. `src/utils/geo.ts`의 `makeProjector(bbox)`로 0..1 정규화 평면에 투영해 사용.
- **DB**: 신규 Supabase 프로젝트 (v1과 분리). `app_state` JSON 컬럼은 존재하지 않는다 — 정규화 테이블이 유일한 진실이며, 탭(작업공간) 스키마가 기본 구조. 모든 스키마는 `supabase/migrations/`에 존재해야 한다 (`supabase db reset`만으로 환경 재현).
- **스타일**: Tailwind v4 + CVA. 디자인 토큰은 `src/styles/tokens.css`의 `@theme` CSS 변수만 참조 — 하드코딩 hex 금지. 팔레트 6색은 DB(color_labels) 소관이라 토큰이 아님.
- **상태**: 서버 동기화 상태는 Zustand 스토어(`src/stores/`), 시트 내부 편집은 로컬 useState draft 패턴. ref 미러 금지.

## 컨벤션 핵심

- TypeScript strict, `any` 금지. 컴포넌트 `PascalCase.tsx`, 훅 `useXxx.ts`, 유틸 `camelCase.ts`.
- 프론트에서 `fetch` 직접 호출 금지 — `src/lib/api.ts` typed client만 사용 (작성 예정).
- 모든 mutate API는 `clientId`를 포함한다 (Realtime 에코 가드).
- 한국어 단일 언어 앱. conventional commits 한국어 본문.
- 주석은 코드로 표현 불가능한 제약(좌표계, 400ms 모바일 가드 등)만.

## 현재 상태 (Phase 0 완료)

스캐폴딩·Docker·Supabase CLI·어댑터 골격·CI·렌더 스파이크까지 완료. 다음은 Phase 1 (컨벤션 문서 + 디자인 토큰 확장 + UI 공통 컴포넌트 18종). Phase 1부터는 `docs/CONVENTIONS.md`가 이 문서보다 우선한다.
