import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button, IconButton, Input, Sheet } from '../../components/ui'
import { useWorkspaceStore } from '../../stores/workspace'
import type { CalcRecipe } from '../../types/api/calcRecipes'
import {
  AMOUNT_UNIT_SUGGESTIONS,
  BASE_UNIT_OPTIONS,
  sanitizeDecimalInput,
  toRecipeNumber,
  type CalcBaseUnit,
} from './calc'

/** 숫자 필드는 문자열 draft — trailing dot("1.") 입력 중간 상태 보존 (CONVENTIONS §3, v1 보존) */
interface RecipeDraft {
  id: string
  name: string
  baseArea: string
  baseUnit: CalcBaseUnit
  amount: string
  amountUnit: string
}

function makeDrafts(recipes: CalcRecipe[]): RecipeDraft[] {
  return recipes.map((r) => ({ ...r, baseArea: String(r.baseArea), amount: String(r.amount) }))
}

function toRecipes(drafts: RecipeDraft[]): CalcRecipe[] {
  return drafts.map((d) => ({
    ...d,
    baseArea: toRecipeNumber(d.baseArea),
    amount: toRecipeNumber(d.amount),
  }))
}

const AMOUNT_UNITS_DATALIST_ID = 'calc-amount-units'

export interface CalculatorSettingsSheetProps {
  /** X/backdrop — draft 폐기 (저장 안 함) */
  onClose: () => void
  /** "계산 시작" — 저장 후 호출. 계산기 모드 진입·시트 언마운트는 호출부(App) 소관 */
  onStart: () => void
}

export function CalculatorSettingsSheet({ onClose, onStart }: CalculatorSettingsSheetProps) {
  const saveCalcRecipes = useWorkspaceStore((s) => s.saveCalcRecipes)

  // null = 서버 최신화 대기 — GET 응답으로 스토어 갱신 후 draft 초기화 (명세 §설정 시트)
  const [drafts, setDrafts] = useState<RecipeDraft[] | null>(null)
  useEffect(() => {
    let cancelled = false
    const init = () => {
      if (!cancelled) setDrafts(makeDrafts(useWorkspaceStore.getState().calcRecipes))
    }
    // GET 실패 시에도 스토어의 마지막 값으로 편집을 연다 — 저장(PUT)이 단일 소스를 덮는다
    useWorkspaceStore.getState().loadCalcRecipes().then(init, init)
    return () => {
      cancelled = true
    }
  }, [])

  const update = (id: string, patch: Partial<RecipeDraft>) =>
    setDrafts((prev) => prev?.map((d) => (d.id === id ? { ...d, ...patch } : d)) ?? prev)

  const addRecipe = () =>
    setDrafts((prev) => [
      ...(prev ?? []),
      // v1 addRecipe 기본값 보존 — id만 'r_'+Date.now() → randomUUID 재설계 (동일 ms 충돌 방지)
      {
        id: crypto.randomUUID(),
        name: '',
        baseArea: '300',
        baseUnit: '㎡',
        amount: '0',
        amountUnit: 'L',
      },
    ])

  const removeRecipe = (id: string) => setDrafts((prev) => prev?.filter((d) => d.id !== id) ?? prev)

  const handleSave = () => {
    if (drafts === null) return
    saveCalcRecipes(toRecipes(drafts))
    onClose()
  }

  const handleStart = () => {
    if (drafts === null) return
    saveCalcRecipes(toRecipes(drafts))
    onStart()
  }

  return (
    <Sheet onClose={onClose}>
      <header className="mb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-muted">자동 계산기</p>
          <IconButton icon={X} size="sm" aria-label="닫기" onClick={onClose} />
        </div>
        <p className="mt-1 text-xs text-ink-muted">기준 면적당 투입량을 설정합니다 · 전체 공유</p>
      </header>

      {drafts !== null && (
        <>
          {drafts.length > 0 && (
            <div className="mb-3 flex flex-col gap-3">
              {drafts.map((d) => (
                <div key={d.id} className="flex flex-col gap-2 rounded-md bg-surface-alt p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="자재명"
                      maxLength={12}
                      placeholder="자재명"
                      value={d.name}
                      onChange={(e) => update(d.id, { name: e.target.value })}
                    />
                    <IconButton
                      icon={Trash2}
                      aria-label="항목 삭제"
                      className="shrink-0"
                      onClick={() => removeRecipe(d.id)}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      variant="numeric"
                      aria-label="기준 면적"
                      className="min-w-0 flex-1"
                      value={d.baseArea}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        update(d.id, { baseArea: sanitizeDecimalInput(e.target.value) })
                      }
                    />
                    {/* 기준단위 셀렉트 — 공통 ui에 Select가 없어 feature-local 네이티브 select (Stage 2 재량) */}
                    <select
                      aria-label="기준 단위"
                      className="h-11 shrink-0 rounded-sm border border-border bg-surface px-2 text-[15px] text-ink focus:border-primary focus:outline-none"
                      value={d.baseUnit}
                      onChange={(e) => update(d.id, { baseUnit: e.target.value as CalcBaseUnit })}
                    >
                      {BASE_UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <span className="shrink-0 text-[13px] text-ink-muted">당</span>
                    <Input
                      variant="numeric"
                      aria-label="투입량"
                      className="min-w-0 flex-1"
                      value={d.amount}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        update(d.id, { amount: sanitizeDecimalInput(e.target.value) })
                      }
                    />
                    <span className="w-16 shrink-0">
                      <Input
                        aria-label="투입 단위"
                        maxLength={6}
                        placeholder="단위"
                        list={AMOUNT_UNITS_DATALIST_ID}
                        value={d.amountUnit}
                        onChange={(e) => update(d.id, { amountUnit: e.target.value })}
                      />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <datalist id={AMOUNT_UNITS_DATALIST_ID}>
            {AMOUNT_UNIT_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <Button variant="secondary" full onClick={addRecipe}>
            + 항목 추가
          </Button>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={handleSave}>
              저장
            </Button>
            <Button className="flex-1" onClick={handleStart}>
              계산 시작
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}
