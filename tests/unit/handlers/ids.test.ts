import { describe, expect, it } from 'vitest'
import { genGroupId, genGroupIds, genTabId } from '../../../server/handlers/ids'

describe('ID 생성 규칙', () => {
  it('tab_<timestamp36><random4> 형식을 따른다', () => {
    const now = Date.now()
    const id = genTabId(now)
    expect(id).toMatch(new RegExp(`^tab_${now.toString(36)}[0-9a-z]{4}$`))
  })

  it('grp_<timestamp36><random> 형식을 따른다', () => {
    const now = Date.now()
    const id = genGroupId(now)
    expect(id).toMatch(new RegExp(`^grp_${now.toString(36)}[0-9a-z]{6}$`))
  })

  // 같은 ms 내 대량 생성은 비결정적(36^4 생일 충돌) — 탭은 단건 생성이며 배치 고유성은 genGroupIds(Set) 소관
  it('timestamp가 다르면 tab id가 충돌하지 않는다', () => {
    const base = Date.now()
    const ids = new Set(Array.from({ length: 1000 }, (_, i) => genTabId(base + i)))
    expect(ids.size).toBe(1000)
  })

  it('genGroupIds는 요청 개수만큼 고유 id를 반환한다', () => {
    const ids = genGroupIds(500)
    expect(new Set(ids).size).toBe(500)
    for (const id of ids) expect(id).toMatch(/^grp_[0-9a-z]+$/)
  })
})
