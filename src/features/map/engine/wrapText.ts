/** measureText만 요구하는 최소 컨텍스트 — 라벨 본문 폰트가 설정된 상태에서 호출해야 한다 */
export interface TextMeasurer {
  measureText(text: string): { width: number }
}

/**
 * 글자 단위 그리디 줄바꿈 (v1 utils/text.js 동작 보존 — 한글/숫자 혼합 대응).
 * 첫 글자조차 maxWidth를 넘으면 [] (표시 불가), maxLines 초과 시 마지막 줄을
 * '…' 포함 폭이 maxWidth 이하가 될 때까지 잘라 말줄임한다.
 */
export function wrapText(
  ctx: TextMeasurer,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = []
  let cur = ''
  for (const ch of text) {
    const next = cur + ch
    if (ctx.measureText(next).width <= maxWidth) {
      cur = next
    } else {
      if (cur) lines.push(cur)
      else return []
      cur = ch
      if (lines.length >= maxLines) {
        const last = lines[maxLines - 1]
        let trimmed = last
        while (trimmed.length > 0 && ctx.measureText(trimmed + '…').width > maxWidth) {
          trimmed = trimmed.slice(0, -1)
        }
        lines[maxLines - 1] = (trimmed || last) + '…'
        return lines.slice(0, maxLines)
      }
    }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, maxLines)
}

/** 캐시 상한 — 초과 시 가장 오래된 항목부터 축출 (FIFO, Map 삽입 순서) */
const WRAP_CACHE_MAX = 4096

export interface WrapTextCache {
  get(ctx: TextMeasurer, text: string, maxWidth: number, maxLines: number): string[]
}

/**
 * wrapText 결과 캐시 (성능 개선 ① — v1은 매 렌더 measureText 재측정).
 * 폰트는 상수(LABEL_FONT)라 키에 불요. maxWidth는 scale에만 의존하므로
 * 팬·동일 줌 재렌더는 전량 캐시 히트, 줌 변경 시에만 미스.
 */
export function createWrapTextCache(): WrapTextCache {
  const cache = new Map<string, string[]>()
  return {
    get(ctx, text, maxWidth, maxLines) {
      // 구분자 NUL — text에 등장하지 않는 문자라 키 충돌 없음
      const key = text + '\u0000' + maxWidth + '\u0000' + maxLines
      const hit = cache.get(key)
      if (hit) return hit
      const lines = wrapText(ctx, text, maxWidth, maxLines)
      if (cache.size >= WRAP_CACHE_MAX) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      cache.set(key, lines)
      return lines
    },
  }
}
