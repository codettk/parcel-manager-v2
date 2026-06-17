import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ClipboardList, Plus, Users } from 'lucide-react'
import { Button, EmptyState } from '../../../components/ui'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import { useWorkLogStore } from '../../../stores/worklog'
import type { WorkLog } from '../../../types/api/workLogs'
import { WorkLogSheet } from './WorkLogSheet'
import { formatWon } from './draft'

/** 시트 상태 — null=닫힘, 'new'=작성, WorkLog=수정 */
type SheetState = null | 'new' | WorkLog

/** YYYY-MM-DD → "M/D" + 월/일 분리 표기용 */
function splitDate(iso: string): { md: string; full: string } {
  const [y, m, d] = iso.split('-')
  return { md: `${Number(m)}/${d}`, full: `${y}.${m}.${d}` }
}

/**
 * 업무일지 목록 풀스크린 뷰 (디자인 eziJI/fbHvt, 슬라이스 5b) — 5a StaffView 선례: 지도 대체 풀스크린 레이어.
 * 날짜 내림차순 카드(작업일·제목·투입인원·인건비합계) + 기간 필터 + 빈 상태 + 작성 진입점 (AC-13).
 * 인력 마스터(picker용)도 함께 로드 — 시트 picker가 활성 인력을 즉시 쓰도록(AC-14).
 */
export function WorkLogView() {
  const close = useUiStore((s) => s.closeWorkLogView)
  const workLogs = useWorkLogStore((s) => s.workLogs)
  const loadWorkLogs = useWorkLogStore((s) => s.loadWorkLogs)
  const loadStaff = useErpStore((s) => s.loadStaff)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sheet, setSheet] = useState<SheetState>(null)

  // 뷰 열 때 단발 fetch (절충 0) — 인력도 함께(시트 picker용). 실패해도 기존 목록 유지(낙관 패턴)
  useEffect(() => {
    void loadWorkLogs({}).catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[erp] 업무일지 로드 실패:', err)
    })
    void loadStaff().catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[erp] 인력 로드 실패:', err)
    })
  }, [loadWorkLogs, loadStaff])

  const applyRange = () => {
    void loadWorkLogs({ from: from || undefined, to: to || undefined }).catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[erp] 기간 필터 로드 실패:', err)
    })
  }

  const totalCost = useMemo(() => workLogs.reduce((sum, l) => sum + l.totalCost, 0), [workLogs])

  return (
    <div data-testid="worklog-view" className="absolute inset-0 z-30 flex flex-col bg-surface">
      {/* 헤더 */}
      <div className="flex items-center gap-1 py-1 pr-4 pl-2">
        <button
          type="button"
          aria-label="뒤로"
          onClick={close}
          className="flex size-10 shrink-0 items-center justify-center rounded-md text-ink active:bg-surface-alt"
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-bold text-ink">업무일지</h1>
          <p className="text-[12px] text-ink-muted">
            {workLogs.length}건 · 합계{' '}
            <span className="font-mono font-semibold text-ink">{formatWon(totalCost)}</span>
          </p>
        </div>
        <Button size="sm" onClick={() => setSheet('new')}>
          <Plus size={15} aria-hidden />
          작성
        </Button>
      </div>

      {/* 기간 필터 */}
      <div className="flex items-center gap-2 border-b border-border px-4 pb-2">
        <input
          type="date"
          aria-label="시작일"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 text-[13px] text-ink focus:border-primary focus:outline-none"
        />
        <span className="text-[13px] text-ink-muted">~</span>
        <input
          type="date"
          aria-label="종료일"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 text-[13px] text-ink focus:border-primary focus:outline-none"
        />
        <Button size="sm" variant="secondary" onClick={applyRange}>
          기간 적용
        </Button>
      </div>

      {/* 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {workLogs.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            message="아직 작성된 업무일지가 없어요"
            action={
              <Button size="sm" onClick={() => setSheet('new')}>
                <Plus size={15} aria-hidden />첫 업무일지 작성
              </Button>
            }
          />
        ) : (
          workLogs.map((log) => (
            <WorkLogRow key={log.logId} log={log} onClick={() => setSheet(log)} />
          ))
        )}
      </div>

      {sheet !== null && (
        <WorkLogSheet log={sheet === 'new' ? undefined : sheet} onClose={() => setSheet(null)} />
      )}
    </div>
  )
}

function WorkLogRow({ log, onClick }: { log: WorkLog; onClick: () => void }) {
  const { md } = splitDate(log.workDate)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left active:bg-surface-alt"
    >
      <span className="flex w-12 shrink-0 flex-col items-center">
        <span className="font-mono text-[15px] font-bold text-pro">{md}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold text-ink">{log.title}</span>
        <span className="flex items-center gap-1 text-[12px] text-ink-muted">
          <Users size={11} aria-hidden />
          투입 {log.workers.length}명
          {log.memo !== null && log.memo !== '' && <span className="truncate"> · {log.memo}</span>}
        </span>
      </span>
      <span className="shrink-0 text-right font-mono text-[15px] font-bold text-ink">
        {formatWon(log.totalCost)}
      </span>
    </button>
  )
}
