# 코드 컨벤션

> 이 문서는 모든 코드(사람·에이전트 작성 불문)가 준수해야 하는 규칙이다.
> **[기계 강제]** 표시 항목은 lint/typecheck에서 위반 시 실패한다. 나머지는 verifier 게이트에서 리뷰로 강제한다.

## 1. 네이밍

| 대상            | 규칙                        | 예                        |
| --------------- | --------------------------- | ------------------------- |
| 컴포넌트 파일   | `PascalCase.tsx`            | `ParcelSheet.tsx`         |
| 훅              | `useXxx.ts`                 | `useGestures.ts`          |
| 유틸/일반 모듈  | `camelCase.ts`              | `geo.ts`, `formatArea.ts` |
| 상수            | `SCREAMING_SNAKE`           | `AREA_UNITS`              |
| 타입/인터페이스 | `PascalCase`, I-prefix 금지 | `Parcel`, ~~`IParcel`~~   |

## 2. 파일 배치와 의존 방향

- 도메인 로직은 `src/features/<domain>/` 안에서만 작성한다 (컴포넌트+훅+로직 수직 분할).
- `src/components/ui/`는 **도메인 무지(無知)** 순수 UI만: `features/`, `stores/`, `types/`(도메인 타입), `lib/` import 금지. **[기계 강제]**
- 의존 방향: `features → components/ui`, `features → utils`. 역방향 금지.
- `src/features/map/engine/`은 React를 import하지 않는 순수 TS. **[기계 강제]**

## 3. 상태

- 서버 동기화 상태(필지·그룹·탭·팔레트)는 Zustand 스토어(`src/stores/`).
- 시트 내부 편집 상태는 로컬 `useState` draft 패턴 (v1 검증 패턴: 열 때 draft 복사 → 저장 시 커밋).
- **ref 미러 금지** — 최신 값이 필요하면 스토어 `getState()` 사용.
- 숫자 입력 draft는 문자열로 보관한다 (소수점 입력 중간 상태 보존 — v1 계산기 패턴).

## 4. 스타일

- 인라인 `style` 객체 금지. Tailwind 유틸 + CVA variant만 사용.
  - 예외: Canvas 크기 지정 등 런타임 계산 값만 허용 (주석으로 사유 명시).
- 색상·간격·폰트는 `src/styles/tokens.css`의 토큰만 참조. **하드코딩 hex 금지 [기계 강제]**
  - 예외: Canvas 렌더 코드의 `ctx.fillStyle` 등은 토큰 CSS 변수를 읽을 수 없으므로 `engine/` 내 상수 모듈에 모아 정의하고 토큰과 값을 일치시킨다.
- 팔레트 6색(eco/sun/...)은 DB(color_labels) 소관 — 토큰으로 만들지 않는다.

## 5. API

- 프론트는 `src/lib/api.ts`의 typed client만 사용. `fetch` 직접 호출 금지.
- 핸들러는 `server/handlers/`의 순수 함수로만 작성 — req/res 객체 직접 접근 금지, 어댑터(`server/adapters/`)가 변환.
- 모든 mutate 요청은 `clientId` 포함 (Realtime 에코 가드).
- 요청/응답 타입은 `src/types/api/`의 zod 스키마에서 `z.infer`로 추론 — 런타임 검증과 타입을 한 소스로.

## 6. 타입

- TypeScript strict, `any` 금지. 불가피하면 `unknown` + 좁히기.
- 도메인 타입은 `src/types/`에서 단일 정의. 중복 선언 금지.

## 7. 커밋

- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`) + 한국어 본문.

## 8. 주석

- 코드로 표현 불가능한 제약만 주석으로 남긴다 (좌표계 가정, 400ms 모바일 탭 전파 가드, 에코 가드 이유 등).
- 변경 이력성 주석(`// 2026-06-11 수정`), 자명한 주석 금지.

## 9. 테스트

- 순수 로직(utils, engine, handlers)은 단위 테스트 필수 (`tests/unit/`).
- UI 공통 컴포넌트는 렌더·상호작용 스모크 테스트 (`tests/unit/ui/`).
- E2E는 기능 명세의 AC와 1:1 매핑 (`tests/e2e/`, Phase 2 파이프라인부터).
