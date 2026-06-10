// Canvas 2D는 CSS 변수를 직접 읽을 수 없어 hex 상수가 필요하다.
// 값은 src/styles/tokens.css와 반드시 일치시킬 것 (lint 예외가 허용된 유일한 모듈).
export const CANVAS_COLORS = {
  surface: '#ffffff', // --color-surface
  parcelBorder: '#c9c4b6', // --color-parcel-border
} as const
