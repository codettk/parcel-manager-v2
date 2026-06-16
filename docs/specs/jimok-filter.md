# 지목 필터 (jimok-filter)

- 상태: 검토 대기
- 매핑: M-14 (v1 `components/JimokFilter.jsx` 69줄 + `app.jsx` `filteredData` useMemo → v2 `features/map/JimokFilter.tsx` + ui 스토어 `jimokFilter` 상태 + MapCanvas 가시성 주입)
- 판정: **재설계** (필터 분류 알고리즘 = 지번 끝글자 휴리스틱은 v1 보존, UI는 `Chip` 공통화로 재설계, 상태는 ui 스토어로 이전)

## 판정 상세 (선별적 포팅)

| 구분   | 항목                                                                                                                                               | 근거                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 보존   | **분류 알고리즘**: 지목은 필지 `jibun`의 **끝글자**로 판정한다. `MAIN_JIMOK=['답','전','대','도','임']`에 끝글자가 들어가면 그 지목, 아니면 '기타' | v1 `app.jsx:679-683`의 검증된 동작. 이 휴리스틱은 `lndcgr_code_nm`(현 v2 전 필지 null)에 **의존하지 않아** 시드 전에도 동작한다 — M-14 핵심 제약 ①의 정답       |
| 보존   | 6분류 고정 코드표: `답·전·대·도·임·기타`. 후보는 동적 distinct가 아닌 **고정 6종**                                                                 | v1 `ALL_ITEMS=['답','전','대','도','임','기타']`. 지목 후보를 데이터에서 동적 생성하지 않는다 (v1 동일)                                                         |
| 보존   | 라벨 표기: `답(논)·전(밭)·대지·도로·임야·기타` (`JIMOK_LABELS` 보존)                                                                               | v1 `constants.js:30`                                                                                                                                            |
| 보존   | 다중 선택 의미론: 비어 있으면(0개) **지도에 아무 필지도 안 보임**, 6개 전체면 전부 보임, 부분 선택이면 해당 분류만 표시                            | v1 `filteredData`: `length===6`→전체, `length===0`→`[]`, else 필터                                                                                              |
| 보존   | 필터 변경 시 현재 선택(필지·그룹) 해제                                                                                                             | v1 `app.jsx:687` `useEffect(()=>{ setSelected(null); setSelectedGroupId(null); }, [jimokFilter])`                                                               |
| 보존   | 적용 대상 = **지도 렌더 + 히트테스트** (목록 뷰 아님). 필터로 가려진 필지는 그려지지도, 탭되지도 않는다                                            | v1은 `filteredData`를 `MapView`에만 전달하고 `view==='list'`일 때 필터 바를 숨김(`app.jsx:724`) — 목록은 항상 전체                                              |
| 재설계 | UI: v1 드롭다운 + 체크박스(`check-square`/`square` lucide) → **`Chip` 토글 바**(M-9 색상 필터와 공용 컴포넌트)                                     | 명세서 §4.3 "Chip은 지목 필터·색상 필터 공용". 신규 공통 컴포넌트 금지                                                                                          |
| 재설계 | 상태 소유: v1 `App` useState `jimokFilter` → **ui 스토어** `jimokFilter`/`setJimokFilter`/`toggleJimok`                                            | v2 상태 단일화 (CONVENTIONS — 지도 선택·모드는 ui 스토어). draft가 아닌 즉시 전역 (필터는 영속 불요 — 세션 한정)                                                |
| 재설계 | 가시성 주입: v1은 필터된 배열을 통째로 `MapView`에 전달 → v2는 MapCanvas가 `parcels.json`을 자체 로드하므로 **`hiddenJimoks`(Set) prop**로 주입    | v2 MapCanvas 구조(`scene.parcels` 자체 구성) 보존 + 정적 데이터 재로드 금지. 필터는 렌더 직전 가시 집합 산출에만 영향                                           |
| 폐기   | `window.lucide.createIcons()` 부수효과·`open` 드롭다운 상태                                                                                        | 칩 바는 항상 펼쳐진 형태 — 드롭다운 토글 불필요 (v2 진입점이 지도 위 바)                                                                                        |
| 폐기   | `lndcgr_code_nm` 기반 필터 (매핑표 §7.2 행이 암시) — **채택 안 함**                                                                                | v1 실제 코드는 `lndcgr_code_nm`을 필터에 쓰지 않는다. 현 v2 전 필지 null이라 V-World 시드 전엔 무용. 지번 끝글자 휴리스틱이 v1의 실제·검증된 동작 (제약 ① 결론) |

> **제약 ① 데이터 의존 결론**: 본 기능은 `lndcgr_code_nm`(시드/조회로만 채워짐)에 **의존하지 않는다**. 분류는 모든 필지가 항상 갖는 `jibun`으로 판정하므로 V-World 시드 전에도 6개 칩이 모두 동작한다. 따라서 "지목 후보 0개" 빈 상태는 발생하지 않으며, 빈 상태 AC는 "필터를 모두 해제하면 지도가 빈다"(가시 필지 0)로 정의한다. **지목 데이터(`lndcgr_code_nm`) 적재 자체는 비범위.**

## 사용자 스토리

1. 공동체 사용자는 지도 위 지목 칩 바에서 '답·전·대·도·임·기타' 중 일부만 켜서, 관심 지목 필지만 지도에 남기고 나머지를 숨겨 색칠·확인 작업에 집중한다.
2. 사용자는 '전체' 칩으로 6종을 한 번에 켜고 끄며, 현재 켜진 분류 외 필지는 탭해도 반응하지 않아 오선택을 막는다.

## 수용 기준 (AC)

### 순수 함수 — 분류·필터 로직 (Vitest, `tests/unit/jimokFilter.test.ts`)

AC-1. Given `classifyJimok(jibun)` 순수 함수, When 끝글자가 '답'/'전'/'대'/'도'/'임'인 지번(예: `"보구곶리 123답"`)을 넣으면 Then 각각 `'답'/'전'/'대'/'도'/'임'`을 반환하고, When 끝글자가 그 5종이 아닌 지번(예: `"보구곶리 7-2공"`, `"보구곶리 100"`)을 넣으면 Then `'기타'`를 반환한다.

AC-2. Given 필지 3건 `["1답","2전","9공"]`, When 선택 지목 `['답','전','대','도','임','기타']`(6종 전체)로 가시 집합을 산출하면 Then 3건 모두 가시이고, When `[]`(0종)이면 Then 가시 0건이며, When `['답']`이면 Then `"1답"` 1건만 가시다.

AC-3. Given 선택 지목 `['답','전']`과 끝글자 미상 지번 `"5번지"`, When 가시 집합을 산출하면 Then `'기타'` 미선택이므로 `"5번지"`는 비가시다 (끝글자 분류가 5종 외이면 '기타' 그룹에 귀속됨을 확인).

### 컴포넌트 — Chip 토글 바·전체 토글 (RTL, `tests/unit/JimokFilter.test.tsx`)

AC-4. Given 초기 상태(6종 전체 선택)로 `JimokFilter`를 렌더하면 Then '전체' 칩 + 6개 지목 칩(`답(논)·전(밭)·대지·도로·임야·기타`)이 모두 `aria-pressed="true"`로 표시되고, '전체' 칩도 선택 상태다.

AC-5. Given AC-4 상태, When '대지' 칩을 클릭하면 Then '대지' 칩만 `aria-pressed="false"`가 되고 '전체' 칩도 `aria-pressed="false"`(부분 선택)가 되며, ui 스토어 `jimokFilter`가 `대`를 제외한 5종이 된다.

AC-6. Given 부분 선택 상태(예: `['답']`), When '전체' 칩을 클릭하면 Then 6종이 모두 선택되고, 다시 '전체' 칩을 클릭하면(이미 전체였으므로) Then 6종이 모두 해제되어 `jimokFilter`가 `[]`가 된다 (v1 isAll 토글 보존).

### 빈 상태 회귀 (RTL/단위, 제약 ① 결론 — 회귀 방지 필수 1건)

AC-7. Given ui 스토어 `jimokFilter`가 `[]`(전 지목 해제), When MapCanvas가 가시 집합을 산출하면 Then 가시 필지가 0건이고(지도가 빈 상태), 칩 바는 정상 렌더되며 7개 칩이 모두 `aria-pressed="false"`다 (오류·크래시 없음).

### E2E — 진입→필터→지도 반영 (Playwright + mockApi, `tests/e2e/jimok-filter.spec.ts`)

AC-8. Given 지도 화면, When 지목 칩 바의 '대지' 칩을 탭해 해제하면 Then 화면이 정상 유지되고 '대지' 칩이 비선택 표시로 바뀐다 (칩 토글이 지도 위에서 동작함을 확인).

AC-9. Given 모든 칩을 해제한 상태(가시 0건)에서 이전에 '답' 분류 필지가 선택되어 시트가 열려 있었다면, When 필터를 변경하면 Then 열린 시트가 닫히고 선택이 해제된다 (필터 변경 시 선택 해제 — v1 보존).

## 비범위

- 지목 데이터(`lndcgr_code_nm`) 적재 — V-World 조회(M-13)/Phase 5 시드 소관. 본 기능은 `jibun`만 사용한다.
- 공부상 지목(`lndcgr_code_nm`) 기반 정확 필터 — v1에 없고 데이터도 없음. 지번 끝글자 휴리스틱이 v1의 실제 동작이며 본 기능의 유일한 분류 기준이다.
- 목록 뷰(M-9) 지목 필터 — v1은 목록에 지목 필터를 적용하지 않는다(목록 열림 시 필터 바 숨김). 목록은 색상 필터(M-9)만 갖는다.
- 필터 상태 영속(localStorage·DB) — 세션 한정. 새로고침 시 6종 전체로 초기화 (v1 동일, areaUnit 같은 영속 대상 아님).
- NavDrawer 통합 — 도입 전이므로 지도 위 칩 바 형태로 임시 배치.

## 영향 범위

- 프론트:
  - `src/features/map/JimokFilter.tsx` 신규 — `Chip` 토글 바 컴포넌트 (전체 + 6 지목 칩). `App.tsx`에서 목록 미열림 시 지도 위 렌더 (v1 `view!=='list'` 가드 보존 — `listViewOpen`이면 미표시).
  - `src/features/map/jimok.ts` 신규 — `classifyJimok(jibun)`·`MAIN_JIMOK`·`JIMOK_LABELS`·가시 집합 산출 순수 함수 (테스트 대상).
  - `src/stores/ui.ts` — `jimokFilter: JimokKey[]`(초기 6종 전체)·`setJimokFilter`/`toggleJimok` 추가. 필터 변경 시 선택·시트 해제(v1 `useEffect` 보존). 정적 import 순환 없음.
  - `src/features/map/MapCanvas.tsx` — `hiddenJimoks`(또는 `jimokFilter`) prop 수신 → 렌더 직전 가시 필지 집합 산출 → `scene.parcels`와 `hitTest` 입력에 동일 적용 (필터 필지는 안 그려지고 안 탭됨). `parcels.json` 재로드 없음.
  - `src/App.tsx` — `<JimokFilter />` 배치(지도 위, 칩 바). 임시 진입점은 IconButton 스택이 아닌 **상단 칩 바**(v1 jimokBar 위치 보존) — 기존 IconButton 위치와 충돌 없음.
- 백엔드: 없음.
- DB: 마이그레이션 불필요 — `jibun`은 정적 `parcels.json`에 이미 존재(`displayName` 등에서 소비 중). 신규 컬럼·테이블 없음.
- API 계약: 없음 — 신규/변경 엔드포인트 없음. M-9 `GET /api/parcel-areas` 같은 일괄 조회도 불요(분류는 이미 로드된 `jibun`으로 충분).
- 디자인: **ui-designer 불요** — 기존 `src/components/ui/Chip.tsx` 재사용, 신규 공통 컴포넌트·신규 Pencil 프레임 없음. 칩 바 레이아웃은 색상 필터(M-9) 칩 배치 패턴 답습.
