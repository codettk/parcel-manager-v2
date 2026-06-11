// 서버 server/handlers/ids.ts와 동일 포맷 — 클라는 server/를 import할 수 없어 규칙만 공유 (명세 §서버 계약)
function randomBase36(length: number): string {
  let s = ''
  while (s.length < length) {
    s += Math.random().toString(36).slice(2)
  }
  return s.slice(0, length)
}

/** grp_<timestamp36><random6> — 드래프트 생성 시 클라이언트 발급 (upsertGroup 계약이 클라 생성 허용) */
export function genGroupId(now: number = Date.now()): string {
  return `grp_${now.toString(36)}${randomBase36(6)}`
}
