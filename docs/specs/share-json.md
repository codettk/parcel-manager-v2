# JSON 내보내기/불러오기 (작업 상태 공유)

- 상태: 완료 (5단계 검증 1차 통과, 2026-06-12)
- 매핑: M-12 (`ShareSheet.jsx` + `app.jsx` exportJSON/importJSON → `src/features/share/`)
- 판정: 재설계 (파일 한 개로 상태를 주고받는 의미론 — 내보내기 = Blob 다운로드, 불러오기 = 파일 선택 후 전체 반영 — 은 v1 보존. **검증·적용 경로는 재설계**: v1은 무검증 `JSON.parse` + 즉시 적용 + 개별 API 3종 순차 호출이었으나, v2는 zod 스키마 검증 → 미리보기/확인 → 서버 `PUT /api/tabs/:tabId/import` 단일 호출(전체 교체 + group_id 재생성, Phase 3 기구현) 경유. 포맷은 `version: 2` + `tabId` 메타 확정, v1 파일(version 1)은 거부)

## 판정 상세 (선별적 포팅)

| 구분   | 항목                                                                                                                                                                                                                                                     | 근거                                                                                                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 보존   | 내보내기 = `Blob` + 임시 anchor 다운로드, `JSON.stringify(payload, null, 2)` (사람이 열어볼 수 있는 포맷)                                                                                                                                                | v1 `exportJSON` 전수 확인. 카카오톡·이메일·드라이브로 파일을 주고받는 사용 시나리오 유지                                                                                                                |
| 보존   | 불러오기 = 숨김 `<input type="file" accept=".json,application/json">` + 같은 파일 재선택 가능하도록 선택 후 `value` 초기화                                                                                                                               | v1 `ShareSheet` fileRef 패턴                                                                                                                                                                            |
| 보존   | 시트 통계: 설정된 필지 수 표시                                                                                                                                                                                                                           | v1 `coloredCount` stat. v2는 현재 탭 `overrides` 키 수 + `groups` 수로 구성                                                                                                                             |
| 재설계 | **임포트 검증**: v1 무검증(`obj.parcels \|\| {}` 식 방어) → **zod `shareFileSchema.safeParse`**, 실패 시 적용 0건                                                                                                                                        | 마이그레이션 명세서 M-12 행 명시 ("zod로 임포트 파일 검증 추가")                                                                                                                                        |
| 재설계 | **포맷 메타**: `version: 1` → `version: 2`(literal) + `tabId`(출처 탭, 정보용) + `exportedAt`                                                                                                                                                            | 명세서 M-12 행 명시. tabId는 적용 대상이 아니라 출처 표시용 — 적용은 항상 **현재 활성 탭**                                                                                                              |
| 재설계 | **적용 경로**: v1 클라이언트 setState + `/api/state` PUT + 그룹별 POST 순차 + `/api/color-labels` PUT (4계열 fire-and-forget, 실패 무시) → v2 `api.tabState.importState` 1회 + (colors 있으면) `api.colors.put` 1회, 완료 후 **서버 재조회로 로컬 갱신** | 서버가 group_id를 전부 재생성하므로(`tabImportHandler`, PK 충돌 방지) 파일의 groupId로 로컬을 채우면 서버와 키가 어긋남 — refetch가 유일하게 올바른 경로. 실패 무시(catch 빈 처리)도 폐기 — 오류 표면화 |
| 재설계 | **적용 전 확인**: v1 즉시 적용 → 검증 성공 시 **미리보기(필지 N·그룹 M·색 K개 + 내보낸 시각) + 확인 단계** 후 적용                                                                                                                                       | import는 현재 탭 settings/groups **전체 교체**(파괴적) — M-15·M-11의 2단계 확인 선례                                                                                                                    |
| 재설계 | **colors 의미론**: v1 로컬 전체 교체 + PUT → v2 **upsert 병합**(`PUT /api/colors` 계약이 전체 upsert — 파일에 없는 수신자 색은 보존)                                                                                                                     | v2 colors는 **전 탭 공유** 자원 — 교체 시 수신자의 다른 탭 색 참조가 파괴됨. 파일 색을 추가/갱신만 하고, 영향("모든 탭에 적용")을 확인 문구에 고지                                                      |
| 재설계 | 검증 실패 UX: v1 `alert('JSON 파일을 읽을 수 없습니다.')` → 시트 내 인라인 오류 메시지                                                                                                                                                                   | 네이티브 alert 금지 선례 (M-11 `window.confirm` 폐기와 동일 근거 — E2E 자동화·일관 UX)                                                                                                                  |
| 재설계 | 파일명: `보구곶리_지번_YYYY-MM-DD.json` → `보구곶리_{탭이름}_{YYYY-MM-DD}.json` (파일명 불가 문자 `\ / : * ? " < > \|`는 `_` 치환)                                                                                                                       | v2는 멀티탭 — 어느 탭의 상태인지 파일명으로 구분 필요                                                                                                                                                   |
| 폐기   | v1 파일(version 1) 수용 + `colorLabels`(라벨만 있는 레거시 맵) 폴백 분기                                                                                                                                                                                 | v1→v2 데이터 이관은 마이그레이션 스크립트(명세서 §8.1) 소관. v1 색 id 체계(`c_*` vs `colorId`+`sortOrder`)·overrides 필드 모양이 달라 변환 계층이 필요한데, 일회성 이관을 상시 코드로 지니지 않는다     |
| 폐기   | `lastSyncedAt`("마지막 동기화") 통계                                                                                                                                                                                                                     | 실체는 내보내기/불러오기 버튼을 누른 시각일 뿐 — 동기화 상태의 진실은 M-6 Realtime 연결 상태 머신                                                                                                       |
| 폐기   | 인라인 스타일·lucide 수동 createIcons → `Sheet`·`Button`·`ConfirmInline` + 토큰 재조립                                                                                                                                                                   | Phase 1 공통 UI                                                                                                                                                                                         |

## 파일 포맷 (version 2 확정)

```jsonc
{
  "version": 2,                  // z.literal(2) — 불일치 시 거부
  "tabId": "tab_xxx",            // 출처 탭 (정보용 메타 — 적용 대상 아님)
  "exportedAt": "2026-06-12T…Z", // ISO 8601
  "overrides": { "<parcelId>": ParcelOverride, … }, // parcelOverrideSchema 재사용
  "groups": { "<groupId>": Group, … },              // groupSchema 재사용 (키는 서버에서 재생성됨)
  "colors": [ ColorLabel, … ]                       // colorLabelSchema 재사용 — 수신 측에 upsert 병합
}
```

스키마 위치: `src/features/share/shareFile.ts` — **클라이언트 전용 포맷**이므로 `src/types/api/`가 아닌 features 소관 (서버는 파일을 모르고 `importTabRequestSchema`의 overrides/groups만 받는다). 단, 필드 스키마는 `src/types/api/tabState.ts`·`colors.ts`의 `parcelOverrideSchema`·`groupSchema`·`colorLabelSchema`를 import해 재사용한다 (의존 방향 features → types 적합, 계약과 포맷의 단일 진실 유지).

## 사용자 스토리

1. 공동 작업자는 현재 탭의 색칠·이름·메모·그룹·팔레트 상태를 JSON 파일 하나로 내보내 카카오톡·이메일로 공유하고, 받은 사람이 불러오면 자기 탭이 같은 상태가 된다.
2. 잘못된 파일이나 옛 버전(v1) 파일을 선택한 사용자는 아무것도 망가지지 않은 채 무엇이 문제인지 메시지로 확인한다.
3. 불러오기 전에 파일에 담긴 규모(필지·그룹·색 수)와 내보낸 시각을 확인하고, 현재 탭이 교체된다는 사실에 동의한 뒤에만 적용한다.

## 동작 명세

### 진입·시트 (`src/features/share/ShareSheet.tsx`)

- 진입: 지도 우상단 임시 IconButton(Share2 아이콘) → `ui.shareOpen = true` (M-11 팔레트 선례, 드로어 도입 시 이전).
- 시트 구성: 헤더("공유 — JSON 파일로 동기화") · 통계(설정된 필지 N · 그룹 M) · [JSON 내보내기] 주 버튼 · [JSON 불러오기] 보조 버튼 + 숨김 file input · 닫기.

### 내보내기 (`src/features/share/shareFile.ts` — `buildShareFile`)

1. `workspace`에서 `activeTabId`·`overrides`·`groups`·`colorLabels`를 읽어 위 포맷의 객체 생성 (`exportedAt = new Date().toISOString()`).
2. `JSON.stringify(payload, null, 2)` → Blob(`application/json`) → 임시 anchor 다운로드. 파일명 `보구곶리_{탭이름}_{YYYY-MM-DD}.json`, 탭 이름의 파일명 불가 문자(`\ / : * ? " < > |`)는 `_` 치환. `URL.revokeObjectURL`로 정리.

### 불러오기 (검증 → 미리보기/확인 → 적용)

1. **선택·검증**: 파일 텍스트를 `JSON.parse` 후 `shareFileSchema.safeParse`. JSON 파싱 실패 또는 스키마 불일치 시 — 시트 내 인라인 오류 표시, 어떤 API도 호출하지 않음. `version`이 2가 아니면 전용 메시지: "지원하지 않는 파일 버전입니다. v2 앱에서 내보낸 파일만 불러올 수 있습니다."
2. **미리보기·확인**: 검증 성공 시 시트 내에 요약 표시 — "필지 N개 · 그룹 M개 · 색 K개 / {exportedAt 로컬 표기}에 내보냄" + 경고 문구 "불러오면 **현재 탭**의 필지 설정과 그룹이 모두 교체되고, 팔레트 색 K개는 **모든 탭**에 반영됩니다." + [적용] / [취소]. 취소 시 선택 폐기.
3. **적용** (순차, 실패 시 해당 단계 오류 인라인 표시):
   1. `api.tabState.importState(activeTabId, { overrides, groups })` — 서버가 현재 탭 settings/groups 전체 교체 + group_id 재생성 (Phase 3 기구현).
   2. 파일 `colors`가 1개 이상이면 `api.colors.put({ colors })` — upsert 병합.
   3. **서버 재조회로 로컬 갱신**: `api.tabState.get(activeTabId)` + `api.colors.list()` 결과로 `workspace`의 `overrides`·`groups`·`colorLabels`를 set. (파일의 groupId를 로컬에 직접 쓰지 않는다 — 서버가 키를 재생성했으므로.)
4. 적용 완료 후 성공 표시 + 미리보기 상태 해제. 타 클라이언트 전파는 기존 Realtime 채널(M-6) — 본 건 코드 무변경.

## 수용 기준 (AC)

단위 테스트 (Vitest, `tests/unit/features/share/`):

AC-1. Given 포맷 명세를 따르는 version 2 객체(overrides 2건 — null 필드 포함, groups 1건, colors 2건), When `shareFileSchema.safeParse`하면, Then 성공하고 모든 필드 값이 입력과 동일하다.

AC-2. Given ① v1 실포맷 파일(`{ version: 1, colors: [{id,label}], parcels: {}, groups: {} }`) ② `version` 누락 ③ `overrides`가 배열인 객체 ④ colors의 hex가 `#fff`(3자리)인 객체, When 각각 `safeParse`하면, Then 4건 모두 실패한다.

AC-3. Given activeTabId·overrides·groups·colorLabels가 채워진 workspace 상태, When `buildShareFile`을 호출하면, Then 결과가 `version === 2`·`tabId === activeTabId`·ISO 8601 `exportedAt`을 갖고 내용이 스토어와 일치하며, 그 결과 자신이 `shareFileSchema.parse`를 통과한다 (왕복 무결성).

컴포넌트 테스트 (RTL, `tests/unit/` — api·URL.createObjectURL 모킹):

AC-4. Given 필지 3개·그룹 1개가 설정된 탭(이름 "1차: 매수/검토")으로 공유 시트를 렌더하면, Then 통계에 필지 3·그룹 1이 표시되고, When "JSON 내보내기"를 탭하면, Then 다운로드 anchor의 파일명이 `보구곶리_1차_ 매수_검토_YYYY-MM-DD.json` 패턴(불가 문자 `_` 치환 + 오늘 날짜)이고 Blob 내용이 `shareFileSchema` parse를 통과한다.

AC-5. Given 공유 시트, When ① 비JSON 텍스트 파일 ② version 1 파일을 차례로 선택하면, Then 각각 인라인 오류(②는 버전 안내 문구)가 표시되고 `api.tabState.importState`·`api.colors.put`이 호출되지 않으며, 같은 파일을 다시 선택해도 onChange가 재발화한다 (input value 초기화).

AC-6. Given 유효한 version 2 파일(필지 2·그룹 1·색 2) 선택, Then 미리보기에 "필지 2개"·"그룹 1개"·"색 2개"와 교체 경고가 표시되고 아직 API가 호출되지 않는다. When [적용]을 탭하면, Then `importState(activeTabId, {overrides, groups})` → `colors.put` → `tabState.get`·`colors.list` 재조회 순으로 호출되고 스토어가 **재조회 응답**(파일이 아닌)으로 갱신된다. When 대신 [취소]를 탭하면, Then API 호출 없이 미리보기가 닫힌다.

E2E (Playwright + mockApi, `tests/e2e/share-json.spec.ts`):

AC-7. Given 필지 1개를 색칠하고 그룹 1개를 만든 앱, When 공유 시트에서 내보내기를 실행해 다운로드 파일을 캡처하고 → 탭 상태를 비운(또는 다르게 바꾼) 뒤 → 같은 파일을 불러오기로 선택하고 [적용]하면, Then 지도 메인 캔버스에 원래 색의 합성 채움 픽셀이 복원되고(realtime-sync.spec 픽셀 카운트 패턴) 해당 필지 시트를 열면 색·이름이 내보내기 시점과 동일하다.

## 비범위

- 서버 `PUT /api/tabs/:tabId/import` 핸들러·group_id 재생성·zod 요청 검증 — **Phase 3 완료분** (`tests/integration/contracts.test.ts`에서 기검증, 본 건 백엔드 코드 무변경·통합 AC 중복 작성 안 함)
- v1 파일(version 1) 호환 변환 — 거부 판정. v1 데이터 이관은 마이그레이션 스크립트(명세서 §8.1) 소관
- 탭 간 복사/이동 UI (M-16 탭 작업공간 소관)
- URL 공유·클립보드 공유·QR 등 v1에 없는 공유 채널
- 계산 레시피(calc recipes)·지목 필터 등 탭 설정 외 상태의 포맷 포함 — v1 포맷에도 없음, 필요 시 version 3
- 부분 병합 불러오기(선택 적용) — v1과 동일하게 전체 교체만
- NavDrawer 정식 진입점 (드로어 도입 시 임시 버튼 이전)

## 영향 범위

- 프론트: `src/features/share/` 신규 — `ShareSheet.tsx`, `shareFile.ts`(포맷 zod 스키마 + `buildShareFile` + 파일명 생성). `src/stores/ui.ts` — `shareOpen` + 열기/닫기 액션. `src/stores/workspace.ts` — `importFromFile`(적용 3단계: importState → colors.put → 재조회 set) 액션 추가. `src/App.tsx` — 임시 진입 IconButton·시트 마운트.
- 백엔드: **없음** — `tabImportHandler`·`colors` PUT 모두 Phase 3 완료.
- DB: 마이그레이션 불필요.
- API 계약: 신규 없음 — `importTabRequestSchema`·`putColorsRequestSchema`·`api.tabState.importState`·`api.colors.put` 기존 그대로. 파일 포맷 스키마는 클라 전용으로 `src/features/share/shareFile.ts`에 둔다 (사유: 포맷 §참조).
- 테스트 인프라: e2e mockApi에 `PUT /api/tabs/:tabId/import` 응답 + import 반영된 state 재조회 응답 추가.
- 디자인: **ui-designer 필요** — `design/bogugot.pen`에 공유 시트 프레임(기본·미리보기/확인·오류 3상태) 추가 (Stage 2). 공통 UI는 `Sheet`·`Button`·`IconButton`·`ConfirmInline` 재조립 — 신규 UI 컴포넌트 없음 예상.
