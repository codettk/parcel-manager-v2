# 필지 시트 (색·이름·메모·고정·아이콘 편집)

- 상태: 검토 대기
- 매핑: M-7 (`ParcelSheet.jsx` 272줄 → `src/features/parcel/ParcelSheet.tsx`)
- 판정: 재설계 (정보 구조·draft 의미론·저장 정규화는 v1 보존, UI는 공통 컴포넌트 18종으로 재조립 — 인라인 스타일·수동 isWide 분기·시트 자체 닫힘 가드 중복 구현 폐기)

## 판정 상세 (선별적 포팅)

| 구분   | 항목                                                                                                                                             | 근거                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 보존   | 시트 정보 구조 (헤더→면적→메모→표시방식→색상→고정/아이콘→저장 버튼 순서)                                                                         | v1에서 검증된 사용 흐름                                                |
| 보존   | draft 패턴: 전 편집 필드 로컬 useState, **저장 버튼에서만** 커밋 (필드별 즉시 반영 없음)                                                         | v1 `handleSave` 전수 확인 — 명세서 M-7 "draft 패턴 유지"               |
| 보존   | 저장 시 정규화: name/memo trim, color 없으면 style=null, pinned 아니면 icon 제거                                                                 | v1 `handleSave` 동작                                                   |
| 보존   | 다른 필지 탭 시 시트 유지 + draft를 새 필지 override로 리셋 (미저장분 무확인 폐기)                                                               | v1 `useEffect([parcel.id])` 동작                                       |
| 보존   | 아이콘 사전 `PIN_ICON_CATEGORIES` (5범주 × 8개, v1 `constants.js` 고정 목록) + 같은 아이콘 재탭 시 해제                                          | 출처 확인 결과 v1 고정 상수 — 그대로 이식                              |
| 보존   | 면적 단위 토글은 draft가 아닌 **즉시 전역 반영** (localStorage 유지)                                                                             | v1 `areaUnit` — 시트 닫아도 유지되는 전역 설정                         |
| 재설계 | 시트 컨테이너: `isWide` prop 수동 분기 → 공통 `Sheet` (BottomSheet/SidePanel 자동)                                                               | v1 구조 제약에서 나온 코드                                             |
| 재설계 | v1 시트 자체 500ms 닫힘 가드(`openedAtRef`) → 폐기. 컨테이너 `BottomSheet`의 400ms 가드로 단일화                                                 | 시트별 중복 구현 제거 — 가드는 컨테이너 책임                           |
| 재설계 | 인라인 스타일 → `SegmentedControl`(표시방식·단위), `Switch`(고정), `ColorSwatch`, `Input`, `Textarea`, `Button`, `IconButton`, `AreaText` + 토큰 | Phase 1 공통 UI 재조립                                                 |
| 재설계 | 면적·지목 데이터: v1 `areas` 청크 상태 의존 → 시트 열림 시 `api.parcels.get(localId)` 단건 조회                                                  | M-9 청크 조회와 결합 제거                                              |
| 폐기   | "토지임야 조회" V-World 갱신 버튼 → 본 건에서 **생략** (자리도 두지 않음)                                                                        | fetch-land-info 핸들러가 501인 상태에서 죽은 버튼이 됨 — M-13에서 추가 |
| 폐기   | lucide CDN 아이콘(`data-lucide`) → 번들 import                                                                                                   | 명세서 §7.3-3                                                          |

## 사용자 스토리

1. 공동체 사용자는 지도에서 필지를 탭해 시트를 열고, 색·표시방식·이름·메모를 편집한 뒤 저장해 모두의 화면에 반영되게 한다.
2. 사용자는 중요한 필지(집·농기계·수도 등)를 고정하고 아이콘을 붙여, 초기화 시에도 보호되고 지도에서 한눈에 알아본다.
3. 사용자는 시트에서 필지의 지번·면적(원하는 단위로)·지목을 확인한다.

## 동작 명세

### 열림·닫힘

- **열림**: 지도에서 필지 탭 → `ui.tapParcel(id)` → `selectedParcelId` 설정 + `openSheet: 'parcel'`. 시트가 열리며 해당 필지의 기존 override로 draft 초기화.
- **다른 필지 탭**: 시트 열린 채 지도에서 다른 필지 탭 → 시트는 닫히지 않고 대상만 전환, draft는 새 필지 override로 리셋 (미저장 편집분은 확인 없이 폐기 — v1 동일).
- **닫힘**: 헤더 X 버튼 / backdrop 탭 / 저장 완료. X·backdrop 닫기는 draft를 폐기한다 (저장 호출 없음). 400ms 닫힘 가드는 공통 `Sheet`(BottomSheet) 책임이므로 본 기능 AC 비대상 (release-notes 명세 선례).

### 시트 내용 (위→아래, v1 전수)

1. **헤더**: 메타 라벨 "지번" + 닫기 X(`IconButton`). 이름 `Input` (placeholder = 필지 지번). 이름 입력 중이면 아래 "기본 지번: \<jibun\>" 보조 표시.
2. **면적 행**: `formatArea(lndpclAr, areaUnit)` + 단위 `SegmentedControl`(㎡/평/a/ha — `AREA_UNITS`). 단위 변경은 **즉시** 전역 반영(`ui.areaUnit`, localStorage 유지) — draft 아님. 면적 데이터는 시트 열림 시 `api.parcels.get(localId)` 단건 조회. null이거나 조회 실패면 면적 행 생략 (v1 동일).
3. **토지 정보**: 조회 응답에 지목(`lndcgrCodeNm`)·소유구분(`posesnSeCodeNm`)·공유인수(`cnrsPsnCo` > 1일 때만 "N명")가 있으면 읽기 전용 카드로 표시. V-World 갱신 버튼은 없음(M-13).
4. **메모**: `Textarea` 3줄, placeholder "이 필지에 대한 메모를 입력하세요".
5. **표시 방식**: `SegmentedControl` fill("채움")/border("테두리"). draft.color가 없으면 비활성.
6. **색상**: "없음" 스와치 + `workspace.colorLabels` 동적 목록(`ColorSwatch` + 라벨). 단일 선택, "없음" 선택 시 draft.color=null.
7. **고정 필지**: `Switch` 행("고정 켜짐/꺼짐" + 설명 "초기화 시 색상·이름·아이콘 보호"). 켜짐일 때만 아이콘 팔레트 노출 — `PIN_ICON_CATEGORIES` 5범주(집·건물/농기계/수자원/작물/기타) × 8개 이모지. 선택 토글식(같은 아이콘 재탭 = 해제). 스위치를 끄면 draft.icon 즉시 제거.
8. **저장 버튼**: `Button` full. 탭 시 정규화된 patch로 `workspace.upsertParcel(parcelId, patch)` 1회 호출 후 시트 닫힘.

### draft 패턴과 저장 경로

- 이름·메모·색·표시방식·고정·아이콘 **전부** 로컬 draft — 저장 버튼 전에는 스토어·서버·캔버스에 반영되지 않는다. (즉시 반영 예외는 면적 단위 토글뿐 — 전역 설정이며 override가 아님.)
- 저장 시 정규화(v1 `handleSave` 보존): `name`/`memo`는 trim, `color`가 null이면 `style: null`, `pinned`가 false면 `icon: null`.
- 저장은 `workspace.upsertParcel` 경유 — 기존 override와 병합한 **전체 필드** 전송, 전부 빈 값이면 행 삭제(clear), clientId 포함. 이 병합·정규화·낙관적 갱신은 스토어(M-5) 책임이므로 시트는 patch만 만든다.

## 수용 기준 (AC)

컴포넌트 테스트 (RTL, `tests/unit/`):

AC-1. Given 기존 override(색·이름·메모·pinned·icon)가 있는 필지로 시트를 렌더하면, Then 각 입력·선택 상태가 override 값으로 초기화되고, "없음" 포함 `colorLabels` 전 색상 스와치가 렌더된다.

AC-2. Given 시트에서 색·이름·메모·고정을 편집한 상태, When 저장 버튼을 누르기 전까지는, Then `upsertParcel`이 호출되지 않고, When X 버튼으로 닫으면, Then 호출 없이 시트가 닫힌다 (draft 폐기).

AC-3. Given 이름 " 집앞 논 "(공백 포함)·색상 선택·pinned 꺼짐·icon이 남은 draft, When 저장 버튼을 누르면, Then `upsertParcel`이 정확히 1회, `{ name: '집앞 논', …, icon: null }`로 호출되고 시트가 닫힌다. 또한 색상을 "없음"으로 저장하면 `style: null`이 포함된다.

AC-4. Given draft.color가 null인 상태, Then 표시 방식 SegmentedControl이 비활성이고, When 색상을 선택하면, Then 활성화되어 fill/border 전환이 가능하다.

AC-5. Given 고정 스위치 꺼짐, When 스위치를 켜면, Then 아이콘 팔레트(5범주)가 노출되고, 아이콘 탭→선택, 같은 아이콘 재탭→해제되며, When 스위치를 끄면, Then 팔레트가 사라지고 draft.icon이 제거된다.

AC-6. Given 시트가 열린 채 편집 중, When 대상 필지 id가 다른 필지로 바뀌면, Then draft가 새 필지의 override 값으로 리셋된다 (편집분 미반영).

AC-7. Given 면적이 있는 필지의 시트, When 단위 토글에서 "평"을 선택하면, Then 면적 표기가 즉시 평 단위로 바뀐다 (저장 버튼 없이).

E2E (Playwright + mockApi, `tests/e2e/parcel-sheet.spec.ts`):

AC-8. Given 지도 화면, When 필지를 탭하면, Then 필지 시트가 열리고 해당 필지 지번이 표시된다.

AC-9. Given 열린 시트, When 색상 스와치 하나를 선택하고 메모를 입력한 뒤 저장을 탭하면, Then 시트가 닫히고 지도 캔버스에서 해당 필지 중심점의 픽셀 색이 저장 전과 달라진다.

AC-10. Given AC-9 저장 직후, When 같은 필지를 다시 탭하면, Then 시트에 저장한 색 선택·메모가 유지되어 표시된다.

> 400ms 닫힘 가드는 공통 `Sheet` 컨테이너 책임 — 본 기능 AC 비대상.

## 비범위

- 그룹 시트·멀티선택·그룹 해체 (M-8)
- 필지 목록 뷰·면적 청크 조회 (M-9)
- 자동 계산기 (M-10)
- 색상 팔레트 편집 — 본 건은 `colorLabels` 읽기만 (M-11)
- V-World "토지임야 조회" 갱신 버튼 — **생략 판정** (핸들러 501 상태의 죽은 버튼 방지, M-13에서 시트에 추가)
- 초기화·pinned 보호 실행 (M-15 — 본 건은 pinned 플래그 저장까지만)
- Realtime 수신에 의한 열린 시트 draft 갱신 정책 (M-6 에코 가드 소관 — draft는 로컬 우선 유지)

## 영향 범위

- 프론트: `src/features/parcel/` 신규 — `ParcelSheet.tsx`, `pinIcons.ts`(PIN_ICON_CATEGORIES 이식), 컴포넌트 테스트. `src/App.tsx` 시트 마운트 연결.
- 스토어: `src/stores/ui.ts` — `SheetId` 유니온에 `'parcel'` 추가, `tapParcel`이 `selectedParcelId`와 `openSheet`를 원자적으로 설정/해제. `areaUnit: AreaUnitId` + `setAreaUnit`(localStorage 유지) 추가. `src/stores/workspace.ts`는 기존 `upsertParcel`·`colorLabels` 그대로 사용 (변경 없음).
- 백엔드: 없음 (`api.parcels.get`, `api.tabState.upsertParcel` 기존 계약 사용)
- DB: 마이그레이션 불필요
- API 계약: 없음 (신규/변경 스키마 없음)
- 디자인: **ui-designer 필요** — `design/bogugot.pen`에 필지 시트 프레임 추가 (Stage 2). 신규 공통 UI 컴포넌트는 없음 — 기존 18종 재조립.
