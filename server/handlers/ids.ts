function randomBase36(length: number): string {
  let s = ''
  while (s.length < length) {
    s += Math.random().toString(36).slice(2)
  }
  return s.slice(0, length)
}

/** tab_<timestamp36><random4> — 서버에서만 생성 (H-1) */
export function genTabId(now: number = Date.now()): string {
  return `tab_${now.toString(36)}${randomBase36(4)}`
}

/** grp_<timestamp36><random6> — 히스토리 복원 시 전부 재생성 (C-3) */
export function genGroupId(now: number = Date.now()): string {
  return `grp_${now.toString(36)}${randomBase36(6)}`
}

/** stf_<timestamp36><random6> — 인력 마스터 PK, 서버에서만 생성 (ERP 슬라이스 5a) */
export function genStaffId(now: number = Date.now()): string {
  return `stf_${now.toString(36)}${randomBase36(6)}`
}

/** cnt_<timestamp36><random6> — 거래처 마스터 PK, 서버에서만 생성 (ERP 슬라이스 5a) */
export function genContactId(now: number = Date.now()): string {
  return `cnt_${now.toString(36)}${randomBase36(6)}`
}

/** wlg_<timestamp36><random6> — 업무일지 헤더 PK, 서버에서만 생성 (ERP 슬라이스 5b) */
export function genWorkLogId(now: number = Date.now()): string {
  return `wlg_${now.toString(36)}${randomBase36(6)}`
}

/** wle_<timestamp36><random6> — 업무일지 투입 인력 라인 PK, 서버에서만 생성 (ERP 슬라이스 5b) */
export function genWorkLogEntryId(now: number = Date.now()): string {
  return `wle_${now.toString(36)}${randomBase36(6)}`
}

/** 동일 timestamp 배치 삽입에서도 충돌하지 않는 group_id 목록 생성 */
export function genGroupIds(count: number): string[] {
  const ids = new Set<string>()
  while (ids.size < count) {
    ids.add(genGroupId())
  }
  return [...ids]
}
