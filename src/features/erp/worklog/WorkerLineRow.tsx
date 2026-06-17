import { Trash2, UserRound } from 'lucide-react'
import { IconButton, Input, SegmentedControl } from '../../../components/ui'
import { sanitizeDecimalInput } from '../../calculator/calc'
import { computeWorkerCost } from '../../../utils/workLogCost'
import { formatWon, RATIO_PRESETS, type WorkerDraft } from './draft'

const fieldLabel = 'mb-1 block text-[12px] font-semibold text-ink-muted'

export interface WorkerLineRowProps {
  draft: WorkerDraft
  /** 일당 문자열 draft 변경 (숫자 정규화는 저장 시점) */
  onWageChange: (wage: string) => void
  /** 근무율 문자열 draft 변경 (프리셋 또는 직접 입력) */
  onRatioChange: (ratio: string) => void
  onRemove: () => void
}

/**
 * 투입 인력 한 줄 — 인력명·일당 오버라이드·근무율(프리셋 SegmentedControl + 직접 입력)·라인 합계·삭제.
 * 일당·근무율은 문자열 draft로 보관해 소수점 중간 상태("1.")를 보존한다(M-10 sanitizeDecimalInput 재사용).
 * 라인 합계 미리보기는 공유 computeWorkerCost(서버 totalCost와 동일 결과, AC-14)로 산출한다.
 */
export function WorkerLineRow({
  draft,
  onWageChange,
  onRatioChange,
  onRemove,
}: WorkerLineRowProps) {
  const wage = Number.parseInt(draft.appliedWage.replace(/[^\d]/g, ''), 10)
  const ratio = parseFloat(draft.workRatio) || 0
  const lineCost = computeWorkerCost(Number.isFinite(wage) ? wage : 0, ratio)
  // 프리셋 매칭 — 직접 입력값이 프리셋(1/0.5/1.5)과 같으면 그 칩을 활성화, 아니면 '직접'
  const presetId = RATIO_PRESETS.find((p) => p.value === ratio)?.id ?? 'custom'

  return (
    <div className="rounded-md border border-border bg-surface-alt p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pro-soft text-pro">
          <UserRound size={15} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
          {draft.staffNameSnapshot}
        </span>
        <span className="shrink-0 font-mono text-[14px] font-bold text-ink">
          {formatWon(lineCost)}
        </span>
        <IconButton icon={Trash2} size="sm" aria-label="인력 삭제" onClick={onRemove} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className={fieldLabel}>일당 (원)</span>
          <Input
            aria-label="일당"
            variant="numeric"
            inputMode="numeric"
            value={draft.appliedWage}
            placeholder="0"
            onChange={(e) => onWageChange(e.target.value.replace(/[^\d]/g, ''))}
          />
        </label>
        <label>
          <span className={fieldLabel}>근무율</span>
          <Input
            aria-label="근무율 직접 입력"
            variant="numeric"
            value={draft.workRatio}
            placeholder="1.0"
            onChange={(e) => onRatioChange(sanitizeDecimalInput(e.target.value))}
          />
        </label>
      </div>

      <SegmentedControl
        size="sm"
        className="mt-2 w-full"
        options={[
          ...RATIO_PRESETS.map((p) => ({ id: p.id, label: p.label })),
          {
            id: 'custom' as const,
            label: '직접',
          },
        ]}
        value={presetId}
        onChange={(id) => {
          const preset = RATIO_PRESETS.find((p) => p.id === id)
          if (preset !== undefined) onRatioChange(String(preset.value))
          // '직접'은 현재 문자열 유지 (사용자 입력 보존)
        }}
      />
    </div>
  )
}
