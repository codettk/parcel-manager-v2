# 상태 스토어 (Zustand) — workspace / ui

- 상태: 완료 (5단계 검증 통과 — 반려 1회 후 재검증, 2026-06-11)
- 매핑: M-5
- 판정: 재설계 (v1 `app.jsx`의 분산 useState 17개 + ref 미러 5개 구조는 **폐기**하고 Zustand 2-스토어로 재설계. 단 v1에서 검증된 의미론 3건은 **동작 보존** — ① 낙관적 즉시 반영(로컬 setState 먼저, 서버 전송은 비동기·롤백 없음), ② `parcelToGroup` 역산 파생(셀렉터로 이동), ③ 부팅 중 입력 불가(v1 `supabaseReady` → v2 `isInitializing` 반전 재설계, 작업명세서 §6.3 C-4). ref 미러 5개(overridesRef·groupsRef·multiSelectedRef·pendingGroupCreateRef·viewRef)는 콜백 내 동기 접근용 우회 패치였으므로 폐기 — Zustand `getState()`가 대체한다. CONVENTIONS "ref 미러 금지" 확정 규칙)

## v1 상태 전수 분류 (app.jsx:18-75 실코드 기준)

| #   | v1 상태              | 판정 → v2 목적지                                                                                        |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | `data`               | 폐기 — parcels.json 로드·투영은 M-2에서 `MapCanvas` 내부로 이전 완료. 스토어 비대상                     |
| 2   | `overrides`          | **workspace** (탭 스코프, `Record<string, ParcelOverride>`)                                             |
| 3   | `colors`             | **workspace** `colorLabels: ColorLabel[]` (api.colors 계약 타입). v1 derived `colorById`는 셀렉터로     |
| 4   | `lastSyncedAt`       | 폐기 — v1 JSON 공유 시대 흔적. v2 동기화 상태는 M-6 연결 상태 머신 소관                                 |
| 5   | `groups`             | **workspace** (탭 스코프, `Record<string, Group>`)                                                      |
| 6   | `supabaseReady`      | 재설계 → **ui** `isInitializing` (의미 반전 + C-4 입력 차단 + M-16 탭 전환 시 재사용)                   |
| 7   | `selected`           | **ui** `selectedParcelId` (M-3 App 비계 useState를 흡수)                                                |
| 8   | `view`               | 재설계 → **ui** `openSheet` (시트 식별자 유니온 \| null — 구체 값은 M-7+에서 추가, 본 건은 null 자리만) |
| 9   | `selectedGroupId`    | **ui** (자리만 — 조작 UI는 M-8)                                                                         |
| 10  | `multiSelectMode`    | **ui** (자리만 — M-8)                                                                                   |
| 11  | `multiSelected`      | **ui** `multiSelectedIds` (자리만 — M-8)                                                                |
| 12  | `addToGroupMode`     | **ui** `addToGroupModeGroupId` (자리만 — M-8)                                                           |
| 13  | `pendingGroupCreate` | 이연 — M-8 드래프트 트랜잭션 소관. 본 건에서 정의하지 않음                                              |
| 14  | `jimokFilter`        | 이연 — M-14 소관                                                                                        |
| 15  | `areas`              | 이연 — 500개 청크 면적 조회는 M-9 소관                                                                  |
| 16  | `areaUnit`           | 이연 — M-9/M-10 소관 (localStorage 개인 설정)                                                           |
| 17  | `calcRecipes`        | 폐기 — v1 localStorage 저장은 v2에서 서버 API(`api.calcRecipes`)로 대체됨. 스토어 편입은 M-10           |

선택 상태 5종(#7~#12)은 M-2 엔진 `SelectionState`(scene.ts)와 1:1 — ui 스토어가 이 형태의 원천이 된다.

## 사용자 스토리

1. 공동체 사용자는 앱을 열면 서버에 저장된 색칠·그룹 상태가 지도에 그대로 표시된 것을 본다 (이번 단계의 사용자 가시 변화 — 시트가 없으므로 조작은 불가, 표시만).
2. 공동체 사용자는 초기 로드가 끝나기 전에는 지도를 탭해도 아무 일도 일어나지 않아, 로드 중 상태와 어긋난 입력이 발생하지 않는다 (C-4).
3. 개발자(M-6 Realtime, M-7+ 시트, M-16 탭 담당)는 스토어 액션·셀렉터만 호출하면 되고, ref 미러나 prop drilling 없이 상태에 접근한다.

## 동작 명세

### stores/workspace.ts — 서버 동기화 상태

상태: `tabs: Tab[]`, `activeTabId: string | null`, `overrides: Record<string, ParcelOverride>`, `groups: Record<string, Group>`, `colorLabels: ColorLabel[]`, `bootError: string | null`.

액션 (모두 `src/lib/api.ts` 경유 — fetch 직접 호출 금지):

- `boot()` — 아래 부팅 시퀀스 수행.
- `setActiveTab(tabId)` — activeTabId 변경 + localStorage 기록 + 해당 탭 tabState 재로드 (재로드 동안 `isInitializing` true — C-4. 탭 UI는 M-16이지만 전환 의미론은 스토어가 소유).
- `upsertParcel(parcelId, patch)` — **낙관적**: overrides를 동기 갱신 후 `api.tabState.upsertParcel` 1회 호출. 모든 의미 필드(color·style·name·memo·icon)가 null이고 pinned=false면 키 삭제(서버 clear 계약과 동형). 실패 시 롤백 없음(v1 보존) — 단 v1의 무음 삼킴(`.catch(() => {})`)은 재설계: `console.error` 보고 (에러 UX는 비범위).
- `upsertGroup(groupId, group | null)` — 낙관적 동일. null이면 키 삭제 + `api.tabState.upsertGroup` 호출.
- Realtime 반영 액션 — **시그니처와 상태 전이만 본 건 구현, 구독 연결은 M-6**: `applyRemoteParcel(parcelId, override | null)`, `applyRemoteGroup(groupId, group | null)`, `applyRemoteTabs(tabs)`, `applyRemoteColors(colorLabels)`. null = 키 삭제. 서버 호출 없음(에코가 아니라 수신 반영이므로).

colorLabels의 mutate 액션(라벨 편집·삭제)은 M-11 소관 — 본 건은 로드와 applyRemoteColors까지.

### stores/ui.ts — 클라이언트 전용 상태

상태: `isInitializing: boolean`(초기값 true), `openSheet: null`(유니온은 M-7+에서 확장), 선택 상태 5종(`selectedParcelId`, `selectedGroupId`, `multiSelectMode`, `multiSelectedIds`, `addToGroupModeGroupId` — 초기값은 엔진 `EMPTY_SELECTION`과 동일).

액션:

- `tapParcel(parcelId | null)` — 단일 선택 설정 / null이면 해제 (M-3 비계 의미론 흡수). **`isInitializing === true`면 무시** (C-4 입력 차단 — 멀티선택·추가모드 분기는 M-8에서 이 액션을 확장).
- `setInitializing(flag)` — boot/탭 전환이 호출.

### 셀렉터 (스토어 파일 또는 `stores/selectors.ts`)

- `selectParcelToGroup` — groups에서 `parcelId → groupId` 역산 (v1 app.jsx:55 useMemo의 이전). groups 참조가 같으면 동일 결과 참조 반환(메모이즈) — 렌더 패스 입력 안정성.
- `selectColorById` — `colorLabels` → `Record<colorId, hex>` (MapCanvas `colorById` prop 형태, 메모이즈).
- `selectSelection` — ui 선택 상태 5종 → 엔진 `SelectionState` 형태 (메모이즈).

### 부팅 시퀀스 (`boot()`)

1. `api.tabs.list()`와 `api.colors.list()` 병렬 호출 (빈 DB 부트스트랩은 서버 책임 — tabs 0개면 서버가 기본 탭 자동 생성, Phase 3 계약).
2. activeTabId 결정 (**C-1**): localStorage `bogugot_v2_active_tab` 값이 응답 탭 목록에 존재하면 사용, 없거나 미존재면 **목록 첫 탭**으로 폴백하고 localStorage를 갱신.
3. `api.tabState.get(activeTabId)` → overrides/groups 반영.
4. `ui.isInitializing = false`.
5. 실패 시(어느 단계든 reject): `bootError`에 메시지 설정, `isInitializing`은 true 유지(입력 차단 지속). 재시도 UI는 비범위 — DEV 콘솔 보고만.

supabase 클라이언트 생성(`api.config.get()` 기반)은 M-6 소관 — 본 건 부팅에 포함하지 않는다.

### App / MapCanvas 연결

- `App.tsx`: M-3 임시 비계(`selectedParcelId` useState + `useMemo` selection)를 제거하고 ui/workspace 스토어 구독으로 치환. 마운트 시 `boot()` 1회 호출. `onParcelTap` → `ui.tapParcel`.
- `MapCanvas.tsx`: **변경 없음** — props 계약 유지. App이 `overrides`·`groups`·`colorById`(셀렉터)·`selection`(셀렉터)을 주입한다. (MapCanvas 내부 parcelToGroup useMemo는 렌더 입력 결합용으로 존치 — 스토어 셀렉터는 비-캔버스 소비처(M-8/M-9)용.)
- zustand 의존성 신규 설치 (^5).

## 수용 기준 (AC)

AC-1. Given `api`를 모킹한 스토어(tabs.list → 활성 탭 2개, colors.list → 팔레트, tabState.get → overrides/groups 픽스처)와 localStorage에 두 번째 탭 id가 저장된 상태, When `boot()`를 실행하면, Then `tabs`·`colorLabels`가 응답과 일치하고 `activeTabId`가 localStorage의 탭 id이며 `tabState.get`이 그 id로 1회 호출되고 `overrides`/`groups`가 응답과 일치하며 `ui.isInitializing`이 false가 된다 (Vitest, `tests/unit/stores/`).

AC-2. Given localStorage `bogugot_v2_active_tab`이 없거나 응답 탭 목록에 존재하지 않는 id일 때, When `boot()`를 실행하면, Then `activeTabId`가 목록 첫 탭 id로 폴백되고 localStorage가 그 값으로 갱신된다 (Vitest — C-1).

AC-3. Given `api.tabs.list`가 reject되는 모킹, When `boot()`를 실행하면, Then `bootError`가 설정되고 `isInitializing`이 true로 유지되며, 이때 `ui.tapParcel('p1')`을 호출해도 `selectedParcelId`는 null로 불변이다; `isInitializing`이 false면 동일 호출로 `'p1'`이 설정되고 `tapParcel(null)`로 해제된다 (Vitest — C-4 + 선택 전이).

AC-4. Given 그룹 2개(각각 parcelIds 보유)인 groups, When `selectParcelToGroup`을 평가하면, Then 모든 소속 필지가 자기 groupId로 역산되고 비소속 필지는 키가 없으며, 같은 groups 참조로 재호출하면 동일 객체 참조를 반환한다 (Vitest — 메모이즈 포함).

AC-5. Given 부팅 완료된 스토어(기존 override에 다른 필드 보유 가능), When `upsertParcel('p1', { color: 'red', style: 'fill' })`을 호출하면, Then `overrides['p1']`이 호출 직후(서버 응답 전) 동기 갱신되고 `api.tabState.upsertParcel`이 (activeTabId, 'p1', **병합된 전체 의미 필드**)로 1회 호출되어 기존 name/memo 등이 보존된다 (서버 핸들러는 전체 행 치환이므로 부분 patch 전송 금지 — v1 app.jsx:269-281 전체 필드 전송 보존, 5단계 검증 반려 B-1); When 모든 의미 필드 null + pinned false로 호출하면 `overrides`에서 키가 삭제된다; When api가 reject돼도 상태는 롤백되지 않는다 (Vitest — 낙관적 업데이트 보존).

AC-6. Given 부팅 완료된 스토어, When `applyRemoteParcel`/`applyRemoteGroup`을 값으로 호출하면 해당 키가 갱신되고 null로 호출하면 삭제되며, `applyRemoteTabs`/`applyRemoteColors`는 목록을 교체한다 — 네 액션 모두 api 모듈을 호출하지 않는다 (Vitest — M-6 수신 계약).

AC-7. Given `page.route`로 `/api/tabs`(탭 1개)·`/api/colors`(hex 포함 팔레트)·`/api/tabs/*/state`(특정 필지 color=fill 1건 + 다른 색 그룹 1건의 overrides/groups)를 모킹한 앱, When 부팅이 완료되면, Then 메인 캔버스 백버퍼에 두 hex 색상의 픽셀이 각각 1개 이상 출현한다 (Playwright `tests/e2e/state-stores.spec.ts` — 서버 상태가 지도에 표시되는 사용자 가시 변화).

AC-8. Given AC-7과 동일한 앱, When 필지 내부 좌표를 탭하면, Then 선택 강조색(`#1F5A38`) 픽셀이 출현하고 빈 영역 탭으로 사라진다 (Playwright — M-3 비계 → 스토어 치환 회귀 검증).

### E2E 데이터 경로 판정

실DB(로컬 Supabase + dev:api) 경로는 **이번 단계에서 채택하지 않는다.** 근거: 현 `playwright.config.ts`의 webServer는 `pnpm dev`(vite 5173) 단독이고 `/api` 프록시 대상인 dev:api(3000)와 Supabase 스택은 구성 밖이며, CI에도 e2e job이 없다. webServer 배열로 dev:api를 추가할 수는 있으나 Supabase 기동·시드·정리까지 요구되어 M-5 범위를 넘는다. 따라서 AC-7/AC-8은 **Playwright `page.route` 네트워크 모킹**(결정적 픽스처)으로 검증하고, 실DB E2E는 Phase 5 핵심 여정(작업명세서 §8.2, Docker 스택)에서 수행한다.

## 비범위

- **Realtime 구독(M-6)**: 채널 생성·구독·에코 가드·연결 상태 머신 — 본 건은 `applyRemote*` 수신 액션 시그니처까지.
- **시트 UI(M-7+)**: `openSheet` 유니온 확장·시트 컴포넌트·400ms 닫힘 가드. mutate 액션(upsertParcel/upsertGroup)의 실제 호출처도 시트부터.
- **탭 UI(M-16)**: TabBar·히스토리. 스토어는 다탭 상태를 담지만 UI는 단일 탭 표시.
- **멀티선택·그룹 조작 로직(M-8)**: 상태 필드 자리만 — `tapParcel`의 멀티/추가모드 분기, `pendingGroupCreate` 트랜잭션 없음.
- jimokFilter(M-14), areas·areaUnit(M-9/M-10), calcRecipes(M-10), 팔레트 편집(M-11).
- 부팅 실패 재시도 UI·로딩 인디케이터 (M-16 탭 전환 UX와 함께).

## 영향 범위

- 프론트: `src/stores/workspace.ts`·`src/stores/ui.ts`(·셀렉터, 신규), `src/App.tsx`(비계 useState 제거 + 스토어 연결 + boot 호출). `src/features/map/MapCanvas.tsx` 변경 없음(props 주입 유지). 테스트: `tests/unit/stores/` + `tests/e2e/state-stores.spec.ts`
- 의존성: `zustand@^5` 신규 설치
- 백엔드: 없음
- DB: 마이그레이션 불필요
- API 계약: 없음 (Phase 3 기존 계약 소비만 — `src/types/api/` 변경 없음)
- **ui-designer: 불요 판정** — 신규 시각 요소 0건 (상태 배선 전용. 지도 표시 변화는 M-2 렌더 엔진의 기존 출력)
