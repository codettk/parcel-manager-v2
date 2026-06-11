import { describe, expect, it } from 'vitest'
import { historyCollectionHandler } from '../../server/handlers/history'
import { tabItemHandler, tabsCollectionHandler } from '../../server/handlers/tabs'
import { errorResponseSchema, okResponseSchema } from '../../src/types/api/common'
import { historyListResponseSchema } from '../../src/types/api/history'
import { tabSchema, tabsListResponseSchema } from '../../src/types/api/tabs'
import { call, CLIENT_ID, createTab, db, ensureSingleActiveTab } from './helpers'

describe('AC-3: 탭 생성·목록·이름 변경', () => {
  it('POST로 생성한 탭이 tab_ 접두 id를 갖고, GET에 sort_order 순으로 2개 반환되며, PATCH name이 재조회에 반영된다', async () => {
    await ensureSingleActiveTab()

    const createRes = await call(
      tabsCollectionHandler,
      'POST',
      {},
      { name: 'AC3 탭', clientId: CLIENT_ID },
    )
    expect(createRes.status).toBe(200)
    const created = tabSchema.parse(createRes.body)
    expect(created.tabId).toMatch(/^tab_[0-9a-z]+$/)
    expect(created.name).toBe('AC3 탭')

    const listRes = await call(tabsCollectionHandler, 'GET')
    expect(listRes.status).toBe(200)
    const tabs = tabsListResponseSchema.parse(listRes.body)
    expect(tabs).toHaveLength(2)
    const orders = tabs.map((t) => t.sortOrder)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    expect(tabs.map((t) => t.tabId)).toContain(created.tabId)

    const patchRes = await call(
      tabItemHandler,
      'PATCH',
      { id: created.tabId },
      { name: 'AC3 변경됨', clientId: CLIENT_ID },
    )
    expect(patchRes.status).toBe(200)
    expect(tabSchema.parse(patchRes.body).name).toBe('AC3 변경됨')

    const refetched = tabsListResponseSchema.parse((await call(tabsCollectionHandler, 'GET')).body)
    expect(refetched.find((t) => t.tabId === created.tabId)?.name).toBe('AC3 변경됨')
  })
})

describe('AC-4: 탭 닫기 — 마지막 활성 탭 보호(409) + 소프트 클로즈', () => {
  it('활성 탭이 1개뿐이면 DELETE가 409를 반환하고 탭은 활성으로 남는다', async () => {
    const lastTabId = await ensureSingleActiveTab()

    const res = await call(tabItemHandler, 'DELETE', { id: lastTabId }, { clientId: CLIENT_ID })
    expect(res.status).toBe(409)
    errorResponseSchema.parse(res.body)

    const tabs = tabsListResponseSchema.parse((await call(tabsCollectionHandler, 'GET')).body)
    expect(tabs.map((t) => t.tabId)).toContain(lastTabId)
  })

  it('활성 탭 2개 중 하나를 DELETE하면 closed_at이 설정되고 목록에서 빠지며 히스토리에 나타난다', async () => {
    await ensureSingleActiveTab()
    const victim = await createTab('AC4 닫힐 탭')

    const res = await call(tabItemHandler, 'DELETE', { id: victim.tabId }, { clientId: CLIENT_ID })
    expect(res.status).toBe(200)
    okResponseSchema.parse(res.body)

    const { data, error } = await db
      .from('tabs')
      .select('closed_at')
      .eq('tab_id', victim.tabId)
      .single()
    if (error) throw new Error(error.message)
    expect((data as { closed_at: string | null }).closed_at).not.toBeNull()

    const tabs = tabsListResponseSchema.parse((await call(tabsCollectionHandler, 'GET')).body)
    expect(tabs.map((t) => t.tabId)).not.toContain(victim.tabId)

    const history = historyListResponseSchema.parse(
      (await call(historyCollectionHandler, 'GET')).body,
    )
    expect(history.map((h) => h.tabId)).toContain(victim.tabId)
  })
})

describe('AC-5: 활성 탭 0개일 때 GET /api/tabs가 기본 탭을 자동 생성 (활성 탭 ≥ 1 불변식)', () => {
  it('전부 소프트 클로즈된 DB에서 GET이 기본 탭 1개를 생성해 반환한다', async () => {
    const { error } = await db
      .from('tabs')
      .update({ closed_at: new Date().toISOString() })
      .is('closed_at', null)
    if (error) throw new Error(error.message)

    const res = await call(tabsCollectionHandler, 'GET')
    expect(res.status).toBe(200)
    const tabs = tabsListResponseSchema.parse(res.body)
    expect(tabs).toHaveLength(1)
    expect(tabs[0].tabId).toMatch(/^tab_[0-9a-z]+$/)
    expect(tabs[0].name).toBe('기본 작업공간')
    expect(tabs[0].closedAt).toBeNull()
  })
})
