# 그룹 전체 (멀티선택·드래프트 생성·추가모드·그룹 시트·해체)

- 상태: 검토 대기
- 매핑: M-8 (`app.jsx` 그룹 상태·핸들러 + `GroupSheet.jsx` → `src/features/group/`)
- 판정: 재설계 (pendingGroupCreate 드래프트 트랜잭션·멀티선택·추가모드 의미론은 **동작 보존**, 구조는 Zustand 액션 + features/group/으로 재설계 — ref 미러 5종·인라인 스타일·자체 닫힘 가드·투영면적 폴백 폐기)

## 판정 상세 (선별적 포팅)

| 구분   | 항목                                                                                                                                                            | 근거                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 보존   | **pendingGroupCreate 드래프트 트랜잭션**: 생성 시 영향 그룹 원본 스냅샷 → 로컬만 즉시 반영(지도 미리보기) → 저장 시 커밋 / 취소·닫기 시 원복                    | 명세서 M-8 "동작 그대로 보존" — v1 `createGroupFromSelection`·`onSave`·`onDissolve`·`onClose` 전수 확인 |
| 보존   | 커밋 순서: 영향받은 기존 그룹들의 현재 로컬 상태를 먼저 저장(잔여 0이면 `group: null` 삭제) 후 신규 그룹 저장                                                   | v1 `onSave` 동작                                                                                        |
| 보존   | 멀티선택 의미론: 토글 버튼 진입, 비그룹 필지 개별 토글, **그룹 소속 필지 탭 = 그룹 전체 토글**(전원 선택돼 있으면 전체 해제), 최소 2개, 빈 곳 탭 무시           | v1 `handleSelect` multiSelectMode 분기                                                                  |
| 보존   | 추가모드 의미론: 탭마다 **즉시 서버 반영**(드래프트 아님), 타 그룹 소속 필지 무시, 재탭 시 제거, 완료 시 해당 그룹 시트 복귀                                    | v1 `handleSelect` addToGroupMode 분기 + 완료 버튼                                                       |
| 보존   | 일반 모드에서 그룹 멤버 탭 → **그룹 선택 + 그룹 시트** (개별 필지 시트 아님). 빈 곳 탭 → 선택 해제                                                              | v1 `handleSelect` 일반 분기 (계산기 모드 예외는 M-10 비범위)                                            |
| 보존   | 해체 = 그룹 행 삭제만 (`group: null`). **멤버 필지의 개별 override는 무변경** — 멤버는 자기 개별 색·이름 렌더로 복귀. 확인 다이얼로그 없음                      | v1 `onDissolve` = `updateGroup(gid, null)` 단독 — parcel_settings 호출 없음 확인                        |
| 보존   | 시트 정보 구조: 헤더(N필지 배지)→이름→합계 면적+단위→메모→표시방식→색상→멤버 목록→필지 추가→저장→해체. draft 패턴(저장 버튼에서만 커밋), name/memo trim         | v1 `GroupSheet.jsx` 전수                                                                                |
| 보존   | pending 시트 차이: 해체 버튼 라벨 "취소", "필지 추가" 버튼 숨김, 멤버 제거는 로컬만                                                                             | v1 `isPending` 분기                                                                                     |
| 보존   | 드래프트 생성 직후 멀티선택 자동 종료 + 신규 그룹 시트 자동 열림                                                                                                | v1 `createGroupFromSelection` 말미                                                                      |
| 보존   | 멤버 0 그룹 허용 (시트에서 마지막 멤버 제거·추가모드 전체 해제 시 그룹 유지 — 삭제는 해체로만)                                                                  | 추가모드 토글 중 그룹 소멸 시 흐름 파손 방지 — v1 동작                                                  |
| 보존   | 안내 배너 문구: "묶을 필지를 탭해서 선택하세요" / "N개 선택됨" / "추가할 필지를 탭하세요 (탭 재선택 시 제거)"                                                   | v1 검증 문구                                                                                            |
| 재설계 | 상태: useState 7개 + ref 3개(multiSelectedRef·pendingGroupCreateRef·groupsRef) → `stores/ui.ts` selection(M-5 예약분) + `stores/workspace.ts` 트랜잭션 액션 3개 | ref 미러 금지 (컨벤션)                                                                                  |
| 재설계 | groupId 클라 생성: v1 `grp_<ts36><rand3>` → 서버 `ids.ts`와 동일 `grp_<ts36><rand6>` 포맷으로 통일                                                              | 충돌 여유 확대 + 포맷 단일화 (계약 `upsertGroupRequestSchema.groupId`는 클라 생성 허용)                 |
| 재설계 | v1 저장 시 `color` 없으면 `style: null` 정규화 → 폐기. v2 `groupSchema.style`은 non-null('fill'\|'border') — color null이면 1.5차 패스가 style 무시             | Phase 3 계약 확정분과 정합                                                                              |
| 재설계 | 합계 면적: v1 `areas` 캐시 + `p.area`(투영면적) 폴백 → 시트 열림 시 멤버별 `api.parcels.get` 병렬 조회, `lndpclAr` 없는 멤버는 합산 제외                        | 투영면적은 ㎡가 아님 — v1 폴백은 단위 오류 버그 (M-7 단건 조회 선례)                                    |
| 재설계 | v1 시트 자체 500ms 닫힘 가드 → 공통 `BottomSheet` 400ms 가드로 단일화                                                                                           | M-7 선례 — 가드는 컨테이너 책임                                                                         |
| 재설계 | 인라인 스타일·`isWide` 수동 분기 → 공통 `Sheet`·`SegmentedControl`·`ColorSwatch`·`Input`·`Textarea`·`Button`·`IconButton` + 토큰 재조립                         | Phase 1 공통 UI                                                                                         |
| 폐기   | lucide CDN(`data-lucide`) → 번들 import                                                                                                                         | 명세서 §7.3-3                                                                                           |
| 폐기   | 계산기 모드에서 그룹 멤버를 개별 필지로 처리하는 분기                                                                                                           | M-10 소관 — 본 건에서 구현하지 않음                                                                     |

## 사용자 스토리

1. 공동체 사용자는 여러 필지를 탭으로 묶어 그룹을 만들고, 이름·색을 정해 모두의 지도에서 한 덩어리로 보이게 한다.
2. 사용자는 그룹을 만들다 마음이 바뀌면 취소하고, 지도가 만들기 전 상태로 정확히 돌아가길 기대한다.
3. 사용자는 기존 그룹에 필지를 더하거나 빼고, 필요 없어진 그룹은 해체한다 (필지의 개별 설정은 그대로).

## 동작 명세

### ① 멀티선택 모드 진입·토글·취소

- **진입 트리거**: 지도 위 레이어 아이콘 **토글 버튼** (v1 확인 — 길게 누르기 아님). 시트 열림·추가모드 중에는 버튼 숨김 (`!addToGroupMode && 시트 닫힘` 조건).
- 진입 시 `multiSelectedIds: []`. 안내 배너 표시: 0개면 "묶을 필지를 탭해서 선택하세요", N개면 "N개 선택됨" + **취소** 버튼.
- 탭 동작 (`tapParcel` 멀티선택 분기): 비그룹 필지 → 개별 토글. 그룹 소속 필지 → **그룹 멤버 전체** 합집합 추가, 이미 전원 선택 상태면 전체 제거. 빈 곳 탭(null) → 무시.
- 취소(배너 버튼 또는 토글 버튼 재탭) → 모드 종료 + 선택 비움. 캔버스 6차 패스(멀티선택 강조 + 그룹 힌트)는 엔진에 이미 구현 — selection 입력만 공급.

### ② 그룹 생성 (드래프트 트랜잭션 — 동작 보존 핵심)

- 2개 이상 선택 시 FAB **"그룹 만들기 (N필지)"** 노출. 2개 미만이면 생성 불가(FAB 미노출, 액션도 무시).
- `workspace.beginGroupDraft(parcelIds)`:
  1. `groupId = grp_<ts36><rand6>` 클라 생성.
  2. 선택에 멤버를 빼앗기는 기존 그룹들의 **원본 스냅샷**을 `pendingGroupCreate.originalAffectedGroups`에 저장.
  3. **로컬 groups만** 갱신 (서버 호출 0회): 영향 그룹에서 선택 필지 제거(잔여 0이면 로컬 삭제), 신규 그룹 `{ name: null, memo: null, color: null, style: 'fill', parcelIds }` 추가 → 지도 미리보기.
  4. 멀티선택 종료 + `selectedGroupId = groupId` + `openSheet: 'group'` (pending 상태로 시트 열림).
- **확정** (시트 저장 버튼): `commitGroupDraft(draft)` — 영향 그룹 각각의 현재 로컬 상태를 `upsertGroup` 전송(로컬에서 삭제됐으면 `group: null`), 이어 신규 그룹을 draft(이름·메모·색·표시방식 + 현재 멤버)로 전송. pending 해제.
- **취소** (시트 "취소" 버튼 / X / backdrop 닫기): `cancelGroupDraft()` — 신규 그룹 로컬 제거 + 영향 그룹 원본 복원. **서버 호출 0회, DB 무변경**.
- pending 중 시트에서 멤버 제거 → 로컬만 갱신 (커밋 시 반영, 취소 시 원복 대상 아님 — 신규 그룹 자체가 제거되므로).

### ③ 그룹 멤버 탭 → 그룹 선택 + 시트

- 일반 모드에서 그룹 소속 필지 탭 → `selectedGroupId` 설정(+`selectedParcelId: null`) + 그룹 시트 열림. 캔버스 5차 패스(그룹 선택 강조) 자동 동작.
- 시트 열린 채 다른 그룹 멤버 탭 → 대상 그룹 전환 + draft 리셋 (미저장분 무확인 폐기 — M-7 선례 동일).
- 비소속 필지 탭 → 기존 M-7 필지 시트 분기 유지. 빈 곳 탭 → 선택·시트 해제.

### ④ 그룹 시트 (구성 전수 — 위→아래)

1. **헤더**: 메타 라벨 "그룹" + "N필지" 배지 + 닫기 X(`IconButton`). 이름 `Input` (placeholder "그룹 이름 입력").
2. **합계 면적 행**: 멤버 `lndpclAr` 합산 + 단위 `SegmentedControl` (즉시 전역 반영 — `ui.areaUnit`, draft 아님). 멤버별 `api.parcels.get` 병렬 조회, 면적 없는 멤버는 합산 제외, 전부 없으면 행 생략.
3. **메모**: `Textarea` 2줄, placeholder "그룹에 대한 메모를 입력하세요".
4. **표시 방식**: fill("채움")/border("테두리") — draft.color 없으면 비활성.
5. **색상**: "없음" 스와치 + `colorLabels` 동적 목록.
6. **포함 필지 (N)**: 멤버 목록 — 지번 + 면적 + 제거 X 버튼. 제거는 비 pending이면 즉시 `upsertGroup`(해당 멤버 제외 parcelIds), pending이면 로컬만.
7. **필지 추가** 버튼 (pending이면 숨김): 시트 닫고 추가모드 진입.
8. **저장** 버튼: draft 정규화(name/memo trim, 빈 문자열 → null) 후 pending이면 `commitGroupDraft`, 아니면 `upsertGroup` 1회. 닫힘.
9. **해체** 버튼: pending이면 라벨 "취소"(=`cancelGroupDraft`), 아니면 "그룹 해체"(=`upsertGroup(gid, null)`). 닫힘. 확인 다이얼로그 없음.

- 이름·메모·색·표시방식은 전부 로컬 draft — 저장 전 스토어·서버·캔버스 미반영. 닫힘 가드는 공통 `BottomSheet` 400ms (본 건 AC 비대상).

### ⑤ 추가모드 (7차 패스)

- 진입: 그룹 시트 "필지 추가" → 시트 닫힘 + `addToGroupModeGroupId = gid`. 배너 "추가할 필지를 탭하세요 (탭 재선택 시 제거)" + **완료** 버튼. 캔버스 7차 패스(추가모드 강조)는 엔진 기구현.
- 탭 (`tapParcel` 추가모드 분기): 다른 그룹 소속 필지 → 무시 (서버 호출 없음). 해당 그룹 멤버 → 제거, 비멤버 → 추가. **탭마다 `upsertGroup` 즉시 전송** (드래프트 아님 — v1 보존). 빈 곳 탭 → 무시.
- 완료: 추가모드 해제 + 해당 그룹 시트 재열림 (`selectedGroupId = gid`).

### ⑥ 해체

- `upsertGroup(gid, null)` → 낙관적 로컬 삭제 + 서버 `group: null` 전송 (clientId 포함 — 에코 가드). 멤버 필지의 `parcel_settings`는 **건드리지 않는다** — 개별 색·이름·메모·핀은 그대로이며 캔버스가 즉시 개별 override 렌더(2차 패스)로 복귀.

### 서버 계약 (변경 없음 확인)

- `POST /api/tabs/:tabId/groups` — `upsertGroupRequestSchema { groupId, group | null, clientId }` (Phase 3 확정). 그룹 단위 **전체 교체** upsert. `groupId`는 `z.string().min(1)` — **클라이언트 생성 허용 확인됨**. 생성 포맷은 서버 `server/handlers/ids.ts`와 동일한 `grp_<timestamp36><random6>` (클라는 자체 유틸 — server/ import 금지).
- 드래프트 커밋이 영향 그룹 K개 + 신규 1개 = K+1회 호출하는 것은 v1과 동일 — 일괄 트랜잭션 엔드포인트는 만들지 않는다 (실패 시 롤백 없음 + console.error는 스토어 기존 정책).

## 수용 기준 (AC)

스토어·트랜잭션 단위 테스트 (Vitest, `tests/unit/`):

AC-1. Given 멀티선택 모드, When 비그룹 필지를 탭/재탭하면 Then `multiSelectedIds`에 추가/제거되고, When 그룹(멤버 a,b) 소속 필지를 탭하면 Then a,b가 모두 추가되며, a,b가 이미 전부 선택된 상태에서 다시 탭하면 Then a,b가 모두 제거된다. 빈 곳 탭(null)은 선택을 바꾸지 않는다.

AC-2. Given 필지 p1,p2 선택(p2는 기존 그룹 G(p2,p3) 소속... 의 멤버 전체 선택 규칙에 따라 p2,p3 포함), When `beginGroupDraft`를 호출하면 Then `grp_` 접두 신규 그룹이 로컬 groups에 선택 필지 전체와 함께 추가되고, G는 멤버를 빼앗겨 로컬에서 삭제(잔여 0)되며, `pendingGroupCreate`에 G의 원본 스냅샷이 저장되고, 멀티선택이 종료되고 신규 그룹이 선택되며, **서버 호출은 0회**다. 선택이 2개 미만이면 아무 일도 일어나지 않는다.

AC-3. Given AC-2의 pending 상태, When `cancelGroupDraft`를 호출하면 Then 신규 그룹이 로컬에서 제거되고 G가 원본 멤버 그대로 복원되며, **서버 호출은 0회**다 (원복).

AC-4. Given AC-2의 pending 상태, When `commitGroupDraft({ name: '윗논', color, style })`를 호출하면 Then 영향 그룹 G에 대해 `upsertGroup(G, null)`, 신규 그룹에 대해 draft 값+현재 멤버로 `upsertGroup` 전송이 각 1회 발생하고 pending이 해제된다.

AC-5. Given 그룹 G의 추가모드, When 비멤버 필지를 탭하면 Then G의 parcelIds에 추가된 `upsertGroup`이 즉시 1회 전송되고, 멤버 필지를 탭하면 제거로 1회 전송되며, **다른 그룹 소속** 필지를 탭하면 전송이 발생하지 않는다.

AC-6. Given 일반 모드, When 그룹 소속 필지를 탭하면 Then `selectedGroupId`가 설정되고 `openSheet: 'group'`, `selectedParcelId: null`이 되며, 비소속 필지를 탭하면 기존 필지 시트 분기('parcel')가 유지된다.

그룹 시트 컴포넌트 테스트 (RTL, `tests/unit/`):

AC-7. Given 이름·메모·색이 있는 멤버 2개 그룹으로 시트를 렌더하면 Then 헤더에 "2필지" 배지, 각 입력이 그룹 값으로 초기화되고, 멤버 목록에 지번 2개가 표시되며, draft.color를 "없음"으로 바꾸면 표시 방식이 비활성화된다.

AC-8. Given 시트에서 이름 " 윗논 "·메모·색을 편집한 상태, When 저장 전까지는 Then 그룹 저장이 호출되지 않고, When 저장을 탭하면 Then 정확히 1회, trim된 `name: '윗논'`으로 호출된 뒤 시트가 닫힌다.

AC-9. Given `isPending=true`로 렌더하면 Then 해체 자리 버튼 라벨이 "취소"이고 "필지 추가" 버튼이 없으며, `isPending=false`면 라벨이 "그룹 해체"이고 "필지 추가" 버튼이 노출된다.

AC-10. Given 비 pending 시트, When 멤버 행의 제거 X를 탭하면 Then 해당 멤버가 제외된 parcelIds로 그룹 저장이 즉시 1회 호출된다 (마지막 멤버 제거 시에도 그룹 삭제가 아닌 멤버 0 저장).

E2E (Playwright + mockApi, `tests/e2e/group-management.spec.ts`):

AC-11. Given 지도 화면, When 멀티선택 토글 버튼을 탭하면 Then 안내 배너가 나타나고, 필지 2개를 탭하면 "2개 선택됨"과 FAB "그룹 만들기 (2필지)"가 나타나며, FAB를 탭하면 그룹 시트가 열린다 (해체 자리 라벨 "취소").

AC-12. Given AC-11의 pending 시트, When 색을 선택하고 이름을 입력한 뒤 저장을 탭하면 Then 시트가 닫히고, 멤버 필지 중심점의 캔버스 픽셀 색이 생성 전과 달라지며, mockApi에 `grp_` 접두 groupId의 그룹 upsert가 기록된다.

AC-13. Given AC-11과 동일하게 pending 시트까지 진행, When "취소"를 탭하면 Then 시트가 닫히고 캔버스 픽셀이 생성 전과 동일하며 mockApi에 그룹 호출 기록이 없다 (원복 E2E).

AC-14. Given AC-12로 저장된 그룹, When 멤버 필지를 탭하면 Then 그룹 시트가 다시 열리고, "그룹 해체"를 탭하면 Then 시트가 닫히고 멤버 필지 픽셀이 그룹 생성 전 색으로 복귀하며, mockApi에 `group: null` 전송이 기록되고 필지(parcel_settings) 호출은 발생하지 않는다.

> 400ms 닫힘 가드(공통 BottomSheet)·6차/7차 캔버스 패스 픽셀 검증(M-2 기구현)·그룹 라벨(M-4 기구현)은 본 건 AC 비대상.

## 비범위

- 필지 목록 뷰의 그룹 표시·검색 (M-9)
- 자동 계산기의 그룹/개별 전환 + 계산기 모드에서 그룹 멤버 개별 처리 분기 (M-10)
- 그룹 라벨 렌더 (M-4 완료 — 본 건은 groups 데이터 공급만)
- 초기화의 group 항목 처리 (M-15)
- pending 드래프트 중 Realtime으로 영향 그룹 원격 변경 수신 시 병합 정책 — v1 미정의(마지막 쓰기 승리), M-6 소관
- 그룹 일괄 트랜잭션 API — 만들지 않음 (v1 동일 K+1회 호출)

## 영향 범위

- 프론트: `src/features/group/` 신규 — `GroupSheet.tsx`, `MultiSelectOverlay.tsx`(토글 버튼·FAB·배너), `AddToGroupBanner.tsx`, `groupId.ts`(grp\_ 생성 유틸), 컴포넌트 테스트. `src/App.tsx` 마운트 연결.
- 스토어: `src/stores/ui.ts` — `SheetId`에 `'group'` 추가, `tapParcel` 멀티선택/추가모드/그룹 분기 확장(M-5 예고분), 멀티선택·추가모드 진입/종료 액션, `closeSheet`의 그룹·pending 연동(닫기 = pending이면 원복). `src/stores/workspace.ts` — `pendingGroupCreate` 상태 + `beginGroupDraft`/`commitGroupDraft`/`cancelGroupDraft` 액션 추가 (`upsertGroup`은 기존 그대로).
- 백엔드: **없음** — `upsertGroup` 기존 계약으로 충분 (`groupId` 클라 생성 허용·전체 교체·`group: null` 삭제 모두 Phase 3 확정분으로 커버 확인).
- DB: 마이그레이션 불필요.
- API 계약: 없음 (신규/변경 스키마 없음).
- 디자인: **ui-designer 필요** — `design/bogugot.pen`에 그룹 시트 프레임 + 멀티선택/추가모드 지도 오버레이(토글 버튼·FAB·배너) 프레임 추가 (Stage 2). 신규 공통 UI 후보: 모드 배너 — feature-local로 시작하되 Stage 2에서 신고.
