import { afterAll, describe, expect, it } from 'vitest'
import { staffCollectionHandler, staffItemHandler } from '../../server/handlers/staff'
import { errorResponseSchema, okResponseSchema } from '../../src/types/api/common'
import { staffListResponseSchema, staffSchema } from '../../src/types/api/staff'
import { call, CLIENT_ID, db, getTestToken, issueFreshToken, TEST_USER_ID } from './helpers'

const noAuthCtx = { env: process.env, auth: { token: null } }

/** 테스트가 만든 인력 행을 모두 물리 삭제(전역 공유 — 잔여가 다른 테스트 카운트를 오염시키므로) */
async function purgeStaff(): Promise<void> {
  const { error } = await db.from('staff').delete().neq('staff_id', '')
  if (error) throw new Error(error.message)
}

afterAll(purgeStaff)

describe('AC-1: POST /api/staff — 생성 (active=true·created_by 자동)', () => {
  it('유효 세션으로 생성하면 staffId 부여·active=true·created_by가 인증 사용자', async () => {
    await getTestToken() // TEST_USER_ID 채움
    const res = await call(
      staffCollectionHandler,
      'POST',
      {},
      { name: '  김일꾼  ', phone: '010-1111-2222', role: '트랙터 기사', dailyWage: 120000, memo: '메모', clientId: CLIENT_ID },
    )
    expect(res.status).toBe(200)
    const staff = staffSchema.parse(res.body)
    expect(staff.staffId).toMatch(/^stf_/)
    expect(staff.name).toBe('김일꾼') // trim 정규화
    expect(staff.active).toBe(true)
    expect(staff.dailyWage).toBe(120000)
    expect(staff.createdBy).toBe(TEST_USER_ID)
  })

  it('빈 문자열 phone/role/memo는 null로 정규화된다', async () => {
    const res = await call(
      staffCollectionHandler,
      'POST',
      {},
      { name: '박빈값', phone: '   ', role: '', memo: '', clientId: CLIENT_ID },
    )
    const staff = staffSchema.parse(res.body)
    expect(staff.phone).toBeNull()
    expect(staff.role).toBeNull()
    expect(staff.memo).toBeNull()
    expect(staff.dailyWage).toBeNull()
  })
})

describe('AC-2: GET /api/staff — 기본 활성만 / includeInactive 전량', () => {
  it('active=false 1건은 기본 목록에서 제외되고 includeInactive=true에서 포함', async () => {
    await purgeStaff()
    const a = staffSchema.parse(
      (await call(staffCollectionHandler, 'POST', {}, { name: '활성', clientId: CLIENT_ID })).body,
    )
    const b = staffSchema.parse(
      (await call(staffCollectionHandler, 'POST', {}, { name: '비활성', clientId: CLIENT_ID })).body,
    )
    // b를 소프트 비활성
    await call(staffItemHandler, 'DELETE', { id: b.staffId }, { clientId: CLIENT_ID })

    const token = await getTestToken()
    const defaultRes = await staffCollectionHandler(
      { method: 'GET', params: {}, query: {}, body: undefined },
      { env: process.env, auth: { token } },
    )
    const defaultList = staffListResponseSchema.parse(defaultRes.body)
    expect(defaultList.map((s) => s.staffId)).toContain(a.staffId)
    expect(defaultList.map((s) => s.staffId)).not.toContain(b.staffId)

    const allRes = await staffCollectionHandler(
      { method: 'GET', params: {}, query: { includeInactive: 'true' }, body: undefined },
      { env: process.env, auth: { token } },
    )
    const allList = staffListResponseSchema.parse(allRes.body)
    expect(allList.map((s) => s.staffId)).toEqual(expect.arrayContaining([a.staffId, b.staffId]))
  })
})

describe('AC-3: PATCH /api/staff/:id — 부분 수정 + updatedAt 갱신', () => {
  it('name·dailyWage 변경이 반영되고 updatedAt이 갱신된다', async () => {
    const created = staffSchema.parse(
      (await call(staffCollectionHandler, 'POST', {}, { name: '수정전', dailyWage: 100000, clientId: CLIENT_ID })).body,
    )
    const res = await call(
      staffItemHandler,
      'PATCH',
      { id: created.staffId },
      { name: '수정후', dailyWage: 150000, clientId: CLIENT_ID },
    )
    expect(res.status).toBe(200)
    const updated = staffSchema.parse(res.body)
    expect(updated.name).toBe('수정후')
    expect(updated.dailyWage).toBe(150000)
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime())
  })

  it('존재하지 않는 id PATCH는 404', async () => {
    const res = await call(staffItemHandler, 'PATCH', { id: 'stf_nope' }, { name: 'x', clientId: CLIENT_ID })
    expect(res.status).toBe(404)
    errorResponseSchema.parse(res.body)
  })
})

describe('AC-4 / AC-9: DELETE는 소프트 비활성 + PATCH active=true 재활성화', () => {
  it('DELETE는 행을 보존하고 active=false로 전환, 이후 includeInactive에서만 보인다', async () => {
    await purgeStaff()
    const created = staffSchema.parse(
      (await call(staffCollectionHandler, 'POST', {}, { name: '소프트삭제', clientId: CLIENT_ID })).body,
    )
    const del = await call(staffItemHandler, 'DELETE', { id: created.staffId }, { clientId: CLIENT_ID })
    expect(del.status).toBe(200)
    okResponseSchema.parse(del.body)

    // 행이 물리적으로 남아있는지 직접 확인
    const { data } = await db.from('staff').select('active').eq('staff_id', created.staffId).maybeSingle()
    expect(data).not.toBeNull()
    expect((data as { active: boolean }).active).toBe(false)

    const token = await getTestToken()
    const defaultList = staffListResponseSchema.parse(
      (
        await staffCollectionHandler({ method: 'GET', params: {}, query: {}, body: undefined }, { env: process.env, auth: { token } })
      ).body,
    )
    expect(defaultList.map((s) => s.staffId)).not.toContain(created.staffId)

    // 재활성화(AC-9)
    const reactivate = await call(staffItemHandler, 'PATCH', { id: created.staffId }, { active: true, clientId: CLIENT_ID })
    expect(staffSchema.parse(reactivate.body).active).toBe(true)
    const afterList = staffListResponseSchema.parse(
      (
        await staffCollectionHandler({ method: 'GET', params: {}, query: {}, body: undefined }, { env: process.env, auth: { token } })
      ).body,
    )
    expect(afterList.map((s) => s.staffId)).toContain(created.staffId)
  })

  it('존재하지 않는 id DELETE는 404', async () => {
    const res = await call(staffItemHandler, 'DELETE', { id: 'stf_nope' }, { clientId: CLIENT_ID })
    expect(res.status).toBe(404)
  })
})

describe('AC-5: 무인증 mutate는 401 (행 미기록/미변경)', () => {
  it('무토큰 POST는 401이고 행이 생성되지 않는다', async () => {
    const { count: before } = await db.from('staff').select('staff_id', { count: 'exact', head: true })
    const res = await staffCollectionHandler(
      { method: 'POST', params: {}, query: {}, body: { name: '무인증', clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(res.status).toBe(401)
    errorResponseSchema.parse(res.body)
    const { count: after } = await db.from('staff').select('staff_id', { count: 'exact', head: true })
    expect(after).toBe(before)
  })

  it('무토큰 PATCH·DELETE는 401', async () => {
    const created = staffSchema.parse(
      (await call(staffCollectionHandler, 'POST', {}, { name: '게이트', clientId: CLIENT_ID })).body,
    )
    const patchRes = await staffItemHandler(
      { method: 'PATCH', params: { id: created.staffId }, query: {}, body: { name: 'x', clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(patchRes.status).toBe(401)
    const delRes = await staffItemHandler(
      { method: 'DELETE', params: { id: created.staffId }, query: {}, body: { clientId: CLIENT_ID } },
      noAuthCtx,
    )
    expect(delRes.status).toBe(401)
    // 변경되지 않았는지 확인
    const { data } = await db.from('staff').select('active, name').eq('staff_id', created.staffId).maybeSingle()
    expect((data as { active: boolean; name: string }).active).toBe(true)
    expect((data as { active: boolean; name: string }).name).toBe('게이트')
  })
})

describe('AC-11: 전역 공유 — 다른 세션(user_id) 토큰으로도 같은 목록이 보인다', () => {
  it('A가 만든 인력이 새 세션 토큰 조회에도 그대로 보인다(created_by 격리 없음)', async () => {
    await purgeStaff()
    const created = staffSchema.parse(
      (await call(staffCollectionHandler, 'POST', {}, { name: '공유일꾼', clientId: CLIENT_ID })).body,
    )
    const token2 = await issueFreshToken()
    const res = await staffCollectionHandler(
      { method: 'GET', params: {}, query: {}, body: undefined },
      { env: process.env, auth: { token: token2 } },
    )
    expect(res.status).toBe(200)
    const list = staffListResponseSchema.parse(res.body)
    expect(list.map((s) => s.staffId)).toContain(created.staffId)
  })
})
