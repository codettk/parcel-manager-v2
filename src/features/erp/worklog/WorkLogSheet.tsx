import { useMemo, useState } from 'react'
import { Coins, UserPlus, X } from 'lucide-react'
import { Button, ConfirmInline, IconButton, Input, Sheet, Textarea } from '../../../components/ui'
import { useErpStore } from '../../../stores/erp'
import { useWorkLogStore } from '../../../stores/worklog'
import { computeLogTotal } from '../../../utils/workLogCost'
import type { Staff } from '../../../types/api/staff'
import type { WorkLog } from '../../../types/api/workLogs'
import { StaffPickerSheet } from './StaffPickerSheet'
import { WorkerLineRow } from './WorkerLineRow'
import {
  canSaveDraft,
  draftWage,
  formatWon,
  makeDraft,
  toWorkerInput,
  type WorkerDraft,
  type WorkLogDraft,
} from './draft'

const fieldLabel = 'mb-1 block text-[13px] font-semibold text-ink-muted'

export interface WorkLogSheetProps {
  /** 편집 대상 — undefined면 신규 작성 */
  log: WorkLog | undefined
  onClose: () => void
}

/**
 * 업무일지 작성/수정 시트 (디자인 gQyCx) — 작업일·제목·메모 + 투입 인력 라인 편집기 + 실시간 합계 바.
 * 로컬 useState draft → "저장" 버튼에서만 스토어 커밋(CONVENTIONS §3, 5a StaffSheet 선례).
 * 합계 미리보기는 공유 computeLogTotal(서버 totalCost와 동일 결과, AC-14)로 산출한다.
 */
export function WorkLogSheet({ log, onClose }: WorkLogSheetProps) {
  const createWorkLog = useWorkLogStore((s) => s.createWorkLog)
  const updateWorkLog = useWorkLogStore((s) => s.updateWorkLog)
  const deleteWorkLog = useWorkLogStore((s) => s.deleteWorkLog)
  // 스냅샷 이름 끌어옴(낙관 표시) — 콜백 동기 접근은 getState() (CONVENTIONS §3)
  const staffNameById = (id: string): string =>
    useErpStore.getState().staff.find((s) => s.staffId === id)?.name ?? ''

  const [draft, setDraft] = useState<WorkLogDraft>(() => makeDraft(log))
  const [pickerOpen, setPickerOpen] = useState(false)

  const isEdit = log !== undefined

  // 실시간 합계 — 공유 모듈로 라인 draft를 숫자화해 산출 (서버 totalCost 동형)
  const total = useMemo(
    () =>
      computeLogTotal(
        draft.workers.map((w) => ({
          appliedWage: draftWage(w.appliedWage),
          workRatio: parseFloat(w.workRatio) || 0,
        })),
      ),
    [draft.workers],
  )

  const canSave = canSaveDraft(draft)

  const addStaff = (staff: Staff) => {
    setDraft((d) => {
      if (d.workers.some((w) => w.staffId === staff.staffId)) return d
      const line: WorkerDraft = {
        staffId: staff.staffId,
        staffNameSnapshot: staff.name,
        // 기본 일당 자동채움 (AC-14) — 미설정이면 빈 문자열(사용자 입력 유도)
        appliedWage: staff.dailyWage !== null ? String(staff.dailyWage) : '',
        workRatio: '1', // 전일 기본
      }
      return { ...d, workers: [...d.workers, line] }
    })
  }

  const removeStaff = (staffId: string) =>
    setDraft((d) => ({ ...d, workers: d.workers.filter((w) => w.staffId !== staffId) }))

  const patchLine = (staffId: string, patch: Partial<WorkerDraft>) =>
    setDraft((d) => ({
      ...d,
      workers: d.workers.map((w) => (w.staffId === staffId ? { ...w, ...patch } : w)),
    }))

  const handleSave = () => {
    if (!canSave) return
    const workers = draft.workers.map(toWorkerInput)
    if (isEdit) {
      updateWorkLog(
        log.logId,
        {
          workDate: draft.workDate,
          title: draft.title.trim(),
          memo: draft.memo.trim() || null,
          workers,
        },
        staffNameById,
      )
    } else {
      createWorkLog(
        {
          workDate: draft.workDate,
          title: draft.title.trim(),
          memo: draft.memo.trim() || undefined,
          workers,
        },
        staffNameById,
      )
    }
    onClose()
  }

  const handleDelete = () => {
    if (!isEdit) return
    deleteWorkLog(log.logId)
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">
          {isEdit ? '업무일지 수정' : '업무일지 작성'}
        </h2>
        <IconButton icon={X} size="sm" aria-label="닫기" onClick={onClose} />
      </header>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={fieldLabel}>
              작업일 <span className="text-danger">*</span>
            </span>
            <Input
              aria-label="작업일"
              type="date"
              value={draft.workDate}
              onChange={(e) => setDraft((d) => ({ ...d, workDate: e.target.value }))}
            />
          </label>
          <label>
            <span className={fieldLabel}>
              제목 <span className="text-danger">*</span>
            </span>
            <Input
              aria-label="제목"
              value={draft.title}
              placeholder="예: 고추밭 정식"
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </label>
        </div>

        <label>
          <span className={fieldLabel}>메모</span>
          <Textarea
            aria-label="메모"
            rows={2}
            value={draft.memo}
            placeholder="작업 내용을 입력하세요"
            onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
          />
        </label>

        <div className="mt-1 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-ink">투입 인력</span>
          <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
            <UserPlus size={14} aria-hidden />
            인력 추가
          </Button>
        </div>

        {draft.workers.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-4 text-center text-[13px] text-ink-muted">
            인력을 추가하면 기본 일당이 자동으로 채워져요
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {draft.workers.map((w) => (
              <WorkerLineRow
                key={w.staffId}
                draft={w}
                onWageChange={(wage) => patchLine(w.staffId, { appliedWage: wage })}
                onRatioChange={(ratio) => patchLine(w.staffId, { workRatio: ratio })}
                onRemove={() => removeStaff(w.staffId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 실시간 합계 바 (AC-14) — 라인 draft 합과 항상 일치(computeLogTotal) */}
      <div className="mt-4 flex items-center justify-between rounded-md bg-pro px-4 py-3 text-surface">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <Coins size={16} aria-hidden />
          인건비 합계 · 일{draft.workers.length}명
        </span>
        <span
          className="font-mono text-[18px] font-bold"
          data-testid="worklog-total"
          aria-label="인건비 합계"
        >
          {formatWon(total)}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {isEdit && <ConfirmInline label="삭제" confirmLabel="삭제 확정" onConfirm={handleDelete} />}
        <Button full disabled={!canSave} onClick={handleSave}>
          저장
        </Button>
      </div>

      {pickerOpen && (
        <StaffPickerSheet
          selectedIds={draft.workers.map((w) => w.staffId)}
          onAdd={addStaff}
          onRemove={removeStaff}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </Sheet>
  )
}
