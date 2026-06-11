# 라벨 렌더 (지번·그룹명·클러스터) — 별도 라벨 캔버스

- 상태: 검토 대기
- 매핑: M-4
- 판정: 보존 + 재설계 (라벨 배치 의미론 — 센트로이드 앵커·클러스터 bbox 중심·박스 크기 표시 게이트·색 분기·halo 스타일·wrapText 줄바꿈 규칙은 v1 `MapView.jsx` 라벨 레이어 + `utils/text.js`의 검증 동작을 **동작 보존**. 구조는 **재설계** — React 얽힘 없는 순수 TS `engine/labels.ts`로 분리하고 별도 라벨 캔버스 레이어로 렌더. **성능 개선 2건 내장**: ① `wrapText` 결과 캐싱(M-2에서 본 건으로 이연 확정 — `docs/specs/map-render-engine.md` 비범위 참조), ② `findClusters` 결과 그룹별 memo — v1은 매 렌더(팬/줌 포함)마다 전 그룹 BFS 재계산하던 것을 `outerEdges` memo와 동일 패턴(그룹 `parcelIds` 키)으로 캐시. 둘 다 시각 결과 불변)

## 사용자 스토리

1. 공동체 사용자는 어느 필지가 어느 땅인지 확인하기 위해, 충분히 확대하면 필지 위에 지번(또는 지정한 이름)이 v1과 동일하게 표시되는 것을 본다.
2. 공동체 사용자는 그룹으로 묶은 땅덩이를 식별하기 위해, 이름 있는 그룹의 인접 덩어리(클러스터)마다 그룹명이 중앙에 1개씩 표시되는 것을 본다.
3. 개발자(후속 M-5 스토어, M-7 시트 담당)는 동일한 `MapScene` 입력으로 메인 캔버스와 라벨 캔버스가 함께 갱신되는 구조를 그대로 사용한다.

## 동작 명세 (v1 실코드 `components/MapView.jsx:380-511` + `utils/text.js` 기준)

### 라벨 캔버스 레이어 (보존)

- 메인 캔버스와 **별도의 두 번째 `<canvas>`** — 동일 컨테이너 안에서 메인 캔버스 **다음**에 배치(z-order 위), 동일 위치·크기·DPR 백버퍼(`min(devicePixelRatio, 2)`).
- 라벨 캔버스는 포인터 입력을 가로채지 않는다 — v1은 `pointer-events: none`. v2는 제스처가 컨테이너에 등록돼 있으므로(M-3) 탭/팬/줌 동작이 라벨 캔버스 추가 전후로 불변이어야 한다 (AC-8 회귀 검증).
- 매 렌더: `clearRect` 전체 → dpr 스케일 → CSS px 단위로 그림 (투명 배경 — 메인 캔버스가 비쳐 보인다).
- 메인 캔버스 렌더와 같은 `MapScene`·같은 viewport로 같은 프레임에 갱신.

### 공통 스타일 상수 (보존 — `engine/colors.ts` 또는 `labels.ts` 상수로 집약)

| 항목         | 값                                                                               |
| ------------ | -------------------------------------------------------------------------------- |
| 폰트         | `600 11px Pretendard, -apple-system, system-ui, sans-serif` (FONT_SIZE=11)       |
| 줄 높이      | LINE_HEIGHT=13, 패딩 PADDING=4                                                   |
| 정렬         | `textAlign='center'`, `textBaseline='middle'`                                    |
| halo(외곽선) | `strokeText` 선행 — `rgba(255,255,255,0.92)`, lineWidth 2.5 → 그 위에 `fillText` |
| 최소 박스    | minBoxW=14px, minBoxH=FONT_SIZE+2=13px                                           |

### 표시 조건 (보존 — **전역 줌 임계값은 존재하지 않는다**)

v1에 줌 레벨 임계값 상수는 없다. 라벨별 **투영 박스 크기 게이트**가 유일한 표시 조건:

1. 화면 밖 컬링: 앵커 화면 좌표가 `x < -40 || y < -20 || x > w+40 || y > h+20`이면 생략.
2. 크기 게이트: 투영 박스 `boxW < 14px || boxH < 13px`이면 생략 (boxW = bw·aspect·scale, boxH = bh·scale — **scale에만 의존, 팬(tx/ty)과 무관**).
3. `wrapText` 결과가 빈 배열(한 글자도 안 들어감)이면 생략.

즉 줌인할수록 작은 필지의 라벨이 점진적으로 나타난다 — 이 의미론을 보존한다.

### 개별 필지 라벨 (보존)

- 대상: 전 필지 중 **이름 있는 그룹의 멤버를 제외**한 것. 이름 없는(name이 null/빈) 그룹의 멤버는 개별 라벨을 그대로 표시한다.
- 텍스트: `override.name || jibun` — 빈 값이면 생략.
- 앵커: 필지 **센트로이드** (`polyCentroid` — M-1 `geo.ts` 기존 함수) → 화면 변환 `dataToScreen`(M-2 viewport.ts와 동일 수식: `px = tx + cx·aspect·scale`, `py = ty + cy·scale`).
- 줄바꿈 입력: `maxLineWidth = max(8, boxW − 8)`, `maxLines = max(1, floor((boxH − 2·PADDING + LINE_HEIGHT − FONT_SIZE) / LINE_HEIGHT))` = `max(1, floor((boxH − 6) / 13))`.
- 세로 배치: `totalH = lines·13 − 2`, `startY = cyPx − totalH/2 + 11/2`, i번째 줄 y = `startY + i·13`. 각 줄마다 strokeText → fillText.
- 글자색 분기 (보존):
  - 사용자 지정 이름(`override.name` 존재) → `#1A1814`
  - 색 있는 필지(그룹 색 또는 개별 `override.color` 존재) → `#3A3631`
  - 그 외(지번 기본) → `#5C5851`
- **고정 필지 아이콘** (보존): `override.pinned && override.icon`이면 텍스트 위에 이모지 — `iconSize = clamp(12, boxW·0.38, 22)`, 폰트 `${iconSize}px serif`, 좌표 `(cxPx, cyPx − totalH/2 − iconSize·0.7)`, 그린 뒤 본문 폰트 복원. v1과 동일하게 이름 있는 그룹 멤버는 개별 라벨 루프에서 제외되므로 **아이콘도 표시되지 않는다** (v1 동작 그대로 — 변경하지 않음).

### 그룹명 라벨 — 클러스터 bbox 중심 (보존)

- 대상: `name`이 있는 그룹만. 멤버 필지들을 `findClusters`로 **인접 덩어리(클러스터)** 단위로 나누고, 클러스터마다 그룹명을 1개씩 표시.
- `findClusters` 의미론 (보존): 폴리곤 변을 `toFixed(6)` 좌표쌍 정규화 키로 인덱싱 → 같은 변 키를 공유하는(등장 ≥2) 필지끼리 인접 → BFS 연결 요소가 클러스터. (`outerEdges`와 동일한 변 키 규칙.)
- 앵커: 클러스터 멤버 전 꼭짓점의 **화면 좌표 bbox 중심** `((minX+maxX)/2, (minY+maxY)/2)`.
- 표시 조건·줄바꿈 입력·세로 배치·halo: 개별 라벨과 동일 공식 (boxW/boxH = 클러스터 화면 bbox 폭/높이).
- 글자색: 항상 `#1A1814`.

### wrapText (보존 — `utils/text.js` → 순수 TS 포팅)

- **글자 단위** 그리디 줄바꿈 (한글/숫자 혼합 대응): 글자를 누적하며 `ctx.measureText` 폭이 maxWidth를 넘으면 줄 확정.
- 첫 글자조차 maxWidth를 넘으면 `[]` 반환 (표시 불가).
- maxLines 초과 시: 마지막 줄을 `…` 포함 폭이 maxWidth 이하가 될 때까지 끝에서 잘라 `…` 부착, 정확히 maxLines줄 반환.
- 측정은 라벨 본문 폰트가 설정된 상태에서만 수행 (아이콘 폰트 전환과 격리).

### wrapText 캐싱 (성능 개선 ① — M-2 이연분)

- v1은 매 렌더마다 보이는 라벨 전부를 `measureText`로 재측정. v2는 `(text, maxLineWidth, maxLines)` 키 캐시 — 폰트는 상수라 키에 불요.
- maxLineWidth는 scale에만 의존하므로 **팬·동일 줌 재렌더(선택 변경 등)는 전량 캐시 히트**, 줌 변경 시에만 미스. 캐시는 상한을 두어 무한 성장 방지 (상한값·축출 정책은 구현 재량).
- 캐시 수명/소유: 호스트가 생성해 주입하거나 모듈 내 캡슐화 — `outerEdgesCache` 패턴과 일관되게 (구현 재량).

### findClusters memo (성능 개선 ②)

- 클러스터 구성은 데이터 좌표만으로 결정되며 viewport와 무관 — 그룹의 `parcelIds`가 변하지 않으면 재계산하지 않는다 (`outerEdges` memo와 동일 키 전략). 화면 bbox 중심 계산만 매 렌더 수행.

### API 형태 (구현 재량, 경계만 고정)

- `src/features/map/engine/labels.ts` — **React import 금지** (기존 ESLint 규칙 영역). `renderLabels(ctx, scene, size, cache?)` 순수 함수 — `MapScene`(M-2 scene.ts)을 그대로 입력으로 사용.
- `EngineParcel` 확장: 라벨 앵커·게이트 입력으로 `cx, cy`(센트로이드)·`bw, bh`(데이터 좌표 bbox 폭/높이) 필드 추가 — 호스트 데이터 준비(fetch 시 1회)에서 `polyCentroid` + bbox 계산 (v1 app.jsx 데이터 준비와 동일 책임 배치).
- `MapCanvas.tsx`: 라벨 캔버스 1장 추가(메인 캔버스 형제, DOM 순서 뒤), 동일 DPR/크기 관리, `renderScene` 직후 `renderLabels` 호출.

## 수용 기준 (AC)

AC-1. Given 글자 폭이 결정적인 mock `measureText`(예: 글자당 10px), When `wrapText`를 호출하면, Then ① maxWidth 30·5글자 입력은 `['xxx','xx']` 꼴로 글자 단위 분할되고 ② 첫 글자도 안 들어가는 maxWidth에서는 `[]`를 반환하며 ③ maxLines 초과 입력은 정확히 maxLines줄 + 마지막 줄이 `…`로 끝나고 그 줄의 측정 폭이 maxWidth 이하다 (Vitest).

AC-2. Given 동일 `(text, maxWidth, maxLines)` 입력, When 캐시가 활성화된 wrapText를 2회 호출하면, Then 2회째에 `measureText` 호출 수가 증가하지 않고(캐시 히트) 반환값은 1회째와 동일하며, 다른 maxWidth로 호출하면 재측정된다 (Vitest, measureText 스파이).

AC-3. Given 투영 박스가 게이트 경계를 걸치는 필지들(boxW 14px 이상/미만 × boxH 13px 이상/미만 조합)과 화면 밖 마진 경계(x ±40 / y ±20) 케이스 씬, When `renderLabels`를 호출하면, Then boxW ≥ 14 그리고 boxH ≥ 13이며 컬링 마진 안에 있는 라벨만 fillText가 기록된다 (Vitest, mock ctx).

AC-4. Given 그룹 미소속 필지 1개(1줄 라벨), When `renderLabels`를 호출하면, Then fillText 좌표가 `(tx + cx·aspect·scale, ty + cy·scale)`과 오차 1e-6 이내로 일치하고, 각 줄마다 strokeText(`rgba(255,255,255,0.92)`, lineWidth 2.5)가 fillText보다 먼저 기록되며, 폰트는 `600 11px Pretendard…`, 글자색은 ① override.name 존재 → `#1A1814` ② 색 있음 → `#3A3631` ③ 기본 → `#5C5851` 분기와 일치한다 (Vitest).

AC-5. Given 이름 있는 그룹(변을 공유하는 인접 필지 2개 + 떨어진 필지 1개 = 클러스터 2개)과 이름 없는 그룹 1개를 포함한 씬, When `renderLabels`를 호출하면, Then ① 이름 있는 그룹 멤버의 개별 지번 라벨은 0건 ② 그룹명 fillText가 클러스터마다 1회(총 2회) 각 클러스터의 화면 bbox 중심 좌표(오차 1e-6)에 `#1A1814`로 기록 ③ 이름 없는 그룹 멤버는 개별 지번 라벨이 유지된다 (Vitest).

AC-6. Given 동일한 groups 입력, When `renderLabels`를 2회 호출하면, Then `findClusters` 실제 계산은 그룹당 1회만 수행되고, 한 그룹의 `parcelIds` 변경 후 재호출하면 그 그룹만 재계산된다 (Vitest, 호출 카운트 스파이 — outerEdges memo AC와 동일 패턴).

AC-7. Given `pinned: true` + `icon` 오버라이드가 있는 그룹 미소속 필지(라벨 표시 게이트 통과 크기), When `renderLabels`를 호출하면, Then 아이콘 fillText가 좌표 `(cxPx, cyPx − totalH/2 − iconSize·0.7)`, `iconSize = clamp(12, boxW·0.38, 22)`, serif 폰트로 기록되고 이후 본문 폰트로 복원되며, `pinned: false`이거나 icon이 없으면 기록되지 않는다 (Vitest).

AC-8. Given 앱 로드(4,409필지 + 빈 오버라이드 — 지번 라벨만 존재), When 초기 fit에서 라벨 캔버스 픽셀을 샘플한 뒤 줌 버튼(+)으로 수회 확대하면, Then 라벨 캔버스의 비투명 픽셀 수가 확대 전보다 증가하고(지번 라벨 출현), 확대 상태에서 필지 클릭 시 메인 캔버스에 선택 강조색(`#1F5A38` 계열) 픽셀이 나타난다 — 라벨 캔버스가 탭 히트테스트를 가로채지 않음(M-3 AC-7 회귀 없음) (Playwright `tests/e2e/map-labels.spec.ts`).

AC-9. Given `src/features/map/engine/**` 전체 소스(labels.ts 포함), When `pnpm lint`를 실행하면, Then react import 위반 0건으로 통과한다 (ESLint no-restricted-imports — 기존 규칙).

## 비범위

- **상태 스토어(M-5)** / **Realtime(M-6)**: 오버라이드·그룹은 props 주입 그대로 — App은 빈 값 구동.
- **필지 시트(M-7)** / **그룹 기능(M-8)**: 라벨은 표시 전용. 이름·아이콘·그룹을 만드는 UI 없음.
- **지목 필터(M-14)**: 라벨 필터링 없음.
- **E2E 범위 한정**: 오버라이드 이름·그룹이 현재 빈 상태이므로 E2E는 **지번 라벨 출현**만 검증한다. 이름 라벨·그룹명 클러스터 라벨·고정 아이콘은 단위 테스트(AC-4·5·7)로 검증 — 스토어(M-5)·시트(M-7) 도입 후 통합 E2E에서 자연 커버.
- 라벨 충돌 회피·우선순위 재배치 같은 신규 알고리즘 (v1에 없음 — 추가 금지).

## 영향 범위

- 프론트: `src/features/map/engine/labels.ts` (신규 — renderLabels·wrapText+캐시·findClusters+memo, React import 금지 영역), `src/features/map/engine/scene.ts` (`EngineParcel`에 cx/cy/bw/bh 추가), `src/features/map/engine/colors.ts` (라벨 색 상수 추가), `src/features/map/engine/index.ts` (export 경계), `src/features/map/MapCanvas.tsx` (라벨 캔버스 추가 + 데이터 준비에 centroid/bbox 계산). 테스트: `tests/unit/`(wrapText·캐시·게이트·배치·클러스터·아이콘) + `tests/e2e/map-labels.spec.ts`
- 백엔드: 없음
- DB: 마이그레이션 불필요
- API 계약: 없음 (`ParcelOverride`·`Group` 기존 타입의 name/color/pinned/icon 필드 소비만)
- **ui-designer: 불요 판정** — v1 라벨 시각(폰트·색·halo) 동작 보존이라 신규 UI 요소 0건. `colors.ts`에 추가되는 라벨 hex 상수 4종(`#1A1814`, `#3A3631`, `#5C5851`, `rgba(255,255,255,0.92)`)은 lint 예외 모듈 신고 대상으로 2단계에서 목록만 보고.
