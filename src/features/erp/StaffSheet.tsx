import { useState } from 'react'
import { X } from 'lucide-react'
import { Button, ConfirmInline, IconButton, Input, Sheet, Textarea } from '../../components/ui'
import { useErpStore } from '../../stores/erp'
import type { Staff } from '../../types/api/staff'

/** 시트 로컬 draft — 저장 버튼 전에는 스토어·서버에 반영되지 않는다 (CONVENTIONS §3) */
interface StaffDraft {
  name: string
  phone: string
  role: string
  /** 일당 — 문자열 draft로 보관해 숫자 변환은 저장 시점에만 (Input numeric 패턴) */
  dailyWage: string
  memo: string
}

function makeDraft(staff: Staff | undefined): StaffDraft {
  return {
    name: staff?.name ?? '',
    phone: staff?.phone ?? '',
    role: staff?.role ?? '',
    dailyWage: staff?.dailyWage != null ? String(staff.dailyWage) : '',
    memo: staff?.memo ?? '',
  }
}

const sectionLabel = 'text-[13px] font-semibold text-ink'
const fieldLabel = 'mb-1 block text-[13px] font-semibold text-ink-muted'

export interface StaffSheetProps {
  /** 편집 대상 — undefined면 신규 생성 */
  staff: Staff | undefined
  onClose: () => void
}

export function StaffSheet({ staff, onClose }: StaffSheetProps) {
  const createStaff = useErpStore((s) => s.createStaff)
  const updateStaff = useErpStore((s) => s.updateStaff)
  const deactivateStaff = useErpStore((s) => s.deactivateStaff)

  const [draft, setDraft] = useState<StaffDraft>(() => makeDraft(staff))

  const isEdit = staff !== undefined
  const nameTrimmed = draft.name.trim()
  const canSave = nameTrimmed.length > 0

  /** 일당 문자열 → 0 이상 정수 또는 null (빈 값·비숫자는 null) */
  function parseWage(raw: string): number | null {
    const digits = raw.replace(/[^\d]/g, '')
    if (digits === '') return null
    const n = Number.parseInt(digits, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const handleSave = () => {
    if (!canSave) return
    // 문자열 정규화(trim, 빈 문자열 → null/undefined) — GroupSheet.handleSave 선례
    if (isEdit) {
      updateStaff(staff.staffId, {
        name: nameTrimmed,
        phone: draft.phone.trim() || null,
        role: draft.role.trim() || null,
        dailyWage: parseWage(draft.dailyWage),
        memo: draft.memo.trim() || null,
      })
    } else {
      const wage = parseWage(draft.dailyWage)
      createStaff({
        name: nameTrimmed,
        phone: draft.phone.trim() || undefined,
        role: draft.role.trim() || undefined,
        dailyWage: wage ?? undefined,
        memo: draft.memo.trim() || undefined,
      })
    }
    onClose()
  }

  const handleDeactivate = () => {
    if (!isEdit) return
    deactivateStaff(staff.staffId)
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">{isEdit ? '인력 수정' : '인력 추가'}</h2>
        <IconButton icon={X} size="sm" aria-label="닫기" onClick={onClose} />
      </header>

      <div className="flex flex-col gap-3">
        <label>
          <span className={fieldLabel}>
            이름 <span className="text-danger">*</span>
          </span>
          <Input
            aria-label="이름"
            value={draft.name}
            placeholder="이름 입력"
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={fieldLabel}>연락처</span>
            <Input
              aria-label="연락처"
              type="tel"
              inputMode="tel"
              value={draft.phone}
              placeholder="010-0000-0000"
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </label>
          <label>
            <span className={fieldLabel}>역할/직종</span>
            <Input
              aria-label="역할/직종"
              value={draft.role}
              placeholder="예: 작업반장"
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
            />
          </label>
        </div>

        <label>
          <span className={fieldLabel}>기본 일당 (원)</span>
          <Input
            aria-label="기본 일당"
            variant="numeric"
            inputMode="numeric"
            value={draft.dailyWage}
            placeholder="0"
            onChange={(e) => setDraft((d) => ({ ...d, dailyWage: e.target.value }))}
          />
        </label>

        <label>
          <span className={sectionLabel}>메모</span>
          <Textarea
            aria-label="메모"
            rows={2}
            className="mt-1"
            value={draft.memo}
            placeholder="메모를 입력하세요"
            onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
          />
        </label>
      </div>

      <Button full className="mt-4" disabled={!canSave} onClick={handleSave}>
        저장
      </Button>
      {isEdit && staff.active && (
        <div className="mt-2 flex justify-center">
          <ConfirmInline label="비활성" confirmLabel="비활성 처리" onConfirm={handleDeactivate} />
        </div>
      )}
    </Sheet>
  )
}
