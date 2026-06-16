# 탭 작업공간 (TabBar + HistorySheet + NavDrawer)

- 상태: 검토 대기
- 매핑: M-16 (신규 — v1 계획서만 존재. v1 스냅샷(FIFO 10개) → v2 탭(active) + 닫힌 탭(history) 이관 설계)
- 판정: 신규 (v1에 미구현. 단, Phase 3에서 백엔드·계약·클라이언트가 선구현됨 → 이 기능은 **거의 전부 프론트 조립**이다. 기준 문서 §6.3 C-1~C-4·H-1 리스크 체크리스트를 AC로 검증)

## 선구현 현황 (착수 전 사실 확인)

> M-16은 "신규"이나 **백엔드 전체가 Phase 3에서 이미 구현·테스트 완료**다. 이 절은 backend-dev의 작업 범위를 0에 가깝게 좁히고, frontend-dev가 무엇을 새로 만들지 명확히 한다.

| 계층 | 항목 | 상태 |
| --- | --- | --- |
| DB | `tabs` 테이블 (tab_id·name·sort_order·closed_at·history_deleted_at·created_at·updated_by·updated_at) + FK CASCADE + Realtime publication | **완료** (`supabase/migrations/0001_v2_schema.sql`) |
| 핸들러 | `tabsCollectionHandler`(GET 목록·자동 기본탭 생성·POST 생성), `tabItemHandler`(PATCH 이름/순서·DELETE 소프트클로즈+마지막탭 409) | **완료** (`server/handlers/tabs.ts`) |
| 핸들러 | `historyCollectionHandler`(GET), `historyItemHandler`(PATCH 이름·DELETE 소프트딜리트), `historyRestoreHandler`(POST restore — settings/groups 복사 + group_id 전부 재생성) | **완료** (`server/handlers/history.ts`) |
| ID 생성 | `genTabId`(tab_<ts36><rand4>, H-1), `genGroupIds`(복원용 충돌없는 grp_ 배치, C-3) | **완료** (`server/handlers/ids.ts`) |
| 계약(zod) | `tabSchema`·`createTabRequestSchema`·`updateTabRequestSchema`·`deleteTabRequestSchema` / `historyItemSchema`·`renameHistoryRequestSchema`·`restoreHistoryRequestSchema`·`deleteHistoryRequestSchema` | **완료** (`src/types/api/tabs.ts`·`history.ts`) |
| 클라이언트 | `api.tabs.{list,create,update,close}` · `api.history.{list,rename,restore,remove}` | **완료** (`src/lib/api.ts`) |
| 통합 테스트 | AC-3(생성/목록/이름변경)·AC-4(마지막탭 409+소프트클로즈)·AC-5(활성탭 0개 자동생성)·AC-6(복원 group_id 재생성)·AC-7(히스토리 이름변경+소프트딜리트) | **완료**·green (`tests/integration/tabs.test.ts`·`history.test.ts`) |
| 스토어 | `workspace.boot()`(C-1 폴백 포함)·`setActiveTab()`(C-4 isInitializing)·`applyRemoteTabs()` | **완료** (`src/stores/workspace.ts`) |
| Realtime | `tabs` 전역 채널(refetch + 활성탭 소실 시 첫탭 폴백) + 탭 전환 시 탭스코프 2채널 재구독 | **완료** (`src/lib/realtime.ts`) |
| UI 컴포넌트 | `TabBar`(가로스크롤·인라인편집·소프트클로즈·추가, 도메인무지)·`Drawer`/`DrawerSection`/`DrawerItem` | **완료** (`src/components/ui/`, Phase 1) |
| UI 스토어 | `isInitializing`(입력차단 C-4) | **완료** (`src/stores/ui.ts`) |

**남은 작업(이 기능의 실질 범위)**: ① 워크스페이스 탭 CRUD 스토어 액션(create·rename·softClose·history list/restore/rename/delete) ② `HistorySheet`(닫힌 탭 목록 + 복원/이름변경/삭제) ③ `NavDrawer`(앱 메뉴 — 히스토리 진입점 + 기존 임시 IconButton 진입점 정리) ④ App에 `TabBar` 마운트 + 지도 상단 레이아웃 ⑤ TabBar 액션 ↔ 스토어 결선 ⑥ 히스토리 항목의 필지 수 표시를 위한 카운트 제공.

## 판정 상세 (선별적 포팅)

| 구분 | 항목 | 근거 |
| --- | --- | --- |
| 신규(v1 계획서 이관) | 탭 = 독립 작업공간(필지 설정·그룹 분리), 탭 = 히스토리 항목, 닫기 = 소프트 클로즈, 복원 = 새 탭 복사 | v1 탭 계획서(2026-06-01) 확정 방향. v1 스냅샷(`app_config.reset_snapshots` FIFO 10개)을 대체 |
| 폐기 | v1 스냅샷 UI·`api/snapshots`·`api/reset` | 마이그레이션 명세서 §7.3-1. 히스토리는 닫힌 탭으로 대체(M-15 ResetSheet에서 스냅샷 UI 제거 완료) |
| 폐기 | v1 `activeTabIdRef` useRef 미러링 | CONVENTIONS "ref 미러 금지" — 콜백 동기 접근은 `getState()`. realtime은 `workspace.subscribe`로 activeTabId 변화 감지(기구현) |
| 재설계 | 탭 전환 안전 처리(v1 `isSwitching`) → v2 `isInitializing` 단일 플래그 재사용(부팅·전환 공용) | C-4. `setActiveTab`이 이미 토글 |
| 재설계 | v1 인라인 편집 진입 = "활성 탭 단탭" → v2 **더블클릭/롱프레스** | 단탭은 모바일에서 전환과 충돌·오작동 위험. 기존 `TabBar`가 `onDoubleClick`(활성탭) 채택 — 이 명세는 그것을 확정 |

## 사용자 스토리

1. 사용자는 브라우저 탭처럼 작업공간을 여러 개 만들어, 각 탭에서 서로 다른 필지 색칠·그룹 구성을 독립적으로 유지하고 싶다.
2. 사용자는 더 이상 안 쓰는 작업공간을 탭 바에서 닫아 정리하되, 나중에 다시 꺼낼 수 있도록 데이터는 보존하고 싶다(소프트 클로즈).
3. 사용자는 메뉴(히스토리)에서 닫힌 작업공간 목록을 보고, 원하는 것을 새 탭으로 복원하거나 이름을 바꾸거나 영구히 목록에서 지우고 싶다.

## 핵심 설계

### 데이터 모델 (확정 — 변경 없음)

- `tabs.closed_at IS NULL` = 활성 탭(탭 바에 표시). `closed_at` 값 있음 = 히스토리.
- `tabs.history_deleted_at IS NOT NULL` = 히스토리 목록에서도 제거(데이터는 보존, 소프트 딜리트).
- `parcel_settings`·`parcel_groups`는 `tab_id` 복합/FK로 탭 스코프. `color_labels`·`calc_recipes`는 전 탭 공유(탭별 분리 없음).
- 활성 탭 수 ≥ 1 불변식: 마지막 활성 탭은 닫을 수 없고(409), 전부 닫히면 `GET /api/tabs`가 기본 탭 자동 생성.

### TabBar (UI 컴포넌트는 기존 — App에 마운트 + 결선)

- 지도 영역 **상단**에 가로 배치(가로 스크롤). 탭이 넘치면 좌우 스크롤. 탭 바 가로 스크롤 터치는 지도 팬으로 전파 차단(`stopPropagation` — 기존 컴포넌트 내장, v1 계획서 M-5).
- **비활성 탭 단탭 = 전환**. **활성 탭 더블클릭 = 인라인 이름 편집 진입**(input autoFocus, Enter 확정 / Escape 취소 / blur 확정). 빈 이름은 무시(원래 이름 유지).
- **`+` 버튼 = 새 탭 생성**(이름 기본값 `새 작업공간`, 빈 상태). 생성 직후 해당 탭으로 전환.
- **각 탭의 `×` = 소프트 클로즈**. 활성 탭이 2개 이상일 때만 동작. 활성 탭이 1개면 클라이언트는 `×`를 막되(409 사전 회피), 서버도 독립적으로 409 방어(C-2).
- active 탭은 시각 강조(기존 CVA `active` variant).

### NavDrawer (신규 조립 — 기존 Drawer 컴포넌트 사용)

- 좌측 슬라이드 메뉴. App의 임시 IconButton 진입점들(릴리즈 노트·목록·계산기·초기화·팔레트·공유)을 메뉴 항목으로 흡수하고, **"히스토리" 항목**을 추가한다.
- 햄버거 IconButton으로 연다. 항목 탭 시 해당 시트/뷰를 열고 드로어를 닫는다.
- 이 명세의 필수 항목은 **히스토리**다. 나머지 진입점 이관은 동반 정리(기존 동작 동일, 위치만 드로어로 이동)이며 AC로 히스토리만 강제한다.

### HistorySheet (신규 — 공통 `Sheet` 컨테이너)

- 닫힌 탭 목록 = `GET /api/history`(closed_at 有, history_deleted_at 無, 닫힌 시각 내림차순).
- 각 행 표시: 탭 이름, 닫은 시각, **필지 수**(설정된 필지 + 그룹 수 기준 — 카운트 출처는 아래 "히스토리 카운트" 절).
- 행 액션 3종: **복원**(`POST /api/history/:id/restore` → 새 탭으로 전환), **이름 변경**(`PATCH /api/history/:id` 인라인 편집), **삭제**(`DELETE /api/history/:id` 소프트 딜리트 — `ConfirmInline` 2단계 확인, 파괴적 작업이므로).
- 목록이 비면 `EmptyState`.

### 탭 전환 시퀀스 (C-4 — 기구현 `setActiveTab` 정합)

```
탭 클릭 → setActiveTab(tabId)
  ① isInitializing = true (입력 차단)
  ② localStorage[activeTabId] = tabId, activeTabId = tabId (동기)
  ③ activeTabId 변화 → realtime이 parcel_settings·parcel_groups 채널을 tab_id=eq.<new> 로 재구독
  ④ api.tabState.get(tabId) → overrides·groups 교체
  ⑤ isInitializing = false (입력 해제)
```

### group_id 재생성 (C-3 — 기구현, 무변경)

- 복원은 서버 `historyRestoreHandler`가 원본 탭의 groups를 읽어 `genGroupIds`로 **group_id를 전부 새로 부여**해 새 탭에 insert. 클라이언트는 복원 응답의 새 `tabId`로 `setActiveTab`만 하고, 그 안에서 `api.tabState.get`이 서버 권위(재생성된 group_id)를 그대로 받는다. 파일/원본 키를 클라가 직접 쓰지 않는다(M-12 `importFromFile` 선례).

### 히스토리 카운트 (필지 수 표시 — 작은 결정 필요)

- v1 HistorySheet은 행에 "필지 수"를 표시한다. 현 `GET /api/history` 응답(`historyItemSchema`)에는 카운트가 없다.
- **결정**: 백엔드를 변경하지 않는다. 카운트는 **선택적 표시**로 한다 — `historyItemSchema`에 카운트 필드가 없으므로, 행에는 이름·닫은 시각만 필수 표시하고 필지 수는 표시하지 않는다(비범위로 명시). 카운트 표시가 필요하면 후속(별도 명세)에서 `GET /api/history`에 집계 컬럼을 추가한다. → AC는 이름·닫은 시각만 검증.

## 수용 기준 (AC)

> 백엔드 AC(C-2·C-3·H-1·자동생성)는 Phase 3 통합 테스트(AC-3~AC-7)로 이미 green이며 회귀 게이트로 **재실행 확인**한다. 아래는 M-16 신규 검증분이다.

### 탭 스코프 격리 (필수)

- **AC-1 (탭 격리 — E2E)**: Given 활성 탭 A·B가 있고 A가 활성일 때, When 사용자가 필지 P를 색 `eco`로 색칠한 뒤 탭 B로 전환하면, Then 탭 B에서 필지 P는 색이 없고(override 없음), 다시 탭 A로 전환하면 P는 `eco`로 표시된다.

### TabBar (프론트 RTL/E2E)

- **AC-2 (탭 생성·전환)**: Given 탭 1개로 부팅된 상태에서, When `+` 버튼을 누르면, Then 활성 탭이 2개가 되고 새 탭이 활성(강조)이며 지도 overrides가 빈 상태가 된다.
- **AC-3 (인라인 이름 편집)**: Given 활성 탭이 표시된 상태에서, When 활성 탭을 더블클릭해 input에 "내 작업"을 입력하고 Enter를 누르면, Then 해당 탭 라벨이 "내 작업"으로 바뀌고 `api.tabs.update`가 `{ name: "내 작업" }`로 1회 호출된다. (Escape를 누르면 이름이 바뀌지 않고 `update` 미호출)
- **AC-4 (소프트 클로즈 — 마지막 탭 보호 클라 가드)**: Given 활성 탭이 1개뿐일 때, When 그 탭의 `×`를 누르면, Then 탭이 닫히지 않고 `api.tabs.remove`가 호출되지 않는다. Given 활성 탭이 2개일 때 비활성 탭의 `×`를 누르면, Then 그 탭이 탭 바에서 사라지고 `api.tabs.remove`가 해당 tabId로 1회 호출된다.

### 탭 전환 안전 (C-4 — 프론트)

- **AC-5 (C-4: 전환 중 입력 차단)**: Given 탭 B로 전환을 시작해 `api.tabState.get`이 아직 resolve되지 않은 동안(`isInitializing === true`), When 사용자가 지도에서 필지를 탭하면, Then `tapParcel`이 무시되어 어떤 시트도 열리지 않고 `api.tabState.upsertParcel`이 호출되지 않는다.

### HistorySheet (프론트 RTL/E2E)

- **AC-6 (히스토리 목록 표시)**: Given 닫힌 탭 2개가 있는 상태에서 NavDrawer "히스토리"를 열면, Then HistorySheet에 두 항목이 닫은 시각 내림차순으로 각각 이름과 함께 표시된다.
- **AC-7 (히스토리 복원 → 새 탭 전환)**: Given HistorySheet에 닫힌 탭 H가 보일 때, When H의 "복원"을 누르면, Then `api.history.restore(H)`가 호출되고 응답의 새 tabId가 활성 탭이 되며(탭 바에 추가·강조), 복원된 탭의 overrides가 H의 데이터와 일치한다.
- **AC-8 (히스토리 소프트 딜리트 — 확인 후)**: Given HistorySheet의 항목 H에서 "삭제"를 누르면 `ConfirmInline` 확인이 뜨고, When 확인을 누르면, Then `api.history.remove(H)`가 호출되고 그 항목이 목록에서 사라진다. (확인 전에는 `remove` 미호출)

### Realtime 정합 (C-1 런타임 확장)

- **AC-9 (C-1: 활성 탭이 원격에서 닫히면 첫 탭 폴백)**: Given 활성 탭이 T이고 다른 클라이언트가 T를 소프트 클로즈하는 `tabs` Realtime 이벤트가 도착하면, When refetch 결과에 T가 없으면, Then 클라이언트는 목록 첫 탭으로 `setActiveTab` 하여 activeTabId가 유효 활성 탭으로 복구된다(activeTabId가 닫힌 탭에 머무르지 않는다).

### 백엔드 회귀 게이트 (Phase 3 기구현 재확인)

- **AC-10 (C-2 회귀)**: `tests/integration/tabs.test.ts` AC-4 — 마지막 활성 탭 DELETE가 409를 반환하고 탭이 활성으로 남는다 (재실행 green).
- **AC-11 (C-3 회귀)**: `tests/integration/history.test.ts` AC-6 — restore가 settings·groups를 복사하고 group_id가 원본과 비교차한다 (재실행 green).
- **AC-12 (H-1 회귀)**: 생성·복원 탭 ID가 `^tab_[0-9a-z]+$` 형식이다 (`genTabId`, AC-3/AC-5 통합 테스트에 포함, 재실행 green).

## C-1~C-4·H-1 해소 매핑 (검증 추적표)

| 리스크 | 정의(v1 계획서) | v2 해소 | 검증 AC |
| --- | --- | --- | --- |
| C-1 | localStorage `activeTabId` 스테일 참조 | `boot()`가 GET /api/tabs 결과에 없으면 첫 탭 폴백(기구현) + realtime refetch가 활성탭 소실 시 첫탭 폴백 | AC-9 (+ `boot` 단위 동작은 state-stores 명세 소관) |
| C-2 | 마지막 탭 클로즈 API 무방비 | `tabItemHandler`가 활성 탭 수 ≤1이면 409(기구현·테스트됨), 클라도 `×` 가드 | AC-4, AC-10 |
| C-3 | 복원 시 group_id 충돌 | `historyRestoreHandler`가 `genGroupIds`로 전부 재생성(기구현·테스트됨) | AC-7, AC-11 |
| C-4 | 초기 로드·전환 중 입력 누락 | `isInitializing` 단일 플래그가 `tapParcel`·mutate 차단(기구현, 재사용) | AC-5 |
| H-1 | 초기 탭 동시 생성 레이스 | `tab_<ts36><rand4>` ID + GET의 자동생성 `ON CONFLICT` 의미론 | AC-12 |

## 비범위

- 히스토리 항목의 **필지 수 카운트 표시** — 현 `GET /api/history` 응답에 집계가 없어 백엔드 변경이 필요하므로 이번에 하지 않는다(위 "히스토리 카운트" 결정). 이름·닫은 시각만 표시.
- 탭 **순서 변경(드래그 재정렬)** — `PATCH sortOrder` 계약은 있으나 드래그 UX는 v2.1.
- 히스토리 목록 **페이지네이션**(v1 L-3) — 현 범위 제외.
- v1 스냅샷 데이터의 탭 이관(마이그레이션 스크립트) — Phase 5 §8.1 소관.
- `app_state` 제거·Realtime publication 등록 — Phase 3에서 이미 완료.

## 영향 범위

- 프론트:
  - `src/features/tab/HistorySheet.tsx` (신규) — 닫힌 탭 목록 + 복원/이름변경/삭제. 공통 `Sheet`·`ListRow`·`ConfirmInline`·`EmptyState` 재사용.
  - `src/features/tab/NavDrawer.tsx` (신규) — 앱 메뉴 드로어. 기존 `Drawer`/`DrawerSection`/`DrawerItem` 조립. 임시 IconButton 진입점 이관.
  - `src/stores/workspace.ts` (수정) — 탭 CRUD 액션 추가: `createTab()`(생성 후 setActiveTab), `renameTab(id,name)`(낙관적 + PATCH), `softCloseTab(id)`(활성≥2 가드 + DELETE + 닫은 탭이 활성이면 첫 탭 전환), `loadHistory()`/`restoreHistory(id)`(restore 후 setActiveTab)/`renameHistory(id,name)`/`deleteHistory(id)`. 모두 기존 `api.tabs`·`api.history` 클라이언트 사용. `applyRemoteTabs` 정합 유지.
  - `src/stores/ui.ts` (수정) — `historyOpen`·`navDrawerOpen` 열림 상태(팔레트/공유 선례 — 열림만 전역, 시트 로컬 draft 분리).
  - `src/App.tsx` (수정) — `TabBar`를 지도 상단에 마운트 + 액션 결선, NavDrawer/HistorySheet 마운트, 임시 IconButton 진입점을 NavDrawer로 이관, 햄버거 버튼 추가.
  - `src/components/ui/TabBar.tsx`·`Drawer.tsx`·`DrawerItem.tsx` — **무변경**(기존 컴포넌트 그대로 사용). 단 TabBar의 "마지막 탭 보호" 비활성 표현이 필요하면 prop 추가 가능(설계 시 판단).
- 백엔드: **없음**(handlers·ids 전부 Phase 3 기구현·테스트됨). 회귀 게이트로 기존 통합 테스트 재실행만.
- DB: **마이그레이션 불필요**. (선택 최적화: 히스토리 조회용 `tabs(closed_at, history_deleted_at)` 부분 인덱스는 데이터량 적어 불필요 — 비범위.)
- API 계약: **신규/변경 없음**. `src/types/api/tabs.ts`·`history.ts`의 기존 스키마를 프론트가 소비할 뿐.

## ui-designer 필요 여부

- **필요(부분)**. `TabBar`·`Drawer`·`DrawerItem`·`Sheet`·`ListRow`·`ConfirmInline`·`EmptyState`는 Phase 1에서 디자인·구현 완료되어 **신규 원자 컴포넌트는 없다**. 다만 다음 두 가지는 **레이아웃/배치 결정**이 필요해 ui-designer 프레임 제안을 권장한다:
  1. **지도 상단 TabBar 배치 프레임** — TabBar가 지도 위 어느 높이에, 기존 상단 IconButton 행(top-3/top-16)·지목 필터(top-28)·모드 배지와 z·y 충돌 없이 어떻게 놓이는지. 모바일 375px에서 탭 가로 스크롤 + 지도 영역 잠식 정도.
  2. **NavDrawer 메뉴 구성 프레임** — 흩어진 임시 IconButton 진입점(릴리즈 노트·목록·계산기·초기화·팔레트·공유 + 히스토리)을 섹션으로 묶는 정보 구조. 햄버거 버튼 위치.
  - **HistorySheet 내부**는 기존 시트 패턴(`Sheet` + `ListRow` + `ConfirmInline`) 재조립이라 신규 디자인 토큰/원자 불요 — 프레임 없이 진행 가능.
