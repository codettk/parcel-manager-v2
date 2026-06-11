# Canvas 지도 렌더 엔진 (8-pass)

- 상태: 검토 대기
- 매핑: M-2
- 판정: 보존 + 재설계 (렌더 패스 순서·각 패스의 시각 결과는 v1 검증 로직으로 **동작 보존**, 코드 구조는 v1 `MapView.jsx` 726줄의 React 얽힘을 제거하고 순수 TS 패스별 함수로 **재설계**. 성능 개선 1건 내장: `computeOuterEdges` memo. `wrapText` 캐싱은 라벨 캔버스 소관이므로 **M-4로 이연** — 아래 비범위 참조)

## 사용자 스토리

1. 공동체 사용자는 4,409개 필지의 색칠·그룹 상태를 한눈에 보기 위해, 지도 화면에서 v1과 동일한 시각 결과(채움·테두리·선택 강조)를 본다.
2. 개발자(후속 M-3~M-7 담당)는 제스처·스토어·시트를 붙이기 위해, React 없이 호출 가능한 엔진 API(씬 입력 → 캔버스 출력)를 사용한다.

## 동작 명세 (v1 실코드 `components/MapView.jsx` 기준)

### 그리기 패스 8개 (메인 캔버스, 순서 고정 — 동작 보존)

매 렌더마다 `clearRect` 후 배경 `#FBFAF6` 전체 채움, `lineJoin/lineCap = 'round'`. 이후:

| 패스      | 대상                                                            | 채움                                                                                                       | 선                                                   |
| --------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **1차**   | 그룹 미소속 + 색 없는 필지                                      | `#FFFFFF`                                                                                                  | `#C9C4B6` 0.6px                                      |
| **1.5차** | 색 없는 그룹 (compound fill + 외곽 변만)                        | `#FFFFFF`                                                                                                  | `rgba(90,110,190,0.55)` 1.8px, dash `[6,4]`          |
| **2차**   | 그룹 미소속 + 개별 색 필지                                      | style=fill: `hexA(hex, FILL_OPACITY)` / style=border: `#FFFFFF`                                            | hex — fill: 1.4px / border: 2.6px                    |
| **3차**   | 색 있는 그룹 (compound fill + 외곽 변만)                        | style=fill: `hexA(hex, FILL_OPACITY)` / style=border: `#FFFFFF`                                            | hex — fill: 1.4px / border: 2.6px                    |
| **4차**   | 단일 선택 필지 (그룹 소속이면 그룹 색/스타일 참조)              | 유색+fill: `hexA(hex, min(FILL_OPACITY+0.2, 0.9))` / 무색: `rgba(47,125,79,0.18)` / 유색+border: 채움 없음 | `#1F5A38` 3px                                        |
| **5차**   | 선택 그룹 (compound fill + 외곽 변만)                           | 4차와 동일 규칙                                                                                            | `#1F5A38` 3px                                        |
| **6차**   | 멀티선택 모드 — 6-1: 그룹 소속(미선택) 탭 힌트 / 6-2: 선택 필지 | 6-1: 없음 / 6-2: `rgba(47,125,79,0.25)`                                                                    | 6-1: `rgba(59,130,246,0.6)` 2px / 6-2: `#2F7D4F` 3px |
| **7차**   | 필지 추가 모드 중인 그룹 멤버                                   | `rgba(47,125,79,0.30)`                                                                                     | `#1F5A38` 3px, dash `[6,4]`                          |

- 패스 제외 규칙(보존): 1차는 그룹 멤버·개별 색 필지를 건너뛰고, 2차는 그룹 소속을 건너뛴다 (각 필지는 자기 패스에서 한 번만 기본 렌더).
- `FILL_OPACITY = 0.55` 상수 — v1 tweaks 패널의 fillOpacity 기본값을 상수화 (명세서 §7.3-4, tweaks-panel 폐기).
- 위 고정 hex/rgba는 전부 `src/features/map/engine/colors.ts`(lint hex 예외 모듈)에 상수로 집약. 팔레트 hex(필지/그룹 색)는 씬 입력 `colorById` 맵으로 주입받는다 (color_labels = M-11 소관, 토큰 아님).
- 캔버스 배경은 v1 보존값 `#FBFAF6` — 스파이크의 `#ffffff`에서 변경 (의도된 v1 복원, 회귀 아님).

### computeOuterEdges + memo (성능 개선 ①)

- 그룹 멤버 폴리곤들의 변을 `toFixed(6)` 키로 카운트, 등장 1회인 변만 외곽 변으로 반환 (v1 알고리즘 보존).
- **재설계**: v1은 매 렌더(팬/줌 포함)마다 전 그룹 재계산. v2 엔진은 그룹별 캐시를 두고 해당 그룹의 멤버 구성(parcelIds)이 변하지 않으면 재계산하지 않는다. 팬/줌은 transform만 바뀌므로 캐시 히트.

### 좌표계 (보존)

- 입력 폴리곤은 `makeProjector(bbox)`(M-1, `src/utils/geo.ts`)로 투영된 0..1 정규화 좌표.
- 화면 변환: `px = tx + x·(aspect·scale)`, `py = ty + y·scale` — viewport는 `{ scale, tx, ty }`.
- 초기 fit: 컨테이너에 aspect 유지로 내접 × 0.94 배율, 중앙 정렬 (v1·스파이크 동일).
- DPR: `min(devicePixelRatio, 2)`. 백버퍼 = CSS 크기 × dpr, 컨텍스트에 dpr 스케일 적용 후 CSS px 단위로 그린다.
- 필지 배열은 면적 내림차순 정렬(작은 필지가 위에 그려짐) — 정렬은 호스트의 데이터 준비 책임 (스파이크 로직 유지).

### 엔진 API 설계 방향

- 위치: `src/features/map/engine/` — **React import 금지** (ESLint 강제). 형태(구현 재량):
  - `scene.ts` — 씬 타입: `{ parcels, overrides: Record<string, ParcelOverride>, groups: Record<string, Group>, parcelToGroup, colorById: Record<string, string>, viewport, selection }`. selection = `{ selectedParcelId, selectedGroupId, multiSelectMode, multiSelectedIds, addToGroupModeGroupId }`. ParcelOverride/Group 타입은 `src/types/api/tabState.ts` 재사용 (`parcelIds` 필드명 기준).
  - `renderScene(ctx, scene, size)` — 8패스 순수 함수 (패스별 함수 분리).
  - `outerEdges.ts` — `computeOuterEdges` + 그룹 키 기반 memo.
  - 뷰포트 유틸 — 초기 fit 계산, 화면↔데이터 좌표 변환(`screenToData`). M-3 제스처·M-7 히트테스트가 사용할 경계 인터페이스로 노출만 한다.
- React 호스트: `MapCanvas.tsx`를 얇은 호스트로 재작성 — parcels.json fetch·캔버스/DPR/ResizeObserver 관리·엔진 호출만. 씬 데이터(overrides/groups/selection)는 props로 받되, M-5 스토어 미도입 상태이므로 App은 빈 오버라이드/빈 그룹/무선택으로 구동한다 (스파이크 동등 화면 + 오버라이드 주입 가능 구조).
- 라벨 캔버스(M-4) 경계: 호스트는 메인 캔버스 1장만 생성하되, 엔진 씬 타입과 뷰포트 변환을 `labels.ts`(M-4)가 그대로 입력으로 쓸 수 있게 export 한다. 라벨 렌더 호출부는 본 건에 없음.

## 수용 기준 (AC)

AC-1. Given 8개 패스를 전부 활성화하는 씬(무지정 필지·색 없는 그룹·개별 색 필지·색 있는 그룹·단일 선택·그룹 선택·멀티선택·추가 모드 포함), When mock 2D 컨텍스트로 `renderScene`을 호출하면, Then 그리기 호출이 1차 → 1.5차 → 2차 → 3차 → 4차 → 5차 → 6차 → 7차 순서로 기록된다 (Vitest, 콜 기록 mock ctx).

AC-2. Given 각 패스의 대표 씬, When `renderScene`을 호출하면, Then mock ctx에 기록된 fillStyle·strokeStyle·lineWidth·setLineDash 값이 위 패스 표의 값과 일치한다 — 최소 검증 셋: 1차(#FFFFFF/#C9C4B6/0.6), 1.5차 dash [6,4], 2차 fill 스타일의 `hexA(hex, 0.55)`와 border 스타일의 2.6px, 4차 선택 강조 #1F5A38 3px, 7차 dash [6,4] (Vitest).

AC-3. Given 한 변을 공유하는 인접 사각형 2개, When `computeOuterEdges`를 호출하면, Then 공유 변이 제외된 외곽 변 6개만 반환되고, 비인접 폴리곤 2개 입력 시 모든 변(8개)이 반환된다 (Vitest).

AC-4. Given 동일한 groups 입력으로 `renderScene`을 2회 호출하면, Then `computeOuterEdges` 실제 계산은 그룹당 1회만 수행되고, When 한 그룹의 `parcelIds`를 변경한 뒤 재호출하면, Then 그 그룹만 재계산된다 (Vitest, 호출 카운트 스파이).

AC-5. Given 그룹 미소속 필지 1개에 `color` 오버라이드를 주입하고 다른 필지들을 그룹에 넣은 씬, When `renderScene`을 호출하면, Then 해당 필지는 1차가 아닌 2차 패스에서, 그룹 멤버는 3차 패스에서 그려진다 (Vitest — 패스 제외 규칙 검증).

AC-6. Given `deviceScaleFactor: 2` 브라우저 컨텍스트, When 앱이 지도를 렌더하면, Then 캔버스 백버퍼 크기(`canvas.width/height`)가 CSS 표시 크기의 정확히 2배다 (Playwright).

AC-7. Given 앱 로드(정적 parcels.json 4,409필지 + 빈 오버라이드), When 지도 캔버스 렌더가 완료되면, Then 캔버스 픽셀 샘플에 배경색(#FBFAF6) 외 색상(필지 채움/테두리)이 존재하고(빈 캔버스 아님), 전체 화면 스크린샷이 테스트 산출물로 저장된다 — v1 대비 시각 회귀 여부는 이 스크린샷으로 verifier가 비교 보고한다 (Playwright, 리스크 R-2 대응).

AC-8. Given `src/features/map/engine/**` 전체 소스, When `pnpm lint`를 실행하면, Then react import 위반 0건으로 통과한다 (ESLint no-restricted-imports — 기존 규칙).

## 비범위

- **제스처(M-3)**: 팬/줌/핀치/탭·줌 버튼 일체. 본 건의 뷰포트는 초기 fit 고정이며 `viewport`를 씬 입력으로 받는 구조까지만.
- **라벨 캔버스(M-4)**: 지번·그룹명·클러스터 라벨, `wrapText`와 그 캐싱(성능 개선 ②), `findClusters`. v1에서 `wrapText`는 라벨 레이어 전용이므로 **캐싱 개선은 M-4로 이연 판정**. 단 엔진 씬 타입·뷰포트 변환의 export 경계는 본 건에서 확정.
- **상태 스토어(M-5)** / **Realtime(M-6)**: App은 빈 오버라이드로 구동.
- **히트테스트 → 시트 연결(M-7)**: `pointInPolygon`(M-1 완료)·`screenToData` 인터페이스 노출까지만, 탭 선택 UI 동작 없음.
- **지목 필터(M-14)**, 동적 팔레트(M-11 — `colorById`는 주입 인터페이스만).

## 영향 범위

- 프론트: `src/features/map/engine/` (scene·renderScene 패스 함수·outerEdges memo·뷰포트 유틸, `colors.ts` 상수 확장), `src/features/map/MapCanvas.tsx` 얇은 호스트로 재작성, `src/App.tsx` 호출부 조정. 테스트: `tests/unit/`(mock ctx 패스·outerEdges·memo) + `tests/e2e/map-render-engine.spec.ts`
- 백엔드: 없음
- DB: 마이그레이션 불필요
- API 계약: 없음 (`src/types/api/tabState.ts`의 기존 ParcelOverride/Group 타입을 엔진 입력으로 재사용만)
- **ui-designer: 불요 판정** — 시각 결과가 v1 동작 보존이라 신규 UI 요소 0건. 단 `colors.ts`에 추가되는 v1 보존 hex 상수들(배경·선택 강조 등)은 lint 예외 모듈 신고 대상으로 2단계에서 목록만 보고.
