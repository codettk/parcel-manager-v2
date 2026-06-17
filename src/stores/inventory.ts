import { create } from 'zustand'
import { api } from '../lib/api'
import { computeBalances, type StockMovement } from '../utils/stockBalance'
import type { InventoryItem } from '../types/api/inventoryItems'
import type { InventoryTransaction, StockTxnType } from '../types/api/inventoryTransactions'

/**
 * 영농 ERP 재고 스토어 (슬라이스 5c).
 * 전역 공유 단일 테이블(절충 0·5a 일관) — 뷰/시트 열 때 단발 fetch + 낙관적 CRUD(롤백 없음, 절충 0).
 * 품목 마스터(items)·거래 원장(transactions)을 보유하고, 현재고는 저장하지 않고
 * computeBalances(공유 순수 모듈)로 거래 합산 파생한다(절충 1 — 거래 삭제 시 현재고 자동 감소).
 * 거래처 상호(5a useErpStore.contacts)·품목명/단위는 시트 picker·서버가 스냅샷한다 — 이 스토어는 재고만.
 * 시트 내부 편집은 시트 로컬 draft가 담당하고, 저장 시점에만 아래 액션으로 커밋한다(CONVENTIONS §3).
 */

/** 거래 목록 필터 — 미설정이면 전체. 뷰가 itemId·from~to draft를 정규화해 넘긴다 */
export interface TxnFilter {
  itemId?: string
  from?: string
  to?: string
}

/** 품목 생성 입력 — 시트 draft가 정규화(trim, 빈 문자열 → undefined)해 넘긴다 */
export interface ItemCreateInput {
  name: string
  unit: string
  category?: string
  memo?: string
}

/** 품목 수정 입력 — null이면 값 비움, undefined면 무변경. active=true는 재활성화 */
export interface ItemUpdateInput {
  name?: string
  unit?: string
  category?: string | null
  memo?: string | null
  active?: boolean
}

/** 거래 생성 입력 — 스냅샷·amount는 서버가 채우므로 제외(절충 3). 낙관 표시는 스토어가 스냅샷 보강 */
export interface TxnCreateInput {
  itemId: string
  type: StockTxnType
  quantity: number
  txnDate: string
  contactId?: string
  unitPrice?: number
  memo?: string
}

export interface InventoryState {
  /** 서버 동기화 품목 목록 (활성+비활성 전부 — 뷰가 includeInactive 토글로 필터) */
  items: InventoryItem[]
  /** 서버 동기화 거래 목록 — 거래일 내림차순. 현재고 합산·이력의 단일 소스 */
  transactions: InventoryTransaction[]
  /** 비활성 포함 보기 — 품목 목록 뷰 필터 (세션 한정, 영속 아님) */
  includeInactive: boolean
  setIncludeInactive: (flag: boolean) => void

  /** 품목 목록 로드 — 비활성 포함 전량 조회(토글 시 재조회 불필요) */
  loadItems: () => Promise<void>
  /** 품목 생성 — 낙관적 추가(임시 행) 후 서버 응답으로 교체 */
  createItem: (input: ItemCreateInput) => Promise<void>
  /** 품목 수정 — 낙관적 병합 후 서버 응답으로 교체 (재활성화는 active=true) */
  updateItem: (itemId: string, input: ItemUpdateInput) => Promise<void>
  /** 품목 소프트 비활성 — 낙관적 active=false 후 DELETE (롤백 없음) */
  deactivateItem: (itemId: string) => Promise<void>

  /** 거래 목록 로드 — itemId·기간 필터. 실패해도 기존 목록 유지(낙관 패턴) */
  loadTransactions: (filter?: TxnFilter) => Promise<void>
  /**
   * 거래 생성 — 낙관적 추가(임시 행) 후 서버 응답으로 교체 + 거래일순 재정렬.
   * 스냅샷(품목명·단위·거래처 상호)·amount는 서버 권위 — 낙관 표시용으로만 보강한다.
   */
  createTransaction: (
    input: TxnCreateInput,
    snapshot: {
      itemName: string
      unit: string
      contactName: string | null
    },
  ) => Promise<void>
  /** 거래 하드 삭제 — 낙관적 제거 후 DELETE (롤백 없음). 현재고는 selectBalances 파생이라 자동 감소 */
  deleteTransaction: (txnId: string) => Promise<void>
}

/** 낙관적 임시 행 id — 서버 응답이 진짜 id로 교체한다 (충돌 회피용 접두) */
function tempId(prefix: string): string {
  return `${prefix}-optimistic-${crypto.randomUUID()}`
}

const NOW_ISO = () => new Date().toISOString()

/** 거래일 내림차순(최신 우선) — 동률은 createdAt 내림차순으로 안정화 (서버 정렬 동형) */
function sortByDateDesc(list: InventoryTransaction[]): InventoryTransaction[] {
  return [...list].sort((a, b) => {
    if (a.txnDate !== b.txnDate) return a.txnDate < b.txnDate ? 1 : -1
    return a.createdAt < b.createdAt ? 1 : -1
  })
}

export const useInventoryStore = create<InventoryState>()((set, get) => ({
  items: [],
  transactions: [],
  includeInactive: false,
  setIncludeInactive: (flag) => set({ includeInactive: flag }),

  loadItems: async () => {
    // 비활성 포함 전량을 받아 두고 뷰가 토글로 거른다 — 토글 시 재조회 불필요
    const list = await api.inventoryItems.list(true)
    set({ items: list })
  },

  createItem: async (input) => {
    const id = tempId('inv')
    const now = NOW_ISO()
    const optimistic: InventoryItem = {
      itemId: id,
      name: input.name,
      unit: input.unit,
      category: input.category ?? null,
      memo: input.memo ?? null,
      active: true,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    }
    set({ items: [optimistic, ...get().items] })
    try {
      const saved = await api.inventoryItems.create(input)
      set({ items: get().items.map((i) => (i.itemId === id ? saved : i)) })
    } catch (err) {
      // 낙관 유지(롤백 없음) — 다음 loadItems가 서버와 정합한다
      if (import.meta.env.DEV) console.error('[inventory] 품목 생성 실패:', err)
    }
  },

  updateItem: async (itemId, input) => {
    set({
      items: get().items.map((i) =>
        i.itemId === itemId
          ? {
              ...i,
              ...(input.name !== undefined && { name: input.name }),
              ...(input.unit !== undefined && { unit: input.unit }),
              ...(input.category !== undefined && { category: input.category }),
              ...(input.memo !== undefined && { memo: input.memo }),
              ...(input.active !== undefined && { active: input.active }),
              updatedAt: NOW_ISO(),
            }
          : i,
      ),
    })
    try {
      const saved = await api.inventoryItems.update(itemId, input)
      set({ items: get().items.map((i) => (i.itemId === itemId ? saved : i)) })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[inventory] 품목 수정 실패:', err)
    }
  },

  deactivateItem: async (itemId) => {
    set({
      items: get().items.map((i) =>
        i.itemId === itemId ? { ...i, active: false, updatedAt: NOW_ISO() } : i,
      ),
    })
    try {
      await api.inventoryItems.remove(itemId)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[inventory] 품목 비활성 실패:', err)
    }
  },

  loadTransactions: async (filter) => {
    const list = await api.stockTransactions.list(filter)
    set({ transactions: sortByDateDesc(list) })
  },

  createTransaction: async (input, snapshot) => {
    const id = tempId('stx')
    const now = NOW_ISO()
    // 금액은 서버 권위(quantity × unitPrice) — 낙관 표시용으로 동형 산출(단가 없으면 null)
    const amount =
      input.unitPrice !== undefined ? Math.round(input.quantity * input.unitPrice) : null
    const optimistic: InventoryTransaction = {
      txnId: id,
      itemId: input.itemId,
      itemNameSnapshot: snapshot.itemName,
      unitSnapshot: snapshot.unit,
      type: input.type,
      quantity: input.quantity,
      txnDate: input.txnDate,
      contactId: input.contactId ?? null,
      contactNameSnapshot: snapshot.contactName,
      unitPrice: input.unitPrice ?? null,
      amount,
      memo: input.memo ?? null,
      createdBy: null,
      createdAt: now,
    }
    set({ transactions: sortByDateDesc([optimistic, ...get().transactions]) })
    try {
      const saved = await api.stockTransactions.create(input)
      set({
        transactions: sortByDateDesc(
          get().transactions.map((t) => (t.txnId === id ? saved : t)),
        ),
      })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[inventory] 거래 생성 실패:', err)
    }
  },

  deleteTransaction: async (txnId) => {
    set({ transactions: get().transactions.filter((t) => t.txnId !== txnId) })
    try {
      await api.stockTransactions.remove(txnId)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[inventory] 거래 삭제 실패:', err)
    }
  },
}))

/**
 * 품목별 현재고 맵 셀렉터 — itemId → 현재고. computeBalances(공유 순수 모듈)로 거래 합산 파생(절충 1).
 * 별도 상태 저장 금지 — 거래 변경 시 자동 정합(거래 삭제 → 현재고 즉시 감소).
 * 거래의 quantity·type만 movement로 투영한다(stockBalance.StockMovement 동형).
 */
export function selectBalances(transactions: readonly InventoryTransaction[]): Record<string, number> {
  const movements: StockMovement[] = transactions.map((t) => ({
    itemId: t.itemId,
    type: t.type,
    quantity: t.quantity,
  }))
  return computeBalances(movements)
}
