import { describe, expect, it } from 'vitest'
import { calcRecipesHandler } from '../../server/handlers/calcRecipes'
import { configHandler } from '../../server/handlers/config'
import { fetchLandInfoHandler } from '../../server/handlers/parcels'
import { tabImportHandler, tabStateHandler } from '../../server/handlers/tabState'
import { calcRecipesResponseSchema } from '../../src/types/api/calcRecipes'
import { errorResponseSchema, okResponseSchema } from '../../src/types/api/common'
import { configResponseSchema } from '../../src/types/api/config'
import { tabStateResponseSchema } from '../../src/types/api/tabState'
import type { Group, ParcelOverride } from '../../src/types/api/tabState'
import { call, CLIENT_ID, createTab, pickParcelIds } from './helpers'

// AC-14: 다른 AC 테스트가 다루지 않는 나머지 엔드포인트의 실응답도 계약 스키마 parse를 통과해야 한다.
// (tabs/history/state/colors 응답 parse는 각 AC 테스트에 내장 — 이 파일이 커버리지를 완결한다)

describe('AC-14: 나머지 엔드포인트 응답의 계약 스키마 parse', () => {
  it('GET /api/config — configResponseSchema', async () => {
    const res = await call(configHandler, 'GET')
    expect(res.status).toBe(200)
    const parsed = configResponseSchema.parse(res.body)
    expect(parsed.supabaseUrl).toBeTruthy()
  })

  it('PUT·GET /api/calc-recipes — 저장한 recipes가 그대로 반환된다', async () => {
    const initial = await call(calcRecipesHandler, 'GET')
    expect(initial.status).toBe(200)
    calcRecipesResponseSchema.parse(initial.body)

    const recipes = [{ name: '평당 환산', factor: 0.3025 }]
    const putRes = await call(calcRecipesHandler, 'PUT', {}, { recipes, clientId: CLIENT_ID })
    expect(putRes.status).toBe(200)
    okResponseSchema.parse(putRes.body)

    const getRes = await call(calcRecipesHandler, 'GET')
    expect(getRes.status).toBe(200)
    const parsed = calcRecipesResponseSchema.parse(getRes.body)
    expect(parsed.recipes).toEqual(recipes)
  })

  it('PUT /api/tabs/:tabId/import — settings/groups 교체 + group_id 재생성, state 재조회 parse', async () => {
    const tab = await createTab('AC14 import 탭')
    const [p1, p2] = await pickParcelIds(2)
    const overrides: Record<string, ParcelOverride> = {
      [p1]: {
        color: 'eco',
        style: 'fill',
        name: '임포트 필지',
        memo: null,
        pinned: false,
        icon: null,
      },
      [p2]: { color: null, style: null, name: null, memo: '임포트 메모', pinned: true, icon: null },
    }
    const groups: Record<string, Group> = {
      grp_import_src: {
        name: '임포트 그룹',
        memo: null,
        color: 'sun',
        style: 'fill',
        parcelIds: [p1, p2],
      },
    }

    const importRes = await call(
      tabImportHandler,
      'PUT',
      { tabId: tab.tabId },
      { overrides, groups, clientId: CLIENT_ID },
    )
    expect(importRes.status).toBe(200)
    okResponseSchema.parse(importRes.body)

    const state = tabStateResponseSchema.parse(
      (await call(tabStateHandler, 'GET', { tabId: tab.tabId })).body,
    )
    expect(Object.keys(state.overrides).sort()).toEqual([p1, p2].sort())
    expect(state.overrides[p2].memo).toBe('임포트 메모')
    const groupIds = Object.keys(state.groups)
    expect(groupIds).toHaveLength(1)
    expect(groupIds[0]).not.toBe('grp_import_src') // group_id 재생성
    expect(Object.values(state.groups)[0].parcelIds).toEqual([p1, p2])
  })

  it('POST /api/parcels/:id/fetch-land-info — 구현 전 501 + errorResponseSchema', async () => {
    const [p] = await pickParcelIds(1)
    const res = await call(fetchLandInfoHandler, 'POST', { id: p }, { clientId: CLIENT_ID })
    expect(res.status).toBe(501)
    errorResponseSchema.parse(res.body)
  })

  it('404 에러 응답도 errorResponseSchema를 통과한다', async () => {
    const res = await call(tabStateHandler, 'GET', { tabId: 'tab_none_such' })
    expect(res.status).toBe(404)
    errorResponseSchema.parse(res.body)
  })
})
