# 지도 팬/줌/핀치/탭 제스처

- 상태: 완료 (5단계 검증 통과, 2026-06-11)
- 매핑: M-3
- 판정: 보존 + 재설계 (임계값·탭 판정·줌 중심 고정·줌 클램프 등 인터랙션 의미론은 v1 `MapView.jsx` 검증 동작을 **보존**. 구조는 **재설계** — ① MapView 내장 gestureRef/transformRef를 `useGestures` 훅으로 분리(React 훅이므로 `engine/` 밖 `src/features/map/`), ② v1의 touch/mouse 이중 핸들러 6종 + 고스트 마우스 600ms 가드(`lastTouchEndRef`)를 **Pointer Events 단일화로 통합·폐기** — PointerEvent는 터치/마우스/펜을 단일 이벤트 모델로 전달하므로 합성 마우스 이벤트 중복 자체가 발생하지 않는다. 폐기 근거: v1 가드는 touch/mouse 이중 등록 구조의 우회 패치)

## 사용자 스토리

1. 공동체 사용자는 4,409개 필지 지도를 모바일에서 한 손가락 팬·두 손가락 핀치로 자유롭게 탐색하고, 필지를 탭해 선택할 수 있다.
2. 데스크톱 사용자는 마우스 드래그·휠·줌 버튼(+/−)으로 동일하게 탐색한다.
3. 개발자(후속 M-4 라벨, M-5 스토어, M-7 시트 담당)는 훅이 노출하는 `viewport`와 탭 콜백을 그대로 연결한다.

## 동작 명세 (v1 실코드 `components/MapView.jsx:515-720` 기준)

### v1 보존 파라미터 (전부 동작 보존)

| 항목             | 값                                                     | v1 출처      |
| ---------------- | ------------------------------------------------------ | ------------ |
| 팬 시작 임계값   | 터치/펜 12px, 마우스 6px (`Math.hypot(dx,dy)` 기준)    | 라인 615     |
| 탭 시간 제한     | press~release < 500ms                                  | 라인 634     |
| 줌 scale 클램프  | min 50, max 30000                                      | 라인 593 등  |
| 휠 줌 배율       | 휠 1틱당 deltaY<0 → ×1.15, deltaY>0 → ÷1.15            | 라인 669     |
| 줌 버튼 배율     | + → ×1.6, − → ÷1.6, 중심 = 컨테이너 중앙               | 라인 718-720 |
| 초기/리사이즈 뷰 | `computeFitViewport` 재계산 (리사이즈 시 fit으로 리셋) | 라인 93-121  |

관성 스크롤·더블탭 줌은 v1에 없음 — 추가하지 않는다.

### 제스처 상태 머신 (보존)

- **idle → tap**: 포인터 1개 down. 시작 화면 좌표·시각·시작 viewport 스냅샷 기록.
- **tap → pan**: 누적 이동거리가 임계값(터치 12 / 마우스 6) 초과 시 전환. 이후 viewport `tx = start.tx + dx`, `ty = start.ty + dy` (scale 불변).
- **tap → 탭 확정**: 임계값 이내 + up까지 500ms 미만 → 히트테스트 수행. **시작 시점 viewport 스냅샷**으로 좌표 변환한다 (v1 라인 635 보존). 500ms 이상은 무시.
- **(tap|pan) → pinch**: 활성 포인터가 2개가 되면 즉시 핀치로 전환 — 시작 거리·시작 중점·시작 viewport 재기준(re-baseline, v1 라인 573-583).
- **pinch 진행**: `newScale = clamp(start.scale × dist/startDist, 50, 30000)`. **시작 중점 아래에 있던 데이터 좌표가 현재 중점 화면 위치에 오도록** tx/ty 산출 (v1 라인 593-601 — 핀치 줌+팬 동시).
- **pinch → pan**: 손가락 1개 해제 시 남은 포인터 기준으로 pan 재기준, `moved=true` 유지 → 탭 불가 (v1 라인 650-657).
- **종료**: 활성 포인터 0개 → idle. `pointercancel`·캡처 이탈도 동일 처리 (v1 mouseLeave 종료의 대체).

### 줌 중심 고정 수식 (보존 — 휠·핀치·버튼 공통)

```
dataX = (cx - start.tx) / (aspect · start.scale)
dataY = (cy - start.ty) / start.scale
tx' = cx - dataX · aspect · newScale
ty' = cy - dataY · newScale
```

cx,cy = 휠: 커서 위치 / 핀치: 현재 두 포인터 중점 / 버튼: 컨테이너 중앙. 휠·핀치·버튼으로 클램프 경계(50/30000)에 도달하면 scale은 더 변하지 않는다.

### 탭 → 히트테스트 → 선택 반영 (판정 포함)

- 히트테스트: `screenToData`(M-2 viewport.ts) 변환 후 데이터 범위(0..1 × 0..1) 밖이면 null (makeProjector가 x도 0..1로 투영 — v1의 `dx > aspect` 검사는 지도 우측 영역 탭을 무시하던 실버그라 폐기), 범위 내면 **면적 내림차순 배열을 역순 순회**(작은 필지 = 위에 그려진 것 우선)하며 `pointInPolygon`(M-1) 첫 일치 id 반환 (v1 라인 522-533 보존). 순수 함수이므로 `src/features/map/engine/hitTest.ts`에 둔다 (React import 금지 영역).
- **선택 상태 판정: 호스트 로컬 반영까지 포함.** 훅은 `onTap(parcelId | null)` 콜백만 노출하고 선택 상태를 소유하지 않는다. `MapCanvas`가 `onParcelTap` prop으로 위로 전달, `App`이 로컬 `useState`로 단일 선택 1건을 보관해 기존 `selection` prop(4차 패스 선택 강조)으로 환류한다. 근거: 콜백 노출만으로는 E2E에서 탭 동작을 시각 검증할 수 없고, M-5 스토어 도입 시 이 로컬 state 1줄만 스토어 셀렉터로 치환되는 임시 비계다. 빈 곳 탭(null) 시 선택 해제.

### 훅 API 형태 (구현 재량, 경계만 고정)

- `src/features/map/useGestures.ts` — 입력: 컨테이너 ref(또는 element), `aspect`, 초기 fit 입력, `onTap`. 출력: `viewport: Viewport`(scene.ts 타입 재사용), `zoomBy(factor)` (줌 버튼용).
- 등록: PointerEvent(`pointerdown/move/up/cancel`) + `setPointerCapture`. wheel은 `{ passive: false }` 수동 등록(preventDefault 필요). 컨테이너에 `touch-action: none` 적용 (브라우저 기본 스크롤/줌 차단 — v1 touchmove preventDefault의 대체).
- 팬/줌 중 렌더 갱신은 프레임당 1회 이하 (rAF 배칭 재량). v1의 transformVersion 카운터 패턴은 답습하지 않아도 된다.
- `MapCanvas.tsx`: 현재 "초기 fit 고정" draw를 훅의 `viewport`로 대체. 줌 컨트롤(+/− 버튼)은 기존 `src/components/ui/` 컴포넌트 조합으로 지도 우측에 배치 (v1 동일 기능).

## 수용 기준 (AC)

AC-1. Given 훅이 부착된 컨테이너(터치 pointerType), When pointerdown 후 총 11px 이동하고 400ms 내 pointerup 하면, Then `onTap`이 1회 호출되고 viewport는 변하지 않는다; When 동일 조건에서 13px 이동하면, Then `onTap`은 호출되지 않고 `viewport.tx/ty`가 이동량만큼 증가하며 scale은 불변이다 (Vitest, 합성 PointerEvent — 마우스 pointerType은 5px/7px 경계로 동일 검증).

AC-2. Given 이동 없는 press, When 499ms 후 pointerup 하면 `onTap`이 호출되고, 501ms 후 pointerup 하면 호출되지 않는다 (Vitest, fake timers).

AC-3. Given 임의 viewport와 커서 위치 (cx, cy), When deltaY<0 휠 이벤트를 디스패치하면, Then `scale`이 정확히 ×1.15 되고 `screenToData(viewport', aspect, [cx, cy])`가 휠 전과 오차 1e-6 이내로 동일하다(커서 아래 데이터 좌표 고정). deltaY>0이면 ÷1.15 (Vitest).

AC-4. Given scale이 클램프 경계 부근인 viewport, When 휠/`zoomBy`를 반복 적용하면, Then scale은 50 미만·30000 초과로 벗어나지 않는다 (Vitest).

AC-5. Given 활성 포인터 2개, When 두 포인터 거리를 2배로 벌리면, Then scale이 시작값의 2배(클램프 내)가 되고 시작 중점 아래 데이터 좌표가 현재 중점 화면 좌표에 위치한다(오차 1e-6); When 포인터 1개를 떼고 남은 포인터로 이동 후 pointerup 하면, Then 팬으로 이어지고 `onTap`은 호출되지 않는다 (Vitest — Playwright 멀티터치 제약으로 핀치는 단위 테스트 전담).

AC-6. Given 면적 내림차순 정렬 필지 배열(큰 필지 안에 작은 필지가 포개진 케이스 포함), When `hitTest`를 호출하면, Then 포개진 지점에서는 작은(위에 그려진) 필지 id를, 데이터 범위(0..1 × 0..1) 밖 좌표에서는 null을 반환한다 (Vitest, 순수 함수).

AC-7. Given 앱 로드(4,409 필지 렌더 완료), When 마우스로 드래그(>6px)·휠 줌·줌 버튼 클릭을 각각 수행하면, Then 각 조작 전후 캔버스 픽셀(스크린샷)이 달라진다; When 필지 내부 좌표를 클릭(탭)하면, Then 캔버스에 선택 강조색(`#1F5A38` 계열) 픽셀이 나타나고, 빈 영역을 클릭하면 사라진다 (Playwright `tests/e2e/map-gestures.spec.ts`).

AC-8. Given 줌 버튼, When +를 클릭하면, Then scale ×1.6, 컨테이너 중앙의 데이터 좌표가 고정 유지되고, −는 ÷1.6으로 대칭이다 (Vitest `zoomBy` 단위 검증 — E2E 픽셀 변화는 AC-7에 포함).

## 비범위

- **시트 연결(M-7)**: 탭 선택 후 필지 시트 열림·400ms 닫힘 가드 일체. 본 건은 선택 강조(4차 패스)까지.
- **멀티선택 UI(M-8)**: multiSelectMode 분기 없음 — 탭은 항상 단일 선택/해제.
- **상태 스토어(M-5)**: App 로컬 useState 1건은 임시 비계 — 스토어 치환은 M-5.
- **라벨 캔버스(M-4)**: viewport를 공유 입력으로 쓸 뿐, 라벨 렌더 호출 없음.
- 관성 스크롤·더블탭 줌·회전 제스처 (v1에 없음 — 추가 금지).

## 영향 범위

- 프론트: `src/features/map/useGestures.ts` (신규 훅), `src/features/map/engine/hitTest.ts` (신규 순수 함수, React import 금지 영역), `src/features/map/MapCanvas.tsx` (viewport 주입·onParcelTap prop·줌 버튼·touch-action), `src/App.tsx` (로컬 선택 state 환류). 테스트: `tests/unit/`(제스처·hitTest·줌 수학) + `tests/e2e/map-gestures.spec.ts`
- 백엔드: 없음
- DB: 마이그레이션 불필요
- API 계약: 없음
- **ui-designer: 불요 판정** — 인터랙션 전용이며 신규 디자인 요소 0건. 줌 컨트롤(+/− 버튼)은 v1 기능 보존으로 기존 `src/components/ui/` 컴포넌트·토큰 조합만 사용 — 2단계에서 신규 UI 아님으로 신고만.
