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
pnpm test:integration   # 핸들러 통합 테스트 (tests/integration/, 로컬 Supabase 기동 필요)
pnpm import:parcels     # public/data/parcels.json → parcels 테이블 시드 (멱등 upsert)
pnpm build         # tsc -b && vite build
```

Docker 개발: `docker compose -f docker/docker-compose.yml up` (web + api. Supabase는 호스트에서 CLI로 별도 기동, 컨테이너에서 `host.docker.internal:54321`로 접근).

## 아키텍처

- **API 계층 (v1 부채 청산의 핵심)**: 모든 API 로직은 `server/handlers/`의 **런타임 비의존 순수 함수**로만 작성한다 — req/res 객체 직접 접근 금지. 라우팅 테이블 `server/routes.ts`(`routes`+`matchRoute`+`dispatch`)가 단일 진실이며, `server/dev-server.ts`(Docker 개발, Express)와 `api/[...path].ts`(배포, Vercel 단일 catch-all 함수)가 이 테이블을 공유한다. Vercel 함수는 1개로 통합(Hobby 12개 한도 회피)이라 `vercel.json` rewrite·경로별 api 파일이 불필요하다. v1의 server.js ↔ api/ 로직 분기 재발 방지가 목적. (`server/adapters/express.ts`는 핸들러→Express 응답 변환만.)
- **API 타입**: 요청/응답은 `src/types/api/`의 zod 스키마에서 `z.infer`로 추론 — 프론트 클라이언트와 핸들러가 같은 스키마를 import한다.
- **클라이언트/서버 공유 로직**: 필지 override 정규화(`normalizeOverride` — 의미 필드 전부 null이면 행 삭제와 동형)는 `src/utils/override.ts` 단일 모듈을 스토어와 `server/handlers/tabState.ts`가 함께 import한다. 서버는 전체 행 치환이므로 클라이언트는 **부분 patch 전송 금지** — 병합된 전체 의미 필드를 보낸다.
- **features/ 수직 분할**: 도메인 로직(컴포넌트+훅+로직)은 `src/features/<domain>/` 안에서만. `src/components/ui/`는 도메인 무지 순수 UI만 (도메인 타입 import 금지, 의존 방향: features → ui).
- **시트 컨테이너**: 도메인 시트는 공통 `Sheet`로 감싼다 — 뷰포트에 따라 BottomSheet(모바일, backdrop 모달 + 400ms 닫힘 가드)/SidePanel(≥720px) 자동 선택, 시트별 수동 isWide 분기 금지. **SidePanel은 비모달** (backdrop 없음 — 시트를 연 채 지도 탭·팬/줌 가능, v1 와이드 동작 보존). 닫기는 시트 콘텐츠의 X 버튼 소관.
- **지도 렌더**: `src/features/map/engine/`은 React를 import하지 않는 순수 TS Canvas 2D 렌더 엔진 (M-2 완료 — scene·renderScene·outerEdges memo·viewport·hitTest, ESLint로 react import 금지 강제). `MapCanvas.tsx`는 캔버스/DPR/ResizeObserver 관리와 엔진 호출만 하는 얇은 React 호스트. 렌더 패스는 v1 보존 8개(1차~7차 + 1.5차 색없는그룹) + 별도 라벨 캔버스(M-4 완료 — `engine/labels.ts`·`wrapText.ts`·`clusters.ts`, 메인 캔버스 위 두 번째 캔버스에 지번·그룹명 클러스터 라벨 렌더, 포인터 입력 불간섭, wrapText 캐시·findClusters memo 내장). v1 보존 색상 상수는 `engine/colors.ts`(lint hex 예외 모듈)에 집약.
- **지도 제스처**: `src/features/map/useGestures.ts` — PointerEvent 단일화 훅 (M-3 완료, v1의 touch/mouse 이중 핸들러·고스트 마우스 가드 폐기). 순수 수식은 `gestureMath.ts`, 히트테스트는 `engine/hitTest.ts`. v1 보존 파라미터(팬 임계값 터치 12px/마우스 6px, 탭 500ms, scale 클램프 50~30000, 휠 ×1.15, 버튼 ×1.6, 줌 중심 고정)는 `docs/specs/map-gestures.md` 참조.
- **정적 지오데이터**: `public/data/parcels.json` (필지 4,409개, v1에서 복사) — **절대 수정 금지**. 구조: `{ bbox, parcels: [{ id, jibun, c: [[lng,lat],...] }] }`. `src/utils/geo.ts`의 `makeProjector(bbox)`로 0..1 정규화 평면에 투영해 사용.
- **DB**: 신규 Supabase 프로젝트 (v1과 분리). `app_state` JSON 컬럼은 존재하지 않는다 — 정규화 테이블이 유일한 진실이며, 탭(작업공간) 스키마가 기본 구조. 모든 스키마는 `supabase/migrations/`에 존재해야 한다 (`supabase db reset`만으로 환경 재현). 현재 `0001_v2_schema.sql` — 테이블 6종(tabs·parcels·parcel_settings·parcel_groups·color_labels·app_config) + Realtime publication 등록 + `color_labels` REPLICA IDENTITY FULL(DELETE 에코 가드용).
- **Realtime 동기화**: `src/lib/realtime.ts` (M-6 완료) — React 미사용 모듈. 채널 4개(parcel_settings·parcel_groups는 `tab_id` 필터 탭 스코프, tabs·color_labels는 전역), `updated_by === clientId` 에코 가드, `activeTabId` 변경 시 탭 스코프 채널 2개 재구독, 연결 상태 머신은 ui 스토어 `realtimeStatus`(disabled/connecting/subscribed/error). 명세: `docs/specs/realtime-sync.md`.
- **스타일**: Tailwind v4 + CVA. 디자인 토큰은 `src/styles/tokens.css`의 `@theme` CSS 변수만 참조 — 하드코딩 hex 금지. 팔레트 6색은 DB(color_labels) 소관이라 토큰이 아님.
- **상태**: 서버 동기화 상태는 Zustand 스토어 `src/stores/` (M-5 완료 — `workspace.ts` 탭·overrides·groups·colorLabels + 낙관적 업데이트(롤백 없음, v1 보존), `ui.ts` 선택 5종·openSheet·isInitializing(부팅/탭 전환 중 입력 차단)·areaUnit(면적 단위, localStorage 영속 전역 설정 — draft 아님), `selectors.ts` 메모이즈 파생). 시트 내부 편집은 로컬 useState draft 패턴 — **저장 버튼에서만** 스토어 커밋. ref 미러 금지 — 콜백 내 동기 접근은 `getState()`.

## 기능 개발 파이프라인 (필수)

모든 기능 개발은 `/pipeline "<기능 한 줄>"`로 7단계 파이프라인을 통과한다 (`.claude/skills/pipeline/SKILL.md`). 단계별 에이전트는 `.claude/agents/`에 정의:

| 단계            | 에이전트                     | 산출물                                             | 게이트                             |
| --------------- | ---------------------------- | -------------------------------------------------- | ---------------------------------- |
| 1 기획          | planner                      | `docs/specs/<기능>.md` (AC 포함)                   | **사용자 승인** + AC 테스트 가능성 |
| 2 디자인 ∥ 계약 | ui-designer + 오케스트레이터 | `design/bogugot.pen` 프레임 + `src/types/api/` zod | 토큰 위반 0, 신규 UI 신고          |
| 3 구현 (병렬)   | frontend-dev ∥ backend-dev   | `src/features/` + `server/handlers/` + migrations  | lint·typecheck·test 통과           |
| 4 E2E           | tester                       | `tests/e2e/<기능>.spec.ts`                         | AC 1:1 매핑 전체 green             |
| 5 검증          | verifier                     | 적대적 리뷰 보고                                   | blocking 0 (반려 루프 최대 2회)    |
| 6 배포 준비     | deployer                     | 커밋 + 마이그레이션 절차 + 릴리즈 노트             | CI green + **사용자 배포 승인**    |

게이트 원칙: 기획 승인과 배포 승인은 반드시 사용자가 한다. 커밋은 사용자 git 이름만 사용 (Claude 흔적 금지 — 확정 규칙). push는 항상 사용자가 직접 한다.

## 컨벤션 핵심

- TypeScript strict, `any` 금지. 컴포넌트 `PascalCase.tsx`, 훅 `useXxx.ts`, 유틸 `camelCase.ts`.
- 프론트에서 `fetch` 직접 호출 금지 — `src/lib/api.ts` typed client만 사용 (mutate 시 `clientId` 자동 주입).
- 모든 mutate API는 `clientId`를 포함한다 (Realtime 에코 가드).
- 한국어 단일 언어 앱. conventional commits 한국어 본문.
- 주석은 코드로 표현 불가능한 제약(좌표계, 400ms 모바일 가드 등)만.

## 현재 상태 (Phase 4 완료 — Phase 5 대기)

Phase 0(스캐폴딩·Docker·Supabase·어댑터·CI) + Phase 1(컨벤션·토큰·UI 컴포넌트 18종·Pencil 시트) + Phase 2(7단계 파이프라인 하네스 + 파일럿 런 M-17 릴리즈 노트 시트 — `src/features/release-notes/`, Playwright E2E `tests/e2e/`) + Phase 3(DB 재설계 + API 단일화 — `supabase/migrations/0001_v2_schema.sql`, `server/handlers/` 도메인 핸들러, `src/types/api/` zod 계약 7종, `src/lib/api.ts` typed client, `tests/integration/` 핸들러 통합 테스트 + CI integration 잡. 명세: `docs/specs/phase3-db-api.md`) 완료. Phase 4 로직 마이그레이션 진행 중 — M-1(지오 유틸 `src/utils/geo.ts`)·M-2(Canvas 렌더 엔진 `src/features/map/engine/`, 명세: `docs/specs/map-render-engine.md`)·M-3(팬/줌/핀치/탭 제스처 — `src/features/map/useGestures.ts`·`engine/hitTest.ts`, 명세: `docs/specs/map-gestures.md`)·M-4(라벨 렌더 — `engine/labels.ts`·`wrapText.ts`·`clusters.ts` + 별도 라벨 캔버스, 명세: `docs/specs/map-labels.md`)·M-5(상태 스토어 — `src/stores/` workspace·ui·selectors + `src/utils/override.ts` 클라이언트/서버 공유 정규화, App의 M-3 임시 비계 제거, E2E 공용 API 모킹 `tests/e2e/helpers/mockApi.ts`, 명세: `docs/specs/state-stores.md`)·M-6(Realtime 동기화 + 에코 가드 — `src/lib/realtime.ts` 채널 4개·연결 상태 머신·탭 전환 재구독, `color_labels` REPLICA IDENTITY FULL, 명세: `docs/specs/realtime-sync.md`)·M-7(필지 시트 — `src/features/parcel/` ParcelSheet·pinIcons(5범주×8 아이콘 v1 이식), ui 스토어 `tapParcel` 선택+시트 원자화·`closeSheet`·`areaUnit`, 와이드 `SidePanel` 비모달화, 명세: `docs/specs/parcel-sheet.md`)·M-8(그룹 — `src/features/group/` GroupSheet·MultiSelectOverlay·AddToGroupBanner·groupId 유틸, ui 스토어 `tapParcel` 멀티선택/추가모드/그룹 3분기 + 모드 액션, workspace 스토어 `pendingGroupCreate` 드래프트 트랜잭션 begin/commit/cancel(미리보기·원복은 서버 호출 0회), 명세: `docs/specs/group-management.md`)·M-9(필지 목록 뷰 — `src/features/list/` ParcelListView·listQuery·useParcelIndex·useParcelAreas, 신규 일괄 면적 API `GET /api/parcel-areas`(핸들러 `.range()` 페이징, DB 변경 없음), ui 스토어 `listViewOpen`·`openParcelFromList`(시트 직행 — 멀티선택·추가모드 비경유, 목록 진입 시 모드 해제), 명세: `docs/specs/parcel-list.md`)·M-10(자동 계산기 — `src/features/calculator/` calc 순수 함수·CalculatorSettingsSheet·CalculatorResultSheet·CalculatorModeBadge, ui 스토어 `calculatorActive` 모드(`tapParcel` 계산기 분기 — 그룹 소속도 개별 필지로 결과 시트 직행, 진입 시 멀티선택·추가모드 해제), workspace 스토어 `calcRecipes` 서버 단일 소스, `src/types/api/calcRecipes.ts` 계약 z.unknown() → calcRecipeSchema 구체화로 PUT 검증 실질화 — 핸들러·DB 무변경, 명세: `docs/specs/calculator.md`)·M-11(동적 색상 팔레트 — `src/features/palette/` PaletteSheet·colorRefs·paletteDefaults, 공통 UI `ColorPicker` 신규(18종→19종), workspace 스토어 `saveColors`·`deleteColorAndCleanup`(삭제 참조 정리는 서버 권위 — 클라이언트는 현재 탭 낙관적 로컬 정리 + Realtime 에코 가드), ui 스토어 `paletteOpen`, 핸들러·DB·API 계약 무변경 — Phase 3 colors API 소비, 명세: `docs/specs/color-palette.md`)·M-12(JSON 내보내기/불러오기 — `src/features/share/` ShareSheet·shareFile(version 2 파일 포맷 zod 스키마 — 클라 전용이라 features 소관, 필드 스키마는 `src/types/api/` 계약 재사용), workspace 스토어 `importFromFile`(importState 전체 교체 → colors upsert 병합 → 서버 재조회 set — 서버가 group*id를 재생성하므로 파일 키 직접 미사용), ui 스토어 `shareOpen`, v1 파일(version 1) 거부, 핸들러·DB·API 계약 무변경 — Phase 3 import API 소비, 명세: `docs/specs/share-json.md`)·M-13(V-World 토지정보 조회 — `server/handlers/vworld.ts` 공용 모듈(`fetchLadfrl` — 전역 fetch form-urlencoded POST + fast-xml-parser, 핸들러·스크립트 공용으로 v1 https.request/fetch 이중 구현 폐기), `fetchLandInfoHandler` 501 스텁→실구현(키 부재 503·필지 없음 404·pnu null/≠19자리 409·외부 실패 502·성공 200 parcelSchema), `scripts/fetch-vworld.ts` 멱등 일괄 적재(--force·200ms 간격·`runFetchVworld` export), `src/features/parcel/ParcelSheet.tsx` 토지 정보 섹션에 "토지임야 조회" 버튼/카드 분기(M-7 생략분, 로컬 상태 갱신 — parcels 마스터는 스토어 미보유), DB·API 계약 무변경, 환경변수 `V_WORLD_LADFRLLIST`·`V_WORLD_DOMAIN` 필요(미설정 시 버튼 탭 503·앱 정상), 명세: `docs/specs/vworld-land-info.md`)·M-14(지목 필터 — `src/features/map/jimok.ts`(classifyJimok 지번 끝글자 휴리스틱 — `lndcgr_code_nm` 미의존이라 V-World 시드 전에도 동작, MAIN_JIMOK 답·전·대·도·임 + 기타 6분류 고정·JIMOK_LABELS·visibleParcelIds 6전체/0빈/부분)·`JimokFilter.tsx` Chip 토글 바(전체+6칩 가로 스크롤, 신규 공통 컴포넌트 없음 — Chip 재사용), ui 스토어 `jimokFilter`·`setJimokFilter`·`toggleJimok`(변경 시 선택·시트 해제 — v1 useEffect 보존), MapCanvas `visibleParcels` 단일 배열을 렌더·hitTest·라벨 3경로 동일 적용(가려진 필지는 안 그려지고 안 탭됨), App은 `!listViewOpen`일 때 top-28 칩 바 배치(아이콘 스택 아래), 백엔드·DB·API 계약 무변경, 명세: `docs/specs/jimok-filter.md`)·M-15(초기화 — `src/features/tab/ResetSheet.tsx`(공통 Sheet+Checkbox 4종(색·이름·메모·그룹)+ConfirmInline 2단계, 로컬 draft→실행 시만 커밋, 스냅샷 UI 폐기 — 히스토리는 M-16 탭 소관), workspace 스토어 `reset(items)`(pinned 보호 낙관 정리 — `o.pinned` skip·color 비움 시 style 동반 제거·`normalizeOverride`/`isClearedOverride` 공유 함수, group 포함 시 `groups={}` 해체, 서버 `tabResetHandler`와 동형), ui 스토어 `resetSheetOpen`·`openReset`·`closeReset`, App 진입점 `RotateCcw` top-16 right-29, **백엔드·DB·API 무변경**(reset 핸들러·계약·통합테스트는 Phase 3 기구현분 승계), 명세: `docs/specs/reset.md`)·M-16(탭 작업공간 — `src/features/tab/HistorySheet.tsx`(닫힌 탭 목록 — 복원/인라인 이름변경/2단계 삭제, 공통 Sheet·ListRow·ConfirmInline·EmptyState 조립, 필지 수 카운트 비범위)·`NavDrawer.tsx`(앱 메뉴 — 히스토리 + 기존 임시 IconButton 6종 흡수, 기존 Drawer 조립), workspace 스토어 탭 CRUD 6액션(createTab·renameTab·softCloseTab(활성≥2 가드)·loadHistory·restoreHistory·renameHistory·deleteHistory — **전부 setActiveTab 단일경로 재사용**으로 C-4 isInitializing·재조회·realtime 재구독 일관), ui 스토어 navDrawerOpen·historyOpen, App은 TabBar+햄버거(Menu)를 지도 컨테이너 위 전용 flex 행으로 분리(절대 오버레이와 좌표 무관), C-1~C-4·H-1 전부 구조적 해소(C-1 boot/refetch 첫탭 폴백·C-2 마지막탭 409 이중방어·C-3 restore group_id 서버 재생성 권위·C-4 isInitializing 입력차단·H-1 tab*<ts36><rand4> ID), **백엔드·DB·API 무변경**(tabs/history 핸들러·계약·통합테스트 Phase 3 기구현 승계, AC-10~12 회귀 게이트), 명세: `docs/specs/tab-workspace.md`) 완료로 **Phase 4(M-1~M-16, M-17 Phase 2 선행, M-18 제외) 종료**. **Phase 5 진행 중** — 5-1 시드(`scripts/migrate-v1-data.ts` — `runSeed`/`V1Reader` 추상화로 실 DB 없이 fixture 테스트, 6단계: parcels enrich update(pnu+V-World만, jibun·coordinates는 parcels.json 권위라 미변경)·기본 탭·overrides(app*state 우선)·groups(빈명''→null)·color_labels(hex 보충)·calc_recipes+스냅샷→닫힌탭(group_id 재생성), `--dry-run`/`--force`/`--source`, `tests/integration/seed.test.ts` AC-1~9)·5-2 핵심 여정 E2E 6종(`tests/e2e/journeys/`, 여정① Realtime은 mockApi 하네스 한계로 단위 위임)·5-3 회귀 커버리지(`docs/specs/regression-coverage.md` — 커버24/폐기17/갭0)·5-4 검증 게이트(lint·typecheck·format·단위 410·통합 57·e2e 45·build green) 완료. **사용자 잔여**: 실 v1 운영 DB로 `pnpm seed:v1 --dry-run`→검증→적용, 모바일 실기기 스모크, git push, Vercel env(`V_WORLD*\*`)·배포. **region-entry 슬라이스**(필지 리브랜딩 + 지역 선택 진입 — frontend-only, 백엔드·DB·API·parcels.json 무변경): 보구곶 단일 마을 카피·녹색 토큰을 범용 "필지"/브랜드 블루(#2C5FD0)로 교체, region 추상화 도입 — `src/features/region/`(regionCatalog·useGpsLocate·RegionRow·RegionSelectView·RegionManageView·RegionChip), ui 스토어 region 진입 게이트(마지막 선택 region 미기록 시 지도 대신 지역 선택 화면), 데이터 적재 region 은 보구곶(인천 강화군 화도면) 1개뿐 — 나머지는 "준비 중"(비활성) 표시만. **전국 데이터 파이프라인·PRO 는 미착수**(후속 슬라이스). 명세: `docs/specs/region-entry.md`. 상세 규칙은 `docs/CONVENTIONS.md`가 이 문서보다 우선한다.
