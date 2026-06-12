# 필지 목록 뷰 (검색·필터·정렬·중복지번·면적 일괄 조회)

- 상태: 검토 대기
- 매핑: M-9 (`ParcelListView.jsx` 262줄 + `app.jsx:560` 청크 조회 → `src/features/list/`)
- 판정: 재설계 (목록 의미론 — 검색·필터·정렬 localeCompare·중복지번·행 탭 분기 — 은 v1 보존, **면적 데이터 경로는 프론트 supabase 직접 청크 조회 → 서버 일괄 API로 재설계**, UI는 공통 컴포넌트 재조립)

## 판정 상세 (선별적 포팅)

| 구분   | 항목                                                                                                                                                                                                                                                                                                                           | 근거                                                                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 보존   | 전체 화면 뷰 (시트 아님) — 지도 대신 목록이 화면을 차지, 뒤로가기로 지도 복귀                                                                                                                                                                                                                                                  | v1 `view === 'list'` 구조                                                                                                                                                                                                                |
| 보존   | 검색: displayName(커스텀명∥지번)·jibun·그룹명 3개 필드, trim + lowercase `includes`                                                                                                                                                                                                                                            | v1 `filtered` useMemo (이슈 #9 반영본 — 그룹명 포함이 최종 동작)                                                                                                                                                                         |
| 보존   | 색상 필터: "전체" + 동적 색상 다중 토글(OR) + "미지정"(색 없음)                                                                                                                                                                                                                                                                | v1 `colorFilter` 의미론                                                                                                                                                                                                                  |
| 보존   | 지번순 정렬 `localeCompare(b, 'ko')`                                                                                                                                                                                                                                                                                           | 명세서 M-9 "한국어 localeCompare 정렬 유지"                                                                                                                                                                                              |
| 보존   | 색상순 정렬: 팔레트 정의 순서 rank → 삭제된 색 → 미지정 맨 뒤, 동순위 2차 지번순                                                                                                                                                                                                                                               | v1 `colorRank` 전수 확인                                                                                                                                                                                                                 |
| 보존   | 중복지번 표기: 같은 jibun 2개 이상이면 **커스텀명 없는 행에 한해** `#<id 끝 4자리>` 병기                                                                                                                                                                                                                                       | v1 `duplicateJibuns` Set (이슈 #6 수정본)                                                                                                                                                                                                |
| 보존   | 행 탭 = 시트 분기 직행 (그룹 소속 → 그룹 시트, 비소속 → 필지 시트). **목록 화면은 유지**, 시트가 목록 위에 열림. **멀티선택·추가모드 분기는 타지 않는다** (v1 `onSelectParcel`은 `handleSelect` 모드 분기를 거치지 않음 — 5단계 검증 반려 B-1로 정정: tapParcel 재사용 단일화 문구는 모드 중 무음 데이터 변경을 유발하던 오류) | v1 이슈 #5 수정본 — `onSelectParcel`이 `setView(null)`을 호출하지 않음                                                                                                                                                                   |
| 보존   | 면적 단위 토글(㎡/평/a/ha)은 전역 `ui.areaUnit` 즉시 반영 (M-7과 공유, localStorage 영속)                                                                                                                                                                                                                                      | v1 `areaUnit` 전역 설정                                                                                                                                                                                                                  |
| 보존   | 목록은 지목 필터와 무관하게 항상 전 필지 대상 (자체 필터 UI를 가진 독립 뷰)                                                                                                                                                                                                                                                    | v1 이슈 #3 결정 사항                                                                                                                                                                                                                     |
| 보존   | 4,409행 전량 렌더 (가상화 없음)                                                                                                                                                                                                                                                                                                | v1에서 동작 확인됨 — 성능 회귀 시 후속 과제                                                                                                                                                                                              |
| 재설계 | **면적 데이터 경로**: 프론트 supabase 직접 + 500개 청크 조회 → 신규 `GET /api/parcel-areas` 단일 호출                                                                                                                                                                                                                          | ① 청크 분할은 PostgREST GET URL 길이 제약(v1 이슈 #7)의 우회 패치 — 서버 핸들러는 `.in()` 자체가 불필요. ② v2 컨벤션상 프론트 supabase/fetch 직접 호출 금지(typed client만). ③ 페이로드 4,409 × (id, 숫자) ≈ 수십 KB — 1회 응답으로 충분 |
| 재설계 | **면적순 정렬**: v1 픽셀 면적(`p.area`) 프록시 → 실면적 `lndpclAr` 내림차순, null 맨 뒤(2차 지번순)                                                                                                                                                                                                                            | v2 `parcels.json`에는 `area` 필드가 없고(`{id, jibun, c}`), 일괄 API로 전 필지 실면적을 이미 가지므로 프록시가 무의미. v1의 정렬 기준-표시 값 불일치(이슈 #2 부작용)도 해소                                                              |
| 재설계 | 인라인 스타일 → `Input`(검색)·`Chip`(색 필터)·`SegmentedControl`(정렬·단위)·`ListRow`·`Badge`·`EmptyState` + 토큰                                                                                                                                                                                                              | Phase 1 공통 UI 재조립                                                                                                                                                                                                                   |
| 재설계 | 진입점: v1 NavDrawer "지번 목록" → NavDrawer 미도입이므로 **임시 진입 IconButton** (릴리즈 노트 선례, 지도 우상단)                                                                                                                                                                                                             | NavDrawer 도입 시 드로어 항목으로 이동 — 주석으로 명시                                                                                                                                                                                   |
| 폐기   | TopBar totalCount 연동(v1 이슈 #3 패치) — v2에 TopBar 없음, 카운트는 목록 헤더가 단독 표시                                                                                                                                                                                                                                     | v1 구조 제약에서 나온 코드                                                                                                                                                                                                               |
| 폐기   | `view !== 'list'`일 때 DebugPanel·JimokFilter 숨김 분기                                                                                                                                                                                                                                                                        | v1 전역 view 문자열 구조의 산물 — v2는 레이어 구조로 자연 해소 (M-14·M-18 소관)                                                                                                                                                          |
| 폐기   | lucide CDN(`data-lucide`) 200ms 인터벌과 그로 인한 정렬 버튼 opacity 우회(이슈 #1 패치)                                                                                                                                                                                                                                        | 번들 import로 원인 자체 소멸 (명세서 §7.3-3)                                                                                                                                                                                             |

## 사용자 스토리

1. 공동체 사용자는 전체 4,409 필지를 목록으로 펼쳐 지번·이름·그룹명으로 검색하고 색상으로 거른 뒤, 지번·색상·면적순으로 정렬해 원하는 필지를 빠르게 찾는다.
2. 사용자는 목록에서 각 필지의 색·실면적(원하는 단위)·그룹 소속을 한눈에 비교하고, 행을 탭해 해당 필지(또는 그룹) 시트를 바로 연다.
3. 같은 지번이 여러 필지로 존재할 때 사용자는 식별자 병기로 행을 구분한다.

## 동작 명세

### 진입·이탈

- 지도 우상단 임시 IconButton(목록 아이콘) 탭 → 목록 뷰가 전체 화면으로 열림 (지도 캔버스 위 레이어). 열림 상태는 `ui` 스토어 (`listViewOpen`).
- 헤더의 "지도로 돌아가기" 버튼 탭 → 목록 닫고 지도 복귀.
- 진입 시 검색어·필터·정렬은 초기 상태(검색 빈 값, 필터 전체, 지번순)로 시작 — 영속하지 않음 (v1 동일, 컴포넌트 로컬 state).

### 면적 데이터 (신규 API)

- 목록 최초 진입 시 `api.parcels.listAreas()` 1회 호출 → `Record<localId, lndpclAr | null>` 수신, 기능 내 메모리 캐시 (재진입 시 재호출 없음).
- **계약**: `GET /api/parcel-areas` — 응답은 전 필지(4,409행)의 `{ [localId]: number | null }`. zod: `src/types/api/parcels.ts`에 `parcelAreasResponseSchema = z.record(z.string(), z.number().nullable())` 추가.
- **핸들러 제약**: supabase-js 기본 1,000행 응답 제한이 있으므로 핸들러가 `.range()` 페이징으로 전량을 모아 반환한다 (클라이언트는 청크를 모른다 — v1 청크 로직의 서버 이전이자 단순화).
- 로딩 중 면적 컬럼은 `-` 표시 (스피너 없음), 수신 후 갱신. 조회 실패 시에도 목록 자체는 동작 (면적만 `-`).

### 화면 구성 (위→아래, v1 전수)

1. **헤더**: "지도로 돌아가기" 버튼 + 카운트 `"{필터 후 행 수} / {전체 필지 수} 필지"`.
2. **검색창**: `Input`, placeholder "지번·그룹명 검색…", 입력 중 clear(X) 버튼.
3. **색상 필터 칩 행**: `Chip` — "전체"(탭 시 필터 비움) + `workspace.colorLabels` 동적 색상(색 dot + 라벨, 다중 토글) + "미지정". 활성 칩 재탭 = 해제.
4. **정렬·단위 행**: 정렬 `SegmentedControl`(지번순/색상순/면적순) + 단위 `SegmentedControl`(㎡/평/a/ha → `ui.setAreaUnit` 즉시 전역 반영).
5. **컬럼 헤더**: 지번 / 색상 / 면적 / 그룹.
6. **행 목록**: 필터·정렬 적용 행 전량 렌더. 결과 0건이면 `EmptyState`("검색 결과 없음").

### 행 데이터 도출 (v1 `allRows` 보존)

- `displayName` = `overrides[id].name`(있으면) ∥ `jibun`. 커스텀명이 있으면 이름을 주 표기 + 지번 보조 병기.
- 색: 그룹 소속이면 **그룹 색**, 아니면 개별 override 색 (`parcelToGroup` 셀렉터 활용). 색 뱃지 = dot + colorLabel 명칭, 없으면 `-`.
- 면적: `formatArea(areas[id], ui.areaUnit)`, null이면 `-`.
- 그룹명: 소속 그룹 이름, 없으면 `-`.
- 중복지번: jibun 출현 횟수 2 이상 Set 사전 계산 → 커스텀명 없는 해당 행에 `#<localId 끝 4자리>` 병기.

### 검색·필터·정렬 (순수 함수 — `src/features/list/listQuery.ts`)

- 검색: `q = 입력.trim().toLowerCase()`, `displayName`·`jibun`·`groupName`(null 안전) 중 하나라도 `includes(q)`.
- 색 필터: 빈 배열 = 전체. 선택 색 OR 매칭, `'none'`은 색 없는 행 매칭.
- 정렬:
  - 지번순: `jibun.localeCompare(jibun, 'ko')`
  - 색상순: rank = 팔레트 정의 순서 → 팔레트에 없는(삭제된) 색 → 미지정 맨 뒤. 동순위는 지번순.
  - 면적순: `lndpclAr` 내림차순, null은 맨 뒤(동순위·null끼리는 지번순) — **재설계 항목**.
- 적용 순서: 검색 → 필터 → 정렬 (v1 동일).

### 행 탭

- 시트 분기 직행 — 그룹 소속이면 그룹 시트, 비소속이면 필지 시트가 열린다 (v1 `onSelectParcel` 동형 — **멀티선택·추가모드 분기 비경유**. 목록 진입 시 활성 모드는 해제한다: 모드 오버레이가 목록 아래 가려지는 상태 차단).
- **목록 뷰는 닫히지 않는다** — 시트가 목록 위에 열리고, 시트를 닫으면 목록이 그대로 남는다 (v1 동작 보존).

## 수용 기준 (AC)

단위 테스트 (Vitest, `tests/unit/` — `listQuery.ts` 순수 함수):

AC-1. Given 그룹 소속 필지·개별 override 필지·커스텀명 필지가 섞인 입력, When 행 데이터를 도출하면, Then 그룹 소속 행은 그룹 색·그룹명을, 비소속 행은 override 색을 가지며, displayName은 override.name 우선·없으면 jibun이다.

AC-2. Given 같은 jibun이 2개 이상인 행 집합, When 중복지번 Set을 계산하면, Then 해당 jibun만 포함되고, 중복 표기 대상은 커스텀명 없는 행으로 한정된다 (커스텀명 있는 행은 비대상).

AC-3. Given 행 집합과 검색어 " 논 " (공백 포함), When 검색을 적용하면, Then displayName·jibun·groupName 중 하나가 "논"을 포함하는 행만 남는다 (대소문자 무시, groupName null 행에서 예외 없음).

AC-4. Given 색 필터 `['c1','none']`, When 필터를 적용하면, Then c1 색 행과 색 없는 행만 남고, Given 빈 배열이면, Then 전 행이 남는다.

AC-5. When 3개 정렬을 각각 적용하면, Then ① 지번순은 `localeCompare('ko')` 순서, ② 색상순은 팔레트 순서 → 삭제된 색 → 미지정 순(동순위 지번순), ③ 면적순은 lndpclAr 내림차순에 null이 맨 뒤다.

핸들러 테스트 (`server/handlers/parcels.ts`):

AC-6. Given parcels 테이블에 1,000행을 초과하는 데이터, When `GET /api/parcel-areas`를 호출하면, Then 응답이 전 행의 `{ localId: lndpclAr | null }` 레코드이고 `parcelAreasResponseSchema` 파싱을 통과한다 (1,000행 절단 없음). GET 외 메서드는 405.

컴포넌트 테스트 (RTL, `tests/unit/`):

AC-7. Given 면적 데이터가 로드된 목록을 렌더하면, Then 카운트 "N / 전체 필지", 각 행의 지번·색 뱃지·`formatArea` 환산 면적·그룹명이 표시되고, 면적이 null인 행과 색 없는 행은 `-`로 표시된다. When 단위를 "평"으로 토글하면, Then 면적 표기가 즉시 평 단위로 바뀐다.

AC-8. Given 렌더된 목록, When 검색어를 입력해 결과가 0건이 되면, Then "검색 결과 없음" 빈 상태가 표시되고, When clear 버튼을 누르면, Then 전 행이 복귀한다.

AC-9. Given 그룹 소속 행과 비소속 행, When 각각 탭하면, Then `ui` 스토어가 각각 그룹 시트(selectedGroupId)·필지 시트(selectedParcelId) 열림 상태가 되고 목록 열림 상태(`listViewOpen`)는 유지된다.

E2E (Playwright + mockApi, `tests/e2e/parcel-list.spec.ts`):

AC-10. Given 지도 화면, When 목록 진입 버튼을 탭하면, Then 목록 뷰가 열리고 카운트에 전체 필지 수가 표시되며, 면적 컬럼에 `-`가 아닌 환산 값이 나타난다 (일괄 API 경유).

AC-11. Given 열린 목록, When 특정 지번을 검색하고 결과 행을 탭하면, Then 해당 지번의 필지 시트가 목록 위에 열리고, 시트를 닫으면 검색 상태의 목록이 그대로 남아 있으며, "지도로 돌아가기"로 지도에 복귀한다.

## 비범위

- 자동 계산기 연동 (M-10)
- 지목 필터 — **v1 목록 뷰에 지목 필터 없음 확인** (`view==='list'`일 때 JimokFilter 숨김). 목록은 항상 전 필지 대상 (M-14와 무관)
- 색상 팔레트 편집 — 본 건은 `colorLabels` 읽기만 (M-11)
- CSV/JSON 내보내기 등 v1에 없는 기능
- 행 가상화 (전량 렌더 보존 — 성능 회귀 측정 시 후속)
- NavDrawer 정식 진입점 (드로어 도입 시 임시 버튼 이전)
- 목록에서의 멀티선택·그룹 편집 (지도 전용, M-8)

## 영향 범위

- 프론트: `src/features/list/` 신규 — `ParcelListView.tsx`, `listQuery.ts`(행 도출·검색·필터·정렬 순수 함수), `useParcelAreas.ts`(일괄 조회 + 메모리 캐시). `src/App.tsx` 임시 진입 버튼 + 목록 마운트. `src/stores/ui.ts` — `listViewOpen` + 열림/닫힘 액션 추가 (`tapParcel`·`areaUnit`은 기존 사용).
- 백엔드: `server/handlers/parcels.ts`에 `parcelAreasHandler` 추가 (`.range()` 페이징으로 전량 수집), `server/adapters/express.ts` 라우트 + `api/parcel-areas.ts` vercel 재export 신규.
- DB: 마이그레이션 불필요 (`parcels.lndpcl_ar` 기존 컬럼 읽기 전용).
- API 계약: **신규** `GET /api/parcel-areas` — `src/types/api/parcels.ts`에 `parcelAreasResponseSchema`(`z.record(z.string(), z.number().nullable())`) 추가, `src/lib/api.ts`에 `api.parcels.listAreas()` 추가.
- 테스트 인프라: `tests/e2e` mockApi에 `/api/parcel-areas` 응답 추가.
- 디자인: **ui-designer 필요** — `design/bogugot.pen`에 목록 전체 화면 프레임 추가 (Stage 2). 신규 공통 UI 컴포넌트 없음 — 기존 `Input`·`Chip`·`SegmentedControl`·`ListRow`·`Badge`·`EmptyState`·`IconButton` 재조립.
