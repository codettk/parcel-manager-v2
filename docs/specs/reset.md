# 초기화 (탭 내 선택 초기화) — M-15

- 상태: 검토 대기
- 매핑: M-15
- 판정: 재설계 (백엔드는 Phase 3에서 구현 완료, 프론트 시트만 신규 — v1 ResetSheet 361줄을 스냅샷 UI 폐기로 축소)

## 보존 / 재설계 / 폐기 판정표

| 항목                                    | v1 동작                                                      | v2 판정          | 근거                                                                |
| --------------------------------------- | ------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------- |
| 초기화 항목 선택 (색·이름·메모·그룹)    | 체크박스 4종, 기본 선택 `['color','group']`                  | **보존**         | v1 ResetSheet.jsx:3,43-48                                           |
| pinned(고정) 필지 보호                  | `if (out[id].pinned) return` — 고정 행 제외                  | **보존**         | v1 app.jsx:452,477 / v2 핸들러 `.not('pinned','is',true)` 이미 구현 |
| color 초기화 시 style 동반 제거         | `delete ov.color; delete ov.style`                           | **보존**         | v1 app.jsx:454 / v2 `buildResetPatch(['color'])={color,style:null}` |
| 그룹 초기화 = 그룹 전체 해체            | `if (items.includes('group')) setGroups({})`                 | **보존**         | v1 app.jsx:448 / v2 핸들러 `parcel_groups.delete().eq(tab_id)`      |
| ConfirmInline (2단계 인라인 확인)       | `pendingAction` 상태 + 확인 박스                             | **보존**         | 공통 `src/components/ui/ConfirmInline.tsx` 재사용                   |
| 빈 의미필드 행 청소                     | `if (Object.keys(ov).length===0) delete out[id]`             | **보존**         | v1 app.jsx:457 / v2 핸들러 isClearedOverride 청소 이미 구현         |
| 스냅샷 생성 UI (이름 입력·저장후초기화) | `pendingAction==='save-reset'`, label 입력, `/api/snapshots` | **폐기**         | §7.3 / §8.1 — 히스토리는 탭(M-16)으로 대체, 스냅샷 테이블 없음      |
| 히스토리 목록 (복원·이름수정·삭제)      | snapshots fetch·restore·rename·deleteAll                     | **폐기**         | M-16 탭 작업공간 소관 (HistorySheet)                                |
| 아이콘(icon) 초기화                     | 없음 (icon은 pinned 전용, pinned 보호로 자동 제외)           | **폐기(미대상)** | v1에도 icon 초기화 항목 없음 — pinned 보호에 종속                   |

## 사용자 스토리

- 작업자로서, 탭에 누적된 색칠·이름·메모·그룹을 항목별로 골라 한 번에 비우고 싶다 — 새 작업을 깨끗한 상태에서 시작하기 위해.
- 작업자로서, 고정(pinned)해 둔 중요 필지는 초기화에서 보호하고 싶다 — 기준점으로 남겨둔 필지가 실수로 지워지지 않도록.
- 작업자로서, 초기화는 되돌릴 수 없으므로 실행 전 한 번 더 확인하고 싶다 — 의도치 않은 대량 삭제를 막기 위해.

## 수용 기준 (AC)

### 핸들러 (통합 — `tests/integration/tabState.test.ts`, 이미 green인 AC-10을 M-15 게이트로 승계)

AC-1. Given `pinned=true`이고 color/name/memo가 채워진 필지 P1과 `pinned=false`인 필지 P2가 한 탭에 있을 때, When `POST /api/tabs/:tabId/reset` 을 `items:['color','name','memo','group']`로 호출하면, Then 응답은 `{ ok: true }`이고 P1의 color/name/memo는 그대로 보존되며 P2 행은 삭제(또는 의미필드 전부 null)된다.

AC-2. Given 탭에 그룹 G1이 존재할 때, When `items`에 `'group'`을 포함해 reset하면, Then 해당 탭의 `parcel_groups`에서 G1이 삭제되고, `items`에 `'group'`이 없으면 G1은 보존된다.

AC-3. Given reset 요청 본문에 `items`가 빈 배열일 때, When 핸들러를 호출하면, Then 400(zod `min(1)` 위반)을 반환한다.

### 프론트 — ResetSheet (RTL — `tests/unit/...` 또는 `src/features/tab/`)

AC-4. Given overrides에 color 보유 3필지·name 보유 1필지·memo 보유 0필지, groups 2개가 있을 때, When ResetSheet를 열면, Then 항목 행에 `색상/표시 방식 (3필지)`·`커스텀 이름 (1필지)`·`메모 (0필지)`·`그룹 (2개)` 카운트가 표시되고, 기본 체크 상태는 `color`·`group` 두 항목이다.

AC-5. Given ResetSheet가 열려 있을 때, When 모든 항목 체크를 해제하면, Then 초기화 실행 트리거(ConfirmInline 버튼)가 비활성(disabled)된다.

AC-6. Given 한 개 이상 항목이 체크된 상태에서, When 초기화 트리거를 1탭하면 취소/실행 쌍(ConfirmInline armed)이 나타나고, 실행을 탭하면 workspace 스토어 reset 액션이 선택된 `items` 배열로 1회 호출된다.

AC-7. Given overrides가 비어 있고 groups도 없을 때(v2 신규 탭 — 초기화 대상 0), When ResetSheet를 열면, Then 모든 항목 카운트가 `0`으로 표시되고 초기화 트리거는 disabled 상태다 (대상 0건이면 실행 불가).

AC-8. Given ResetSheet가 렌더된 상태에서, When 시트 전체를 조회하면, Then 스냅샷 이름 입력·"저장 후 초기화" 버튼·"히스토리" 목록·"복원"·"전체 삭제" 등 스냅샷 관련 요소가 존재하지 않는다 (스냅샷 UI 폐기 확인).

### 스토어 (RTL/단위 — workspace reset 액션)

AC-9. Given 활성 탭에 pinned=false인 color 보유 필지와 pinned=true인 color 보유 필지가 있을 때, When `reset(['color'])` 액션을 호출하면, Then 낙관적으로 비고정 필지의 color/style은 로컬에서 비워지고(남는 의미필드 없으면 키 삭제), pinned 필지의 color는 로컬 상태에 그대로 유지되며, `api.tabState.reset(tabId, { items:['color'] })`가 1회 호출된다.

AC-10. Given `reset(['group'])` 을 호출할 때, When 액션이 실행되면, Then 로컬 `groups`가 `{}`로 비워지고 `overrides`의 pinned 필지를 포함한 모든 필지가 보존된다.

### E2E (`tests/e2e/reset.spec.ts`)

AC-11. Given 색칠된 필지가 있는 탭에서 초기화 진입점을 탭해 ResetSheet를 열고, When `color` 항목만 체크된 상태로 초기화를 확인(2단계)하면, Then 시트가 닫히고 지도 캔버스에서 해당 필지의 색이 사라지며(또는 기본색으로 환원), pinned 필지가 있었다면 그 색은 유지된다.

## 비범위

- 스냅샷 생성·복원·이름수정·삭제 (M-16 탭 작업공간 / HistorySheet 소관).
- "저장 후 초기화" 흐름 — 별도 저장은 탭 닫기(소프트 클로즈)로 대체.
- 전 탭 일괄 초기화 — reset은 현재 활성 탭 스코프만.
- color_labels(팔레트) 초기화 — 팔레트는 전 탭 공유 자원으로 M-11 PaletteSheet 소관.
- 임시 진입점 아이콘의 최종 위치 — NavDrawer 도입 시 드로어 항목으로 이관 (M-9~M-12 선례 동일).

## 영향 범위

- 프론트:
  - `src/features/tab/ResetSheet.tsx` (신규) — 공통 `Sheet` 컨테이너 + 항목 체크박스(공통 `Checkbox`) + `ConfirmInline`. 로컬 useState로 선택 항목 draft, 실행 시에만 스토어 커밋.
  - `src/stores/ui.ts` — `resetSheetOpen: boolean` + `openReset`/`closeReset` 액션 추가 (M-11 `paletteOpen`·M-12 `shareOpen` 선례 동형). `SheetId` 유니온은 변경 불필요(독립 boolean 플래그 패턴 따름).
  - `src/stores/workspace.ts` — `reset(items: ResetItem[])` 액션 신규: pinned 보호 낙관적 로컬 정리(`deleteColorAndCleanup` 선례 — `normalizeOverride`/`isClearedOverride` 재사용, group 포함 시 `groups={}`) + `api.tabState.reset` 전송. 실패 시 롤백 없음(upsertParcel 동형), Realtime 에코 가드로 자기 mutate 무시되므로 로컬 정리 필수.
  - `src/App.tsx` — 임시 진입점 `IconButton`(예: lucide `RotateCcw`). 제안 위치: `top-16 right-29` (계산기 `top-16 right-16` 좌측 다음 칸, 기존 스택과 충돌 없음). 파괴적 작업이라 top-3 도구 행과 시각 분리.
- 백엔드: **없음** — `tabResetHandler`(`server/handlers/tabState.ts:181`)가 pinned 보호·그룹 삭제·청소·스냅샷 부수효과 없음으로 M-15 명세대로 이미 구현. `resetTabRequestSchema`(`src/types/api/tabState.ts:60`)·`api.tabState.reset`(`src/lib/api.ts:172`)도 존재. 통합 테스트 AC-10(`tests/integration/tabState.test.ts:132`)·단위 `buildResetPatch`(`tests/unit/utils/override.test.ts:50`) green.
- DB: 변경 없음 — `parcel_settings.pinned` 컬럼·`parcel_groups`는 `0001_v2_schema.sql`에 존재. 초기화는 의미필드 null화 후 cleared 행 삭제(normalizeOverride 동형).
- API 계약: 변경 없음 — `POST /api/tabs/:tabId/reset`, `resetTabRequestSchema = { items: ResetItem[].min(1), clientId }`, 응답 `okResponseSchema`. (`src/types/api/tabState.ts`)

## ui-designer 필요 여부

**불요.** 기존 공통 컴포넌트만 조합 — `Sheet`·`Checkbox`·`ConfirmInline`·`IconButton`. 신규 공통 컴포넌트·신규 Pencil 프레임 없음. (신규 UI 패턴이 없어 토큰 위반 위험 0.) Stage 2는 계약 검토만(변경 없음 확인)으로 통과.
