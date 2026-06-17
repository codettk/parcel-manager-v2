import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../src/lib/api'
import { useErpStore } from '../../../src/stores/erp'
import type { Contact } from '../../../src/types/api/contacts'
import type { Staff } from '../../../src/types/api/staff'

// 명세: docs/specs/erp-staff-contacts.md — 인력·거래처 낙관적 CRUD (AC-12~14 프론트분)
vi.mock('../../../src/lib/api', () => ({
  api: {
    staff: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    contacts: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}))

const NOW = '2026-06-16T00:00:00.000Z'

function makeStaff(staffId: string, name: string, active = true): Staff {
  return {
    staffId,
    name,
    phone: null,
    role: null,
    dailyWage: null,
    memo: null,
    active,
    createdBy: 'user-a',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeContact(contactId: string, name: string, active = true): Contact {
  return {
    contactId,
    name,
    manager: null,
    phone: null,
    kind: 'buy',
    memo: null,
    active,
    createdBy: 'user-a',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

const staffApi = vi.mocked(api.staff)
const contactsApi = vi.mocked(api.contacts)

beforeEach(() => {
  useErpStore.setState(useErpStore.getInitialState(), true)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('erp store — 인력', () => {
  it('loadStaff는 비활성 포함 전량을 조회해 저장한다 (토글 시 재조회 불필요)', async () => {
    const rows = [makeStaff('s1', '김씨'), makeStaff('s2', '이씨', false)]
    staffApi.list.mockResolvedValue(rows)

    await useErpStore.getState().loadStaff()

    expect(staffApi.list).toHaveBeenCalledWith(true)
    expect(useErpStore.getState().staff).toEqual(rows)
  })

  it('createStaff는 임시 행을 즉시 추가하고(낙관) 서버 응답으로 교체한다', async () => {
    const saved = makeStaff('s-real', '정복구')
    let resolveCreate: (v: Staff) => void = () => {}
    staffApi.create.mockReturnValue(
      new Promise<Staff>((resolve) => {
        resolveCreate = resolve
      }),
    )

    const p = useErpStore.getState().createStaff({ name: '정복구', dailyWage: 150000 })

    // 서버 응답 전에도 목록에 즉시 나타난다 (AC-13)
    const optimistic = useErpStore.getState().staff
    expect(optimistic).toHaveLength(1)
    expect(optimistic[0].name).toBe('정복구')
    expect(optimistic[0].dailyWage).toBe(150000)
    expect(optimistic[0].active).toBe(true)
    expect(optimistic[0].staffId).not.toBe('s-real')

    resolveCreate(saved)
    await p

    const after = useErpStore.getState().staff
    expect(after).toHaveLength(1)
    expect(after[0]).toEqual(saved) // 임시 행이 서버 id로 교체됨
  })

  it('createStaff 실패 시 낙관 추가를 유지한다 (롤백 없음 — v2 보존)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    staffApi.create.mockRejectedValue(new Error('boom'))

    await useErpStore.getState().createStaff({ name: '실패씨' })

    expect(useErpStore.getState().staff).toHaveLength(1)
    expect(useErpStore.getState().staff[0].name).toBe('실패씨')
  })

  it('updateStaff는 필드를 낙관적으로 병합하고 서버 응답으로 교체한다', async () => {
    useErpStore.setState({ staff: [makeStaff('s1', '구이름')] })
    const saved = { ...makeStaff('s1', '새이름'), dailyWage: 200000 }
    staffApi.update.mockResolvedValue(saved)

    const p = useErpStore.getState().updateStaff('s1', { name: '새이름', dailyWage: 200000 })

    // 낙관 병합 — 응답 전 즉시 반영
    expect(useErpStore.getState().staff[0].name).toBe('새이름')
    expect(useErpStore.getState().staff[0].dailyWage).toBe(200000)

    await p
    expect(useErpStore.getState().staff[0]).toEqual(saved)
    expect(staffApi.update).toHaveBeenCalledWith('s1', { name: '새이름', dailyWage: 200000 })
  })

  it('deactivateStaff는 active=false로 낙관 전환 후 DELETE한다 (소프트 비활성, AC-14)', async () => {
    useErpStore.setState({ staff: [makeStaff('s1', '퇴사씨')] })
    staffApi.remove.mockResolvedValue({ ok: true })

    const p = useErpStore.getState().deactivateStaff('s1')

    // 즉시 비활성 — active 필터 뷰에서 사라진다 (행은 보존)
    expect(useErpStore.getState().staff[0].active).toBe(false)
    expect(useErpStore.getState().staff).toHaveLength(1)

    await p
    expect(staffApi.remove).toHaveBeenCalledWith('s1')
  })

  it('updateStaff active=true로 재활성화한다 (AC-14)', async () => {
    useErpStore.setState({ staff: [makeStaff('s1', '복귀씨', false)] })
    staffApi.update.mockResolvedValue(makeStaff('s1', '복귀씨', true))

    await useErpStore.getState().updateStaff('s1', { active: true })

    expect(useErpStore.getState().staff[0].active).toBe(true)
  })

  it('includeInactive 토글 상태를 보관한다 (active 필터 — 뷰 소관)', () => {
    expect(useErpStore.getState().includeInactive).toBe(false)
    useErpStore.getState().setIncludeInactive(true)
    expect(useErpStore.getState().includeInactive).toBe(true)
  })
})

describe('erp store — 거래처', () => {
  it('loadContacts는 비활성 포함 전량을 조회한다', async () => {
    const rows = [makeContact('c1', '대농비료'), makeContact('c2', '끊긴거래처', false)]
    contactsApi.list.mockResolvedValue(rows)

    await useErpStore.getState().loadContacts()

    expect(contactsApi.list).toHaveBeenCalledWith(true)
    expect(useErpStore.getState().contacts).toEqual(rows)
  })

  it('createContact는 kind와 함께 낙관 추가 후 서버 응답으로 교체한다 (AC-13)', async () => {
    const saved = { ...makeContact('c-real', '보구상회'), kind: 'sell' as const }
    contactsApi.create.mockResolvedValue(saved)

    const p = useErpStore.getState().createContact({ name: '보구상회', kind: 'sell' })

    const optimistic = useErpStore.getState().contacts
    expect(optimistic).toHaveLength(1)
    expect(optimistic[0].name).toBe('보구상회')
    expect(optimistic[0].kind).toBe('sell')
    expect(optimistic[0].active).toBe(true)

    await p
    expect(useErpStore.getState().contacts[0]).toEqual(saved)
  })

  it('updateContact는 kind 변경을 낙관 병합한다', async () => {
    useErpStore.setState({ contacts: [makeContact('c1', '거래처')] })
    contactsApi.update.mockResolvedValue({ ...makeContact('c1', '거래처'), kind: 'both' })

    const p = useErpStore.getState().updateContact('c1', { kind: 'both' })
    expect(useErpStore.getState().contacts[0].kind).toBe('both')

    await p
    expect(useErpStore.getState().contacts[0].kind).toBe('both')
  })

  it('deactivateContact는 active=false 낙관 전환 후 DELETE한다', async () => {
    useErpStore.setState({ contacts: [makeContact('c1', '거래처')] })
    contactsApi.remove.mockResolvedValue({ ok: true })

    const p = useErpStore.getState().deactivateContact('c1')
    expect(useErpStore.getState().contacts[0].active).toBe(false)

    await p
    expect(contactsApi.remove).toHaveBeenCalledWith('c1')
  })
})
