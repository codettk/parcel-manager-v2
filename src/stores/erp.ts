import { create } from 'zustand'
import { api } from '../lib/api'
import type { Contact, ContactKind } from '../types/api/contacts'
import type { Staff } from '../types/api/staff'

/**
 * 영농 ERP 인력·거래처 마스터 스토어 (슬라이스 5a).
 * 전역 공유 단일 테이블(절충 1) — 뷰/시트 열 때 단발 fetch + 낙관적 CRUD(롤백 없음 — v2 보존, 절충 3).
 * 삭제는 소프트 비활성(active=false, 절충 4) — 행은 보존되고 비활성 포함 토글로 재활성화한다.
 * 시트 내부 편집은 시트 로컬 draft가 담당하고, 저장 시점에만 아래 액션으로 커밋한다(CONVENTIONS §3).
 */

/** 생성 입력 — 시트 draft가 정규화(trim, 빈 문자열 → undefined)해 넘긴다 */
export interface StaffCreateInput {
  name: string
  phone?: string
  role?: string
  dailyWage?: number
  memo?: string
}

/** 수정 입력 — null이면 값 비움, undefined면 무변경. active=true는 재활성화 */
export interface StaffUpdateInput {
  name?: string
  phone?: string | null
  role?: string | null
  dailyWage?: number | null
  memo?: string | null
  active?: boolean
}

export interface ContactCreateInput {
  name: string
  manager?: string
  phone?: string
  kind: ContactKind
  memo?: string
}

export interface ContactUpdateInput {
  name?: string
  manager?: string | null
  phone?: string | null
  kind?: ContactKind
  memo?: string | null
  active?: boolean
}

export interface ErpState {
  /** 서버 동기화 인력 목록 (활성+비활성 전부 — 뷰가 includeInactive 토글로 필터) */
  staff: Staff[]
  /** 서버 동기화 거래처 목록 (활성+비활성 전부) */
  contacts: Contact[]
  /** 비활성 포함 보기 — 인력·거래처 공용 뷰 필터 (세션 한정, 영속 아님) */
  includeInactive: boolean
  setIncludeInactive: (flag: boolean) => void

  /** 인력 목록 로드 — 비활성 포함 전량 조회 후 active 필터는 셀렉터/뷰 소관 */
  loadStaff: () => Promise<void>
  /** 인력 생성 — 낙관적 추가(임시 행) 후 서버 응답으로 교체 */
  createStaff: (input: StaffCreateInput) => Promise<void>
  /** 인력 수정 — 낙관적 병합 후 서버 응답으로 교체 (재활성화는 active=true) */
  updateStaff: (staffId: string, input: StaffUpdateInput) => Promise<void>
  /** 인력 소프트 비활성 — 낙관적 active=false 후 DELETE (롤백 없음) */
  deactivateStaff: (staffId: string) => Promise<void>

  loadContacts: () => Promise<void>
  createContact: (input: ContactCreateInput) => Promise<void>
  updateContact: (contactId: string, input: ContactUpdateInput) => Promise<void>
  deactivateContact: (contactId: string) => Promise<void>
}

/** 낙관적 임시 행 id — 서버 응답이 진짜 id로 교체한다 (충돌 회피용 접두) */
function tempId(prefix: string): string {
  return `${prefix}-optimistic-${crypto.randomUUID()}`
}

const NOW_ISO = () => new Date().toISOString()

export const useErpStore = create<ErpState>()((set, get) => ({
  staff: [],
  contacts: [],
  includeInactive: false,
  setIncludeInactive: (flag) => set({ includeInactive: flag }),

  loadStaff: async () => {
    // 비활성 포함 전량을 받아 두고 뷰가 토글로 거른다 — 토글 시 재조회 불필요
    const list = await api.staff.list(true)
    set({ staff: list })
  },

  createStaff: async (input) => {
    const id = tempId('staff')
    const now = NOW_ISO()
    const optimistic: Staff = {
      staffId: id,
      name: input.name,
      phone: input.phone ?? null,
      role: input.role ?? null,
      dailyWage: input.dailyWage ?? null,
      memo: input.memo ?? null,
      active: true,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    }
    set({ staff: [optimistic, ...get().staff] })
    try {
      const saved = await api.staff.create(input)
      set({ staff: get().staff.map((s) => (s.staffId === id ? saved : s)) })
    } catch (err) {
      // 낙관 유지(롤백 없음 — v2 보존). 다음 loadStaff가 서버와 정합한다
      if (import.meta.env.DEV) console.error('[erp] 인력 생성 실패:', err)
    }
  },

  updateStaff: async (staffId, input) => {
    set({
      staff: get().staff.map((s) =>
        s.staffId === staffId
          ? {
              ...s,
              ...(input.name !== undefined && { name: input.name }),
              ...(input.phone !== undefined && { phone: input.phone }),
              ...(input.role !== undefined && { role: input.role }),
              ...(input.dailyWage !== undefined && { dailyWage: input.dailyWage }),
              ...(input.memo !== undefined && { memo: input.memo }),
              ...(input.active !== undefined && { active: input.active }),
              updatedAt: NOW_ISO(),
            }
          : s,
      ),
    })
    try {
      const saved = await api.staff.update(staffId, input)
      set({ staff: get().staff.map((s) => (s.staffId === staffId ? saved : s)) })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[erp] 인력 수정 실패:', err)
    }
  },

  deactivateStaff: async (staffId) => {
    set({
      staff: get().staff.map((s) =>
        s.staffId === staffId ? { ...s, active: false, updatedAt: NOW_ISO() } : s,
      ),
    })
    try {
      await api.staff.remove(staffId)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[erp] 인력 비활성 실패:', err)
    }
  },

  loadContacts: async () => {
    const list = await api.contacts.list(true)
    set({ contacts: list })
  },

  createContact: async (input) => {
    const id = tempId('contact')
    const now = NOW_ISO()
    const optimistic: Contact = {
      contactId: id,
      name: input.name,
      manager: input.manager ?? null,
      phone: input.phone ?? null,
      kind: input.kind,
      memo: input.memo ?? null,
      active: true,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    }
    set({ contacts: [optimistic, ...get().contacts] })
    try {
      const saved = await api.contacts.create(input)
      set({ contacts: get().contacts.map((c) => (c.contactId === id ? saved : c)) })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[erp] 거래처 생성 실패:', err)
    }
  },

  updateContact: async (contactId, input) => {
    set({
      contacts: get().contacts.map((c) =>
        c.contactId === contactId
          ? {
              ...c,
              ...(input.name !== undefined && { name: input.name }),
              ...(input.manager !== undefined && { manager: input.manager }),
              ...(input.phone !== undefined && { phone: input.phone }),
              ...(input.kind !== undefined && { kind: input.kind }),
              ...(input.memo !== undefined && { memo: input.memo }),
              ...(input.active !== undefined && { active: input.active }),
              updatedAt: NOW_ISO(),
            }
          : c,
      ),
    })
    try {
      const saved = await api.contacts.update(contactId, input)
      set({ contacts: get().contacts.map((c) => (c.contactId === contactId ? saved : c)) })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[erp] 거래처 수정 실패:', err)
    }
  },

  deactivateContact: async (contactId) => {
    set({
      contacts: get().contacts.map((c) =>
        c.contactId === contactId ? { ...c, active: false, updatedAt: NOW_ISO() } : c,
      ),
    })
    try {
      await api.contacts.remove(contactId)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[erp] 거래처 비활성 실패:', err)
    }
  },
}))
