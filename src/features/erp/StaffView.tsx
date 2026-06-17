import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Phone, Plus, RotateCcw, UserPlus, Users } from 'lucide-react'
import { Button, EmptyState, Switch } from '../../components/ui'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Staff } from '../../types/api/staff'
import { StaffSheet } from './StaffSheet'

/** 일당 표기 — 천단위 구분 + "원" (null이면 미설정 표시는 호출부) */
function formatWage(won: number): string {
  return `${won.toLocaleString('ko')}원`
}

/** 시트 상태 — null=닫힘, 'new'=생성, Staff=편집 */
type SheetState = null | 'new' | Staff

/** 영농 인력 관리 풀스크린 뷰 (슬라이스 5a) — region 뷰 선례: 지도를 대체하는 풀스크린 레이어 */
export function StaffView() {
  const close = useUiStore((s) => s.closeStaffView)
  const staff = useErpStore((s) => s.staff)
  const includeInactive = useErpStore((s) => s.includeInactive)
  const setIncludeInactive = useErpStore((s) => s.setIncludeInactive)
  const loadStaff = useErpStore((s) => s.loadStaff)
  const updateStaff = useErpStore((s) => s.updateStaff)

  // 뷰 열 때 단발 fetch (절충 3) — 실패해도 기존 목록 유지(낙관 패턴)
  useEffect(() => {
    void loadStaff().catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn('[erp] 인력 로드 실패:', err)
    })
  }, [loadStaff])

  const [sheet, setSheet] = useState<SheetState>(null)

  const activeCount = useMemo(() => staff.filter((s) => s.active).length, [staff])
  const inactiveCount = staff.length - activeCount
  const visible = useMemo(
    () => (includeInactive ? staff : staff.filter((s) => s.active)),
    [staff, includeInactive],
  )

  const reactivate = (s: Staff) => updateStaff(s.staffId, { active: true })

  return (
    <div data-testid="staff-view" className="absolute inset-0 z-30 flex flex-col bg-surface">
      {/* 헤더 */}
      <div className="flex items-center gap-1 py-1 pr-4 pl-2">
        <IconButtonBack onClick={close} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-bold text-ink">인력 관리</h1>
          <p className="text-[12px] text-ink-muted">
            활성 {activeCount}명{includeInactive && inactiveCount > 0 && ` · 비활성 ${inactiveCount}명`}
          </p>
        </div>
        <Button size="sm" onClick={() => setSheet('new')}>
          <Plus size={15} aria-hidden />
          추가
        </Button>
      </div>

      {/* 비활성 포함 토글 */}
      <div className="flex items-center justify-between border-b border-border px-4 pb-2">
        <span className="text-[13px] text-ink-muted">비활성 포함 보기</span>
        <Switch checked={includeInactive} onChange={setIncludeInactive} />
      </div>

      {/* 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState
            icon={Users}
            message="등록된 인력이 없어요"
            action={
              <Button size="sm" onClick={() => setSheet('new')}>
                <UserPlus size={15} aria-hidden />
                인력 추가
              </Button>
            }
          />
        ) : (
          visible.map((s) => (
            <StaffRow
              key={s.staffId}
              staff={s}
              onEdit={() => setSheet(s)}
              onReactivate={() => reactivate(s)}
            />
          ))
        )}
      </div>

      {sheet !== null && (
        <StaffSheet staff={sheet === 'new' ? undefined : sheet} onClose={() => setSheet(null)} />
      )}
    </div>
  )
}

function IconButtonBack({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="뒤로"
      onClick={onClick}
      className="flex size-10 shrink-0 items-center justify-center rounded-md text-ink active:bg-surface-alt"
    >
      <ArrowLeft size={20} aria-hidden />
    </button>
  )
}

interface StaffRowProps {
  staff: Staff
  onEdit: () => void
  onReactivate: () => void
}

function StaffRow({ staff, onEdit, onReactivate }: StaffRowProps) {
  return (
    <div
      className={`flex items-center gap-3 border-b border-border px-3 py-2.5 ${
        staff.active ? '' : 'opacity-60'
      }`}
    >
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pro-soft text-pro">
          <Users size={16} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-ink">{staff.name}</span>
            {staff.role !== null && (
              <span className="shrink-0 text-[12px] text-ink-muted">{staff.role}</span>
            )}
          </span>
          {staff.phone !== null && (
            <span className="flex items-center gap-1 text-[12px] text-ink-muted">
              <Phone size={11} aria-hidden />
              {staff.phone}
            </span>
          )}
        </span>
      </button>
      {staff.active ? (
        <span className="shrink-0 text-right font-mono text-[13px] font-semibold text-ink">
          {staff.dailyWage !== null ? formatWage(staff.dailyWage) : '-'}
        </span>
      ) : (
        <Button size="sm" variant="secondary" onClick={onReactivate}>
          <RotateCcw size={13} aria-hidden />
          재활성화
        </Button>
      )}
    </div>
  )
}
