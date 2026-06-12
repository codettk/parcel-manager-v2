# 동적 색상 팔레트 (라벨 편집·색 추가/삭제·순서)

- 상태: 검토 대기
- 매핑: M-11 (`SettingsSheet.jsx` → `src/features/palette/`)
- 판정: 재설계 (동적 팔레트 의미론 — 라벨·hex 편집, 색 추가/삭제, draft 일괄 저장 — 은 v1 보존. **삭제 시 참조 필지 color null 처리는 Phase 3에서 서버 책임으로 이전 완료**(`DELETE /api/colors/:id`, phase3-db-api AC-11) — 클라이언트는 낙관적 로컬 정리 + 타 클라이언트는 Realtime 기존 채널로 수신. v1의 `window.confirm`·"기본값" 리셋 버튼은 폐기)

## 판정 상세 (선별적 포팅)

| 구분   | 항목                                                                                                                                                  | 근거                                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 보존   | draft 일괄 저장 패턴: 시트 열 때 `colorLabels` 복사 → 라벨·hex 편집과 삭제 마크(deletedIds)는 로컬 누적 → "저장" 시 일괄 반영, X/backdrop 닫기 = 폐기 | v1 `SettingsSheet` drafts/deletedIds + CONVENTIONS draft 패턴                                                                                                          |
| 보존   | 저장 순서: 삭제 마크된 id들 DELETE → 남은 색 전체 PUT(upsert) → 시트 닫기                                                                             | v1 `handleSave` (deletedIds 순회 → onColorsChange). PUT은 upsert라 삭제된 색을 되살리지 않음                                                                           |
| 보존   | hex 입력 = 네이티브 `<input type="color">` 피커 (모바일 OS 피커, 의존성 0, `#rrggbb` 6자리 보장 — `colorLabelSchema` 정규식 충족)                     | v1 행 구성 전수 확인                                                                                                                                                   |
| 보존   | 라벨 텍스트 입력 `maxLength 12`, 색 추가 기본값 `{ label: '새 색상', hex: '#888888' }`, 추가는 맨 뒤                                                  | v1 `handleAdd`·input 제약                                                                                                                                              |
| 보존   | 사용 중인 색 삭제 시 경고에 참조 필지 수 표시 ("필지 N개가 색상 없음으로 변경됩니다")                                                                 | v1 `handleDelete` affectedCount                                                                                                                                        |
| 보존   | 삭제 시 로컬 정리: 해당 색을 참조하는 override의 `color`·`style`을 비우고, 남는 필드가 없으면 키 자체 삭제                                            | v1 `app.jsx deleteColor` 정규화 — 서버 핸들러도 동일 정규화(`color: null, style: null`)라 로컬·서버 일치                                                               |
| 재설계 | **삭제 참조 정리의 권위 주체**: v1 클라이언트 로직 → **서버**(`colorItemHandler`가 전 탭 settings/groups null 처리, Phase 3 구현·테스트 완료)         | 멀티탭 v2에서 클라이언트는 전 탭을 알 수 없음 (phase3-db-api §변경 사유 2). 클라이언트 몫 = 현재 탭 낙관적 로컬 정리뿐 (자기 mutate는 Realtime 에코 가드로 무시되므로) |
| 재설계 | 참조 수 산정: v1 단일 상태 overrides만 → **현재 탭** overrides + groups 참조 수, 문구에 "모든 탭에서 해제" 명시                                       | v1은 groups color를 정리·집계하지 않는 공백이 있었음(서버는 groups도 null 처리). 전 탭 참조 수는 클라이언트가 모름 — 현재 탭 기준 + 전 탭 영향 고지                    |
| 재설계 | `window.confirm` → 2단계 인라인 확인 (`ConfirmInline` 패턴 — 1탭은 확인 표시, 2탭째 실행)                                                             | v2에 네이티브 confirm 금지할 이유: E2E 자동화·일관 UX. M-15도 `ConfirmInline` 유지 판정 선례                                                                           |
| 재설계 | 빈 라벨 처리: v1 "저장 시 조용히 필터" → **빈 라벨 행 존재 시 저장 버튼 비활성**                                                                      | v1 방식은 기존 색의 라벨을 비우면 그 색의 변경만 PUT에서 빠져 조용히 무시됨(upsert라 삭제도 아님) — 모호 동작 제거                                                     |
| 재설계 | 색 id 생성: `'c_' + Date.now()` → `crypto.randomUUID()`                                                                                               | 동일 ms 연속 추가 충돌 — M-10 선례                                                                                                                                     |
| 재설계 | 순서: 묵시적 배열 순서 → **draft 행 인덱스를 `sortOrder`로 명시 부여해 PUT** (GET이 sort_order 정렬이므로 왕복 보존)                                  | Phase 3 계약(`colorLabelSchema.sortOrder`)이 이미 요구 — v1엔 없던 필드의 의미 확정                                                                                    |
| 재설계 | 진입점: v1 NavDrawer "색상 이름 설정" → 지도 우상단 **임시 IconButton** (팔레트 아이콘 — 릴리즈 노트·계산기 선례, 드로어 도입 시 이전)                | v2에 NavDrawer 미존재                                                                                                                                                  |
| 재설계 | 인라인 스타일·lucide 수동 createIcons → `Sheet`·`Input`·`IconButton`·`Button`·`ConfirmInline` + 토큰                                                  | Phase 1 공통 UI 재조립                                                                                                                                                 |
| 폐기   | "기본값" 리셋 버튼 (v1 `COLORS` 상수로 draft 복원)                                                                                                    | 기본 팔레트 hex를 프론트에 하드코딩해야 함 — "팔레트 6색은 DB(color_labels) 소관, 토큰 아님·하드코딩 hex 금지" 규칙 위반. 복원 필요 시 DB 시드/M-15 계열 후속          |
| 폐기   | 시트 열 때 colors GET 재조회 불필요 판단                                                                                                              | calcRecipes와 달리 colors는 Realtime 채널(M-6 `applyRemoteColors` refetch)이 있어 `workspace.colorLabels`가 항상 최신                                                  |

## 사용자 스토리

1. 공동 작업자는 팔레트 색의 이름(예: "매수 예정" → "과수원")과 색상값을 편집해, 모든 사용자·모든 탭의 필지 시트와 지도에 즉시 같은 의미 체계를 공유한다.
2. 작업 분류가 늘면 색을 추가하고, 더 쓰지 않는 색은 삭제한다 — 삭제 시 그 색이 칠해진 필지가 몇 개인지 미리 확인하고, 삭제하면 해당 필지들은 색 없음으로 정리된다.

## 동작 명세

### 진입·시트 (`src/features/palette/PaletteSheet.tsx`)

- 진입: 지도 우상단 임시 IconButton(팔레트 아이콘) → `ui.paletteOpen = true`. 시트 열림 시 `workspace.colorLabels`를 draft로 복사 (`deletedIds: []`).
- 행 구성: 네이티브 컬러 피커(`<input type="color">`, 32px) · 라벨 `Input`(maxLength 12, placeholder "색상 이름") · 삭제 버튼. 행 순서 = sortOrder 순(= colorLabels 순).
- "+ 색상 추가": `{ colorId: crypto.randomUUID(), label: '새 색상', hex: '#888888' }` 행을 맨 뒤에 추가.
- 삭제(2단계): 삭제 버튼 1탭 → 해당 행에 확인 UI 표시. 현재 탭 참조 수(overrides에서 `color === colorId`인 필지 N개, groups에서 M개)가 0보다 크면 "필지 N개[·그룹 M개]가 색상 없음으로 변경됩니다 (모든 탭 적용)" 문구 포함. 확인 탭 → draft에서 행 제거 + `deletedIds`에 추가 (API는 아직 미호출). 취소 가능.
- "저장": ① `deletedIds` 각각 `workspace.deleteColorAndCleanup(colorId)` 순차 실행 → ② 남은 draft에 행 인덱스로 `sortOrder` 부여 후 `workspace.saveColors(colors)` → ③ 시트 닫기. 빈 라벨(trim 후 공백) 행이 하나라도 있으면 저장 버튼 비활성.
- X/backdrop 닫기: draft·deletedIds 폐기, API 호출 없음.

### workspace 스토어 액션 (M-5에서 "M-11 소관"으로 이연된 colorLabels mutate)

- `saveColors(colors: ColorLabel[])`: `api.colors.put({ colors })` 호출 + `colorLabels` 로컬 갱신 (낙관적 — clientId는 api 클라이언트가 자동 주입, 에코 가드 기존 동작).
- `deleteColorAndCleanup(colorId: string)`: `api.colors.remove(colorId)` 호출 + 로컬 낙관적 정리 —
  1. `colorLabels`에서 해당 색 제거
  2. 현재 탭 `overrides` 중 `color === colorId`인 항목의 `color`·`style`을 null로 — 정리 후 의미 있는 필드가 없으면 키 삭제 (`normalizeOverride`/`isClearedOverride` 재사용, 서버 정규화와 동형)
  3. 현재 탭 `groups` 중 `color === colorId`인 그룹의 `color`를 null로
- 동기화 경로 (코드 무변경 — M-6 기구현): 타 클라이언트는 colors 채널 refetch(`applyRemoteColors`) + settings/groups 채널 행별 UPDATE로 수신. 자기 자신은 에코 가드로 무시되므로 위 낙관적 로컬 정리가 필수.

### 소비처 반영 (코드 무변경 — 스토어 구독으로 자동)

`colorLabels` 변경 시 ParcelSheet·GroupSheet 색 스와치, 목록 뷰 색 필터, 지도 엔진 `selectColorById` 셀렉터가 자동 갱신된다. 본 건은 E2E로 전파만 검증한다.

## 수용 기준 (AC)

단위 테스트 (Vitest, `tests/unit/stores/` — api 모킹):

AC-1. Given api를 모킹한 workspace 스토어, When `saveColors`를 3색 배열로 호출하면, Then `api.colors.put`이 행 순서대로 `sortOrder` 0·1·2가 부여된 배열로 1회 호출되고 `colorLabels`가 그 배열로 갱신된다.

AC-2. Given `colorLabels`에 색 c가 있고 현재 탭 overrides에 ① color=c·style만 있는 필지 ② color=c·name도 있는 필지 ③ 다른 색 필지가 있으며 groups에 color=c인 그룹이 있을 때, When `deleteColorAndCleanup(c)`를 호출하면, Then `api.colors.remove(c)`가 호출되고 `colorLabels`에서 c가 제거되며 ①은 키 삭제·②는 color/style null에 name 보존·③은 불변이고 해당 그룹 color는 null이 된다.

컴포넌트 테스트 (RTL, `tests/unit/`):

AC-3. Given colorLabels 3색으로 팔레트 시트를 렌더하면, Then 행마다 컬러 피커(hex 값)와 라벨 입력이 표시된다. When 라벨과 hex를 수정하고 "+ 색상 추가"를 탭하면, Then 새 행("새 색상"/`#888888`)이 맨 뒤에 추가되며, When X로 닫으면, Then `api.colors.put`/`remove`가 호출되지 않는다 (draft 폐기).

AC-4. Given 현재 탭에서 필지 2개가 참조하는 색 행, When 삭제 버튼을 1회 탭하면, Then 행은 아직 삭제되지 않고 확인 UI에 참조 수 "필지 2개" 문구가 표시된다. When 확인을 탭하면, Then 행이 draft에서 제거되고(API 미호출 상태), When "저장"을 탭하면, Then `remove`(해당 colorId) 후 `put`(남은 색 + 재계산된 sortOrder) 순으로 호출되고 시트가 닫힌다.

AC-5. Given 라벨을 모두 지운 행이 있는 draft, Then 저장 버튼이 비활성이고, When 라벨을 다시 입력하면, Then 저장 버튼이 활성으로 복귀한다.

E2E (Playwright + mockApi, `tests/e2e/color-palette.spec.ts`):

AC-6. Given 부팅된 앱, When 팔레트 진입 버튼 → 첫 색의 라벨을 "과수원"으로 변경 → 저장 → 필지를 탭해 필지 시트를 열면, Then 색 선택 스와치에 "과수원" 라벨이 표시된다.

AC-7. Given 색 c로 칠해진 필지(메인 캔버스에 c 합성 채움 픽셀 존재 — realtime-sync.spec 픽셀 카운트 패턴), When 팔레트에서 c를 삭제(2단계 확인) → 저장하면, Then 메인 캔버스에서 c 합성 픽셀 수가 0이 되고, 해당 필지 시트를 다시 열면 선택된 색이 없으며 스와치 목록에 c가 없다.

## 비범위

- 서버 측 삭제 참조 null 처리·DELETE/PUT 핸들러 — **Phase 3 완료분** (phase3-db-api AC-11로 이미 테스트됨, 본 건 백엔드 코드 무변경)
- JSON 내보내기/불러오기의 colors 포함 (M-12)
- 탭 내 선택 초기화·기본 팔레트 복원 (M-15 계열 — v1 "기본값" 버튼은 폐기 판정)
- 드래그/버튼식 명시적 행 재정렬 UI — v1에 없음. 순서는 추가 순서(행 인덱스 → sortOrder)로만 결정, 재정렬 UI는 필요 시 후속
- NavDrawer 정식 진입점 (드로어 도입 시 임시 버튼 이전)
- 색 개수 상한·빈 팔레트 금지 (v1에도 없음 — 전체 삭제 시 스와치 0개가 정상 동작)

## 영향 범위

- 프론트: `src/features/palette/PaletteSheet.tsx` 신규. `src/stores/workspace.ts` — `saveColors`·`deleteColorAndCleanup` 액션 추가 (M-5 명세가 M-11 소관으로 이연한 colorLabels mutate). `src/stores/ui.ts` — `paletteOpen` + 열기/닫기 액션. `src/App.tsx` — 임시 진입 IconButton·시트 마운트.
- 백엔드: **없음** — `server/handlers/colors.ts` Phase 3 완료 (GET/PUT/DELETE + 전 탭 참조 null 처리).
- DB: 마이그레이션 불필요 (`color_labels` 기존 테이블).
- API 계약: 없음 — `src/types/api/colors.ts`·`src/lib/api.ts`(`api.colors.list/put/remove`) 기존 그대로.
- Realtime: 코드 무변경 — colors 채널 refetch·settings/groups 채널 수신은 M-6 기구현.
- 테스트 인프라: `tests/e2e` mockApi에 `PUT /api/colors`·`DELETE /api/colors/:id` 응답 추가.
- 디자인: **ui-designer 필요** — `design/bogugot.pen`에 팔레트 시트 프레임(편집 행·추가·삭제 확인) 추가 (Stage 2). 공통 UI는 `Sheet`·`Input`·`IconButton`·`Button`·`ConfirmInline` 재조립 — 단, **네이티브 컬러 피커 래퍼**(`<input type="color">`)는 기존 18종에 없으므로 Stage 2에서 신규 UI로 신고 대상.
