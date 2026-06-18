import { z } from 'zod'
import { mutationBodySchema } from './common.js'

/** 거래 유형 — 입고(in)/출고(out) */
export const stockTxnTypeSchema = z.enum(['in', 'out'])
export type StockTxnType = z.infer<typeof stockTxnTypeSchema>

/** YYYY-MM-DD 거래일 */
const txnDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식')

/**
 * 재고 입·출고 거래 — `inventory_transactions` 행의 API 표현 (원장, append-only).
 * 품목명·단위·거래처 상호 + 거래시점 단가/금액을 **스냅샷**(5b 철학 — 마스터 변경/비활성에 소급 안 됨, AC-13·14).
 * 단, 수량/현재고는 스냅샷 아님 — 살아있는 합산 파생(거래 삭제 시 현재고 감소가 정상, 절충 3).
 * 전역 공유 + createdBy. 수정 없음(생성·하드삭제만, 절충 5).
 */
export const inventoryTransactionSchema = z.object({
  txnId: z.string(),
  itemId: z.string(),
  /** 거래시점 품목명 스냅샷 */
  itemNameSnapshot: z.string(),
  /** 거래시점 단위 스냅샷 */
  unitSnapshot: z.string(),
  type: stockTxnTypeSchema,
  /** 수량 — 양수(유형이 부호를 결정) */
  quantity: z.number().positive(),
  txnDate: txnDateSchema,
  /** 연결 거래처 (선택, nullable) — 5a contacts 참조 */
  contactId: z.string().nullable(),
  /** 거래시점 거래처 상호 스냅샷 (미연결이면 null) */
  contactNameSnapshot: z.string().nullable(),
  /** 단가(원/단위, 선택) */
  unitPrice: z.number().int().nonnegative().nullable(),
  /** 금액(원) = quantity × unitPrice — 서버 계산. unitPrice 없으면 null */
  amount: z.number().int().nonnegative().nullable(),
  memo: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
})
export type InventoryTransaction = z.infer<typeof inventoryTransactionSchema>

/**
 * GET /api/inventory/transactions — 거래일 내림차순.
 * `?itemId=`(품목별 이력)·`?from=&to=`(기간) 필터 (AC-10).
 */
export const inventoryTransactionListResponseSchema = z.array(inventoryTransactionSchema)
export type InventoryTransactionListResponse = z.infer<typeof inventoryTransactionListResponseSchema>

/**
 * POST /api/inventory/transactions — 생성 (requireUser, AC-8).
 * 서버가 itemId로 품목명·단위를, contactId(있으면)로 거래처 상호를 스냅샷하고 amount를 계산한다.
 * 거래처 연결은 선택 — 유형 정합(in↔buy)을 강제하지 않는다(절충 2, AC-9).
 */
export const createInventoryTransactionRequestSchema = mutationBodySchema.extend({
  itemId: z.string(),
  type: stockTxnTypeSchema,
  quantity: z.number().positive(),
  txnDate: txnDateSchema,
  contactId: z.string().optional(),
  unitPrice: z.number().int().nonnegative().optional(),
  memo: z.string().optional(),
})
export type CreateInventoryTransactionRequest = z.infer<
  typeof createInventoryTransactionRequestSchema
>

/** DELETE /api/inventory/transactions/:id — 하드 삭제(원장 append-only, 수정 없음). 응답 okResponse (AC-11) */
export const deleteInventoryTransactionRequestSchema = mutationBodySchema
export type DeleteInventoryTransactionRequest = z.infer<
  typeof deleteInventoryTransactionRequestSchema
>
