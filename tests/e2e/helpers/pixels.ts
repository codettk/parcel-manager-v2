import { type Page } from '@playwright/test'
import type { Rgb } from './mockApi'

// 캔버스 픽셀 스캔 공용 헬퍼 — parcel-sheet.spec.ts에서 추출 (group-management.spec.ts 공유).
// (파일명이 *.spec.ts가 아니므로 playwright testMatch에 걸리지 않는다)

/**
 * 캔버스 픽셀 스캔으로 클릭 지점을 찾는다 (map-gestures.spec.ts 패턴 재사용).
 * 중앙 영역(x 15%~xMaxFrac, y 15~85%)만 스캔해 우측 오버레이 버튼을 피하고,
 * 반경 margin 정사각형이 전부 같은 색인 지점만 반환해 경계/안티앨리어싱을 배제한다.
 * 와이드 테스트는 xMaxFrac을 좁혀 우측 SidePanel(360px)에 덮이지 않는 지점만 고른다.
 * tol > 0이면 채널별 ±tol 매칭 — 합성색(compositedFill, 비정수 기대값) 영역 스캔용 (기본 0 = 정확 일치).
 */
export function findClickPoint(page: Page, color: Rgb, margin: number, xMaxFrac = 0.7, tol = 0) {
  return page.evaluate(
    ({ target, margin, xMaxFrac, tol }) => {
      const cv = document.querySelector('canvas')
      const ctx = cv?.getContext('2d')
      if (!cv || !ctx) return null
      const { width, height } = cv
      const { data } = ctx.getImageData(0, 0, width, height)
      const matches = (x: number, y: number) => {
        const i = (y * width + x) * 4
        return (
          Math.abs(data[i] - target.r) <= tol &&
          Math.abs(data[i + 1] - target.g) <= tol &&
          Math.abs(data[i + 2] - target.b) <= tol
        )
      }
      const x0 = Math.floor(width * 0.15)
      const x1 = Math.floor(width * xMaxFrac)
      const y0 = Math.floor(height * 0.15)
      const y1 = Math.floor(height * 0.85)
      for (let y = y0 + margin; y < y1 - margin; y += 3) {
        for (let x = x0 + margin; x < x1 - margin; x += 3) {
          let uniform = true
          for (let dy = -margin; dy <= margin && uniform; dy++) {
            for (let dx = -margin; dx <= margin && uniform; dx++) {
              if (!matches(x + dx, y + dy)) uniform = false
            }
          }
          if (uniform) {
            const rect = cv.getBoundingClientRect()
            const dpr = width / rect.width
            return { x: rect.left + (x + 0.5) / dpr, y: rect.top + (y + 0.5) / dpr }
          }
        }
      }
      return null
    },
    { target: color, margin, xMaxFrac, tol },
  )
}

/** 메인 캔버스 백버퍼에서 클라이언트 좌표에 대응하는 픽셀색을 읽는다 */
export function pixelAt(page: Page, point: { x: number; y: number }): Promise<Rgb | null> {
  return page.evaluate(({ x, y }) => {
    const cv = document.querySelector('canvas')
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return null
    const rect = cv.getBoundingClientRect()
    const dpr = cv.width / rect.width
    const d = ctx.getImageData(
      Math.round((x - rect.left) * dpr),
      Math.round((y - rect.top) * dpr),
      1,
      1,
    ).data
    return { r: d[0], g: d[1], b: d[2] }
  }, point)
}

export function isNear(px: Rgb, target: Rgb, tol: number): boolean {
  return (
    Math.abs(px.r - target.r) <= tol &&
    Math.abs(px.g - target.g) <= tol &&
    Math.abs(px.b - target.b) <= tol
  )
}
