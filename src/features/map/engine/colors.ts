// Canvas 2D는 CSS 변수를 직접 읽을 수 없어 색상 상수가 필요하다 (lint hex 예외가 허용된 유일한 모듈).
// 전부 v1 MapView.jsx 시각 결과의 동작 보존값 — 문자열 표기(대소문자·공백)까지 v1과 동일하게 유지한다.
// tokens.css에 대응 토큰이 있는 값은 주석으로 표시 — 값 변경 시 반드시 동기화할 것.
export const MAP_COLORS = {
  /** 캔버스 배경 — v1 보존값 (tokens.css 토큰 아님) */
  background: '#FBFAF6',
  /** 1차: 미지정 필지 채움 */
  parcelFill: '#FFFFFF',
  /** 1차: 미지정 필지 테두리 — --color-parcel-border */
  parcelStroke: '#C9C4B6',
  /** 1.5차: 색 없는 그룹 외곽 점선 */
  colorlessGroupStroke: 'rgba(90, 110, 190, 0.55)',
  /** 4·5·7차: 선택/추가 모드 강조 테두리 */
  selectStroke: '#1F5A38',
  /** 4·5차: 무색 선택 채움 */
  colorlessSelectFill: 'rgba(47, 125, 79, 0.18)',
  /** 6-1차: 그룹 소속 탭 힌트 테두리 — --color-group-hint */
  multiHintStroke: 'rgba(59, 130, 246, 0.6)',
  /** 6-2차: 멀티선택 채움 — --color-select */
  multiSelectFill: 'rgba(47, 125, 79, 0.25)',
  /** 6-2차: 멀티선택 테두리 — --color-primary */
  multiSelectStroke: '#2F7D4F',
  /** 7차: 필지 추가 모드 채움 */
  addModeFill: 'rgba(47, 125, 79, 0.30)',
} as const

/** 라벨 글자색 (M-4) — v1 MapView.jsx 라벨 레이어 보존값 */
export const LABEL_COLORS = {
  /** 사용자 지정 이름(override.name) + 그룹명 라벨 */
  customName: '#1A1814',
  /** 색 있는 필지(그룹 색 또는 개별 override.color)의 지번 */
  colored: '#3A3631',
  /** 기본 지번 */
  base: '#5C5851',
  /** halo 외곽선 — 각 줄 fillText 전에 strokeText */
  halo: 'rgba(255,255,255,0.92)',
} as const

export const MAP_LINE_WIDTHS = {
  parcelStroke: 0.6,
  colorlessGroupStroke: 1.8,
  colorFillStroke: 1.4,
  colorBorderStroke: 2.6,
  selectStroke: 3,
  multiHintStroke: 2,
} as const

/** v1 tweaks 패널 fillOpacity 기본값의 상수화 (명세서 §7.3-4, tweaks-panel 폐기) */
export const FILL_OPACITY = 0.55

// v1과 동일하게 런타임 연산으로 유지 — 부동소수점 결과까지 v1 rgba 문자열과 일치시키기 위함
export const SELECTED_FILL_OPACITY = Math.min(FILL_OPACITY + 0.2, 0.9)

/** 1.5차·7차 점선 패턴 */
export const GROUP_DASH = [6, 4] as const

/** hex → rgba 문자열 (v1 utils/color.js 동작 보존 — 출력 포맷까지 동일) */
export function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}
