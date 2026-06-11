import { useEffect, useRef, useState } from 'react'
import { cva } from 'class-variance-authority'
import { Layers, Plus, X } from 'lucide-react'
import {
  AreaText,
  Badge,
  Button,
  ColorSwatch,
  IconButton,
  Input,
  ListRow,
  SegmentedControl,
  Sheet,
  Textarea,
} from '../../components/ui'
import { api } from '../../lib/api'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore, type GroupDraft } from '../../stores/workspace'
import type { Parcel } from '../../types/api/parcels'
import type { Group, ParcelStyle } from '../../types/api/tabState'
import { AREA_UNITS } from '../../utils/formatArea'

/** 시트 로컬 draft — 저장 버튼 전에는 스토어·서버·캔버스에 반영되지 않는다 (CONVENTIONS §3) */
interface GroupSheetDraft {
  name: string
  memo: string
  color: string | null
  style: ParcelStyle
}

function makeDraft(group: Group | undefined): GroupSheetDraft {
  return {
    name: group?.name ?? '',
    memo: group?.memo ?? '',
    color: group?.color ?? null,
    style: group?.style ?? 'fill',
  }
}

const UNIT_OPTIONS = AREA_UNITS.map((u) => ({ id: u.id, label: u.label }))

const STYLE_OPTIONS: { id: ParcelStyle; label: string }[] = [
  { id: 'fill', label: '채움' },
  { id: 'border', label: '테두리' },
]

const swatchButton = cva('flex flex-col items-center gap-1 rounded-md border py-2', {
  variants: {
    selected: {
      true: 'border-primary bg-primary/5',
      false: 'border-border bg-surface',
    },
  },
})

const sectionLabel = 'text-[13px] font-semibold text-ink'

export interface GroupSheetProps {
  groupId: string
}

export function GroupSheet({ groupId }: GroupSheetProps) {
  const closeSheet = useUiStore((s) => s.closeSheet)
  const enterAddToGroupMode = useUiStore((s) => s.enterAddToGroupMode)
  const areaUnit = useUiStore((s) => s.areaUnit)
  const setAreaUnit = useUiStore((s) => s.setAreaUnit)
  const colorLabels = useWorkspaceStore((s) => s.colorLabels)
  const group = useWorkspaceStore((s): Group | undefined => s.groups[groupId])
  const isPending = useWorkspaceStore(
    (s) => s.pendingGroupCreate !== null && s.pendingGroupCreate.groupId === groupId,
  )
  const upsertGroup = useWorkspaceStore((s) => s.upsertGroup)
  const commitGroupDraft = useWorkspaceStore((s) => s.commitGroupDraft)
  const cancelGroupDraft = useWorkspaceStore((s) => s.cancelGroupDraft)
  const updateDraftGroupMembers = useWorkspaceStore((s) => s.updateDraftGroupMembers)

  const [draft, setDraft] = useState<GroupSheetDraft>(() =>
    makeDraft(useWorkspaceStore.getState().groups[groupId]),
  )

  // 그룹 전환 시 draft를 새 그룹 값으로 리셋 — 미저장 편집분은 확인 없이 폐기 (M-7 선례 동일).
  // 렌더 중 상태 조정 패턴 (react.dev/learn/you-might-not-need-an-effect)
  const [draftGroupId, setDraftGroupId] = useState(groupId)
  if (draftGroupId !== groupId) {
    setDraftGroupId(groupId)
    setDraft(makeDraft(useWorkspaceStore.getState().groups[groupId]))
  }

  // 멤버별 면적·지번 병렬 조회 — 실패(null)는 지번 폴백 + 합산 제외 (v1 투영면적 폴백 폐기, 명세 ④-2)
  const [infoByPid, setInfoByPid] = useState<Record<string, Parcel | null>>({})
  const requestedRef = useRef(new Set<string>())
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const memberIds = group?.parcelIds
  useEffect(() => {
    if (memberIds === undefined) return
    for (const pid of memberIds) {
      if (requestedRef.current.has(pid)) continue
      requestedRef.current.add(pid)
      api.parcels.get(pid).then(
        (p) => {
          if (mountedRef.current) setInfoByPid((m) => ({ ...m, [pid]: p }))
        },
        () => {
          if (mountedRef.current) setInfoByPid((m) => ({ ...m, [pid]: null }))
        },
      )
    }
  }, [memberIds])

  if (group === undefined) return null

  const memberRows = group.parcelIds.map((pid) => {
    const info = infoByPid[pid] ?? null
    return { pid, jibun: info?.jibun ?? pid, area: info?.lndpclAr ?? null }
  })
  const knownAreas = memberRows.filter((r) => r.area !== null)
  const totalArea = knownAreas.reduce((sum, r) => sum + (r.area ?? 0), 0)

  const handleSave = () => {
    // v1 GroupSheet handleSave 정규화 보존: name/memo trim, 빈 문자열 → null
    const payload: GroupDraft = {
      name: draft.name.trim() || null,
      memo: draft.memo.trim() || null,
      color: draft.color,
      style: draft.style,
    }
    if (isPending) commitGroupDraft(payload)
    else upsertGroup(groupId, { ...payload, parcelIds: group.parcelIds })
    closeSheet()
  }

  const handleDissolve = () => {
    // 해체 = 그룹 행 삭제만 — 멤버 필지의 개별 override는 무변경 (명세 ⑥). 확인 다이얼로그 없음
    if (isPending) cancelGroupDraft()
    else upsertGroup(groupId, null)
    closeSheet()
  }

  const handleRemoveMember = (pid: string) => {
    const remaining = group.parcelIds.filter((id) => id !== pid)
    // 마지막 멤버 제거 시에도 멤버 0 저장 — 삭제는 해체로만 (명세 §판정 상세)
    if (isPending) updateDraftGroupMembers(remaining)
    else upsertGroup(groupId, { ...group, parcelIds: remaining })
  }

  return (
    <Sheet onClose={closeSheet}>
      <header className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-ink-muted">그룹</p>
            <Badge>
              <Layers size={10} aria-hidden />
              {group.parcelIds.length}필지
            </Badge>
          </div>
          <IconButton icon={X} size="sm" aria-label="닫기" onClick={closeSheet} />
        </div>
        <Input
          aria-label="그룹 이름"
          className="mt-2"
          value={draft.name}
          placeholder="그룹 이름 입력"
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        {knownAreas.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-ink-muted">합계</span>
              <span className="text-lg font-bold text-ink">
                <AreaText m2={totalArea} unit={areaUnit} />
              </span>
            </span>
            <SegmentedControl
              size="sm"
              options={UNIT_OPTIONS}
              value={areaUnit}
              onChange={setAreaUnit}
            />
          </div>
        )}
      </header>

      <section className="mb-4">
        <h3 className={`mb-1.5 ${sectionLabel}`}>메모</h3>
        <Textarea
          aria-label="메모"
          rows={2}
          value={draft.memo}
          placeholder="그룹에 대한 메모를 입력하세요"
          onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
        />
      </section>

      <section className="mb-4 flex items-center justify-between">
        <h3 className={sectionLabel}>표시 방식</h3>
        {/* 공통 SegmentedControl에 disabled prop이 없어 fieldset 네이티브 비활성으로 감싼다 (ui/ 수정 금지) */}
        <fieldset
          disabled={draft.color === null}
          className={draft.color === null ? 'opacity-40' : undefined}
        >
          <SegmentedControl
            size="sm"
            className="whitespace-nowrap" // fieldset min-content 수축으로 "테두리"가 줄바꿈되는 것 방지
            options={STYLE_OPTIONS}
            value={draft.style}
            onChange={(style) => setDraft((d) => ({ ...d, style }))}
          />
        </fieldset>
      </section>

      <section className="mb-4">
        <h3 className={`mb-1.5 ${sectionLabel}`}>색상</h3>
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            aria-pressed={draft.color === null}
            className={swatchButton({ selected: draft.color === null })}
            onClick={() => setDraft((d) => ({ ...d, color: null }))}
          >
            <span className="flex h-6 w-9 items-center justify-center rounded-sm border-[1.5px] border-border bg-surface">
              <X size={14} aria-hidden className="text-ink-muted" />
            </span>
            <span className="text-[11px] text-ink-muted">없음</span>
          </button>
          {colorLabels.map((c) => (
            <button
              key={c.colorId}
              type="button"
              aria-pressed={draft.color === c.colorId}
              className={swatchButton({ selected: draft.color === c.colorId })}
              onClick={() => setDraft((d) => ({ ...d, color: c.colorId }))}
            >
              <ColorSwatch hex={c.hex} styleMode="fill" />
              <span className="text-[11px] text-ink-muted">{c.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-4">
        <h3 className={`mb-1.5 ${sectionLabel}`}>포함 필지 ({group.parcelIds.length})</h3>
        {memberRows.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border">
            {memberRows.map((row) => (
              <ListRow
                key={row.pid}
                title={<span className="font-mono">{row.jibun}</span>}
                trailing={
                  <span className="flex items-center gap-1">
                    {row.area !== null && (
                      <span className="text-[12px] text-ink-muted">
                        <AreaText m2={row.area} unit={areaUnit} />
                      </span>
                    )}
                    <IconButton
                      icon={X}
                      size="sm"
                      aria-label={`${row.jibun} 제거`}
                      onClick={() => handleRemoveMember(row.pid)}
                    />
                  </span>
                }
              />
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-border bg-surface-alt p-3 text-[13px] text-ink-muted">
            포함된 필지가 없습니다
          </p>
        )}
        {!isPending && (
          <Button
            variant="secondary"
            full
            className="mt-2"
            onClick={() => enterAddToGroupMode(groupId)}
          >
            <Plus size={16} aria-hidden />
            필지 추가
          </Button>
        )}
      </section>

      <Button full onClick={handleSave}>
        저장
      </Button>
      {/* 공통 Button에 outline-danger variant가 없어 feature-local 버튼 (ui/ 수정 금지 — Stage 2 신고분) */}
      <button
        type="button"
        className="mt-2 h-11 w-full rounded-md border border-danger bg-surface text-[15px] font-semibold text-danger active:bg-surface-alt"
        onClick={handleDissolve}
      >
        {isPending ? '취소' : '그룹 해체'}
      </button>
    </Sheet>
  )
}
