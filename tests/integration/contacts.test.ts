import { afterAll, describe, expect, it } from 'vitest'
import { contactsCollectionHandler, contactsItemHandler } from '../../server/handlers/contacts'
import { errorResponseSchema } from '../../src/types/api/common'
import { contactListResponseSchema, contactSchema } from '../../src/types/api/contacts'
import { call, CLIENT_ID, db, getTestToken, issueFreshToken, TEST_USER_ID } from './helpers'

const noAuthCtx = { env: process.env, auth: { token: null } }

/** 테스트가 만든 거래처 행을 모두 물리 삭제(전역 공유 — 잔여가 카운트를 오염시키므로) */
async function purgeContacts(): Promise<void> {
  const { error } = await db.from('contacts').delete().neq('contact_id', '')
  if (error) throw new Error(error.message)
}

afterAll(purgeContacts)

describe('AC-6: POST /api/contacts — 생성 (kind 반영·active=true·created_by 자동)', () => {
  it('유효 세션으로 생성하면 contactId 부여·kind 반영·active=true·created_by가 인증 사용자', async () => {
    await getTestToken()
    const res = await call(
      contactsCollectionHandler,
      'POST',
      {},
      { name: '  종묘상  ', manager: '이담당', phone: '02-1234-5678', kind: 'buy', memo: 'm', clientId: CLIENT_ID },
    )
    expect(res.status).toBe(200)
    const contact = contactSchema.parse(res.body)
    expect(contact.contactId).toMatch(/^cnt_/)
    expect(contact.name).toBe('종묘상') // trim
    expect(contact.kind).toBe('buy')
    expect(contact.active).toBe(true)
    expect(contact.createdBy).toBe(TEST_USER_ID)
  })

  it('빈 문자열 manager/phone/memo는 null로 정규화된다', async () => {
    const res = await call(
      contactsCollectionHandler,
      'POST',
      {},
      { name: '빈값상회', manager: '  ', phone: '', kind: 'both', memo: '', clientId: CLIENT_ID },
    )
    const contact = contactSchema.parse(res.body)
    expect(contact.manager).toBeNull()
    expect(contact.phone).toBeNull()
    expect(contact.memo).toBeNull()
  })
})

describe('AC-7: 잘못된 kind는 zod enum 400 (행 미생성)', () => {
  it('kind="xyz" 생성은 400이고 행이 생성되지 않는다', async () => {
    const { count: before } = await db.from('contacts').select('contact_id', { count: 'exact', head: true })
    const res = await call(
      contactsCollectionHandler,
      'POST',
      {},
      { name: '잘못된구분', kind: 'xyz', clientId: CLIENT_ID },
    )
    expect(res.status).toBe(400)
    errorResponseSchema.parse(res.body)
    const { count: after } = await db.from('contacts').select('contact_id', { count: 'exact', head: true })
    expect(after).toBe(before)
  })
})

describe('AC-8: GET /api/contacts — 기본 활성만 / includeInactive 전량', () => {
  it('active=false 1건은 기본 목록에서 제외되고 includeInactive=true에서 포함', async () => {
    await purgeContacts()
    const a = contactSchema.parse(
      (await call(contactsCollectionHandler, 'POST', {}, { name: '활성처', kind: 'sell', clientId: CLIENT_ID })).body,
    )
    const b = contactSchema.parse(
      (await call(contactsCollectionHandler, 'POST', {}, { name: '비활성처', kind: 'sell', clientId: CLIENT_ID })).body,
    )
    await call(contactsItemHandler, 'DELETE', { id: b.contactId }, { clientId: CLIENT_ID })

    const token = await getTestToken()
    const defaultList = contactListResponseSchema.parse(
      (
        await contactsCollectionHandler({ method: 'GET', params: {}, query: {}, body: undefined }, { env: process.env, auth: { token } })
      ).body,
    )
    expect(defaultList.map((c) => c.contactId)).toContain(a.contactId)
    expect(defaultList.map((c) => c.contactId)).not.toContain(b.contactId)

    const allList = contactListResponseSchema.parse(
      (
        await contactsCollectionHandler(
          { method: 'GET', params: {}, query: { includeInactive: 'true' }, body: undefined },
          { env: process.env, auth: { token } },
        )
      ).body,
    )
    expect(allList.map((c) => c.contactId)).toEqual(expect.arrayContaining([a.contactId, b.contactId]))
  })
})

describe('AC-9: PATCH active=true 재활성화 (소프트삭제 행 복귀)', () => {
  it('DELETE로 비활성된 거래처에 active=true PATCH 시 기본 목록에 다시 포함된다', async () => {
    await purgeContacts()
    const created = contactSchema.parse(
      (await call(contactsCollectionHandler, 'POST', {}, { name: '복귀처', kind: 'both', clientId: CLIENT_ID })).body,
    )
    await call(contactsItemHandler, 'DELETE', { id: created.contactId }, { clientId: CLIENT_ID })
    // 행 보존 확인
    const { data } = await db.from('contacts').select('active').eq('contact_id', created.contactId).maybeSingle()
    expect((data as { active: boolean }).active).toBe(false)

    const reactivate = await call(
      contactsItemHandler,
      'PATCH',
      { id: created.contactId },
      { active: true, clientId: CLIENT_ID },
    )
    expect(reactivate.status).toBe(200)
    expect(contactSchema.parse(reactivate.body).active).toBe(true)

    const token = await getTestToken()
    const list = contactListResponseSchema.parse(
      (
        await contactsCollectionHandler({ method: 'GET', params: {}, query: {}, body: undefined }, { env: process.env, auth: { token } })
      ).body,
    )
    expect(list.map((c) => c.contactId)).toContain(created.contactId)
  })

  it('PATCH로 kind 변경(both→buy)이 반영된다', async () => {
    const created = contactSchema.parse(
      (await call(contactsCollectionHandler, 'POST', {}, { name: '구분변경', kind: 'both', clientId: CLIENT_ID })).body,
    )
    const res = await call(contactsItemHandler, 'PATCH', { id: created.contactId }, { kind: 'buy', clientId: CLIENT_ID })
    expect(contactSchema.parse(res.body).kind).toBe('buy')
  })

  it('PATCH로 잘못된 kind는 400', async () => {
    const created = contactSchema.parse(
      (await call(contactsCollectionHandler, 'POST', {}, { name: '잘못수정', kind: 'buy', clientId: CLIENT_ID })).body,
    )
    const res = await call(contactsItemHandler, 'PATCH', { id: created.contactId }, { kind: 'nope', clientId: CLIENT_ID })
    expect(res.status).toBe(400)
  })
})

describe('AC-10: 무인증 mutate는 401 (행 미변경)', () => {
  it('무토큰 POST는 401이고 행이 생성되지 않는다', async () => {
    const { count: before } = await db.from('contacts').select('contact_id', { count: 'exact', head: true })
    const res = await contactsCollectionHandler(
      { method: 'POST', params: {}, query: {}, body: { name: '무인증처', kind: 'buy', clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(res.status).toBe(401)
    errorResponseSchema.parse(res.body)
    const { count: after } = await db.from('contacts').select('contact_id', { count: 'exact', head: true })
    expect(after).toBe(before)
  })

  it('무토큰 PATCH·DELETE는 401이고 행이 변경되지 않는다', async () => {
    const created = contactSchema.parse(
      (await call(contactsCollectionHandler, 'POST', {}, { name: '게이트처', kind: 'sell', clientId: CLIENT_ID })).body,
    )
    const patchRes = await contactsItemHandler(
      { method: 'PATCH', params: { id: created.contactId }, query: {}, body: { name: 'x', clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(patchRes.status).toBe(401)
    const delRes = await contactsItemHandler(
      { method: 'DELETE', params: { id: created.contactId }, query: {}, body: { clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(delRes.status).toBe(401)
    const { data } = await db.from('contacts').select('active, name').eq('contact_id', created.contactId).maybeSingle()
    expect((data as { active: boolean; name: string }).active).toBe(true)
    expect((data as { active: boolean; name: string }).name).toBe('게이트처')
  })
})

describe('AC-11: 전역 공유 — 다른 세션 토큰으로도 같은 거래처 목록이 보인다', () => {
  it('A가 만든 거래처가 새 세션 토큰 조회에도 그대로 보인다(created_by 격리 없음)', async () => {
    await purgeContacts()
    const created = contactSchema.parse(
      (await call(contactsCollectionHandler, 'POST', {}, { name: '공유처', kind: 'both', clientId: CLIENT_ID })).body,
    )
    const token2 = await issueFreshToken()
    const res = await contactsCollectionHandler(
      { method: 'GET', params: {}, query: {}, body: undefined },
      { env: process.env, auth: { token: token2 } },
    )
    expect(res.status).toBe(200)
    const list = contactListResponseSchema.parse(res.body)
    expect(list.map((c) => c.contactId)).toContain(created.contactId)
  })
})
