import { useEffect, useState } from 'react'
import { cva } from 'class-variance-authority'
import { X } from 'lucide-react'
import {
  AreaText,
  Button,
  ColorSwatch,
  IconButton,
  Input,
  SegmentedControl,
  Sheet,
  Switch,
  Textarea,
} from '../../components/ui'
import { api } from '../../lib/api'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore, type ParcelPatch } from '../../stores/workspace'
import type { Parcel } from '../../types/api/parcels'
import type { ParcelOverride, ParcelStyle } from '../../types/api/tabState'
import { AREA_UNITS } from '../../utils/formatArea'
import { PIN_ICON_CATEGORIES } from './pinIcons'

/** 시트 로컬 draft — 저장 버튼 전에는 스토어·서버·캔버스에 반영되지 않는다 (CONVENTIONS §3) */
interface ParcelDraft {
  name: string
  memo: string
  color: string | null
  style: ParcelStyle
  pinned: boolean
  icon: string | null
}

function makeDraft(override: ParcelOverride | undefined): ParcelDraft {
  return {
    name: override?.name ?? '',
    memo: override?.memo ?? '',
    color: override?.color ?? null,
    style: override?.style ?? 'fill',
    pinned: override?.pinned ?? false,
    icon: override?.icon ?? null,
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

const pinIconButton = cva('flex size-9 items-center justify-center rounded-md text-lg', {
  variants: {
    selected: {
      true: 'border-2 border-primary bg-primary/10',
      false: 'border border-border bg-surface',
    },
  },
})

const sectionLabel = 'text-[13px] font-semibold text-ink'

export interface ParcelSheetProps {
  parcelId: string
}

export function ParcelSheet({ parcelId }: ParcelSheetProps) {
  const closeSheet = useUiStore((s) => s.closeSheet)
  const areaUnit = useUiStore((s) => s.areaUnit)
  const setAreaUnit = useUiStore((s) => s.setAreaUnit)
  const colorLabels = useWorkspaceStore((s) => s.colorLabels)
  const upsertParcel = useWorkspaceStore((s) => s.upsertParcel)

  const [draft, setDraft] = useState<ParcelDraft>(() =>
    makeDraft(useWorkspaceStore.getState().overrides[parcelId]),
  )
  const [fetched, setFetched] = useState<{ parcelId: string; parcel: Parcel } | null>(null)

  // 필지 전환 시 draft를 새 필지의 override로 리셋 — 미저장 편집분은 확인 없이 폐기 (v1 보존).
  // Realtime 수신으로 override가 바뀌어도 draft는 로컬 우선 유지 (M-6 소관) — 리셋 조건은 parcelId뿐.
  // 렌더 중 상태 조정 패턴 (react.dev/learn/you-might-not-need-an-effect)
  const [draftParcelId, setDraftParcelId] = useState(parcelId)
  if (draftParcelId !== parcelId) {
    setDraftParcelId(parcelId)
    setDraft(makeDraft(useWorkspaceStore.getState().overrides[parcelId]))
  }

  // 면적·지번·토지 정보 단건 조회 — null/실패 시 해당 행 생략, 시트 사용은 계속 (명세 §시트 내용)
  useEffect(() => {
    let cancelled = false
    api.parcels
      .get(parcelId)
      .then((p) => {
        if (!cancelled) setFetched({ parcelId, parcel: p })
      })
      .catch(() => {
        // 조회 실패 = 행 생략 (v1 동일) — 에러 UI 없음
      })
    return () => {
      cancelled = true
    }
  }, [parcelId])

  // 필지 전환 직후 이전 필지의 응답이 잠깐 보이지 않도록 parcelId 일치 검사로 파생
  const info = fetched !== null && fetched.parcelId === parcelId ? fetched.parcel : null

  const handleSave = () => {
    // v1 handleSave 정규화 보존: name/memo trim, color 없으면 style=null, pinned 아니면 icon=null
    const patch: ParcelPatch = {
      name: draft.name.trim() || null,
      memo: draft.memo.trim() || null,
      color: draft.color,
      style: draft.color !== null ? draft.style : null,
      pinned: draft.pinned,
      icon: draft.pinned ? draft.icon : null,
    }
    upsertParcel(parcelId, patch)
    closeSheet()
  }

  const landRows: { key: string; value: string }[] = []
  if (info?.pnu != null) {
    if (info.lndcgrCodeNm !== null) landRows.push({ key: '지목', value: info.lndcgrCodeNm })
    if (info.posesnSeCodeNm !== null) landRows.push({ key: '소유구분', value: info.posesnSeCodeNm })
    if (info.cnrsPsnCo !== null && info.cnrsPsnCo > 1)
      landRows.push({ key: '공유인수', value: `${info.cnrsPsnCo}명` })
  }

  return (
    <Sheet onClose={closeSheet}>
      <header className="mb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-muted">지번</p>
          <IconButton icon={X} size="sm" aria-label="닫기" onClick={closeSheet} />
        </div>
        <Input
          aria-label="이름"
          value={draft.name}
          placeholder={info?.jibun ?? '이름 입력'}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        {draft.name.trim() !== '' && info?.jibun != null && (
          <p className="mt-1.5 text-xs text-ink-muted">
            기본 지번: <span className="font-mono">{info.jibun}</span>
          </p>
        )}
        {info?.lndpclAr != null && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-lg font-bold text-ink">
              <AreaText m2={info.lndpclAr} unit={areaUnit} />
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

      {landRows.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-2 rounded-md border border-border bg-surface-alt p-3">
          {landRows.map((row) => (
            <div key={row.key}>
              <p className="text-[11px] text-ink-muted">{row.key}</p>
              <p className="mt-0.5 text-[14px] font-semibold text-ink">{row.value}</p>
            </div>
          ))}
        </div>
      )}

      <section className="mb-4">
        <h3 className={`mb-1.5 ${sectionLabel}`}>메모</h3>
        <Textarea
          aria-label="메모"
          rows={3}
          value={draft.memo}
          placeholder="이 필지에 대한 메모를 입력하세요"
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
        <h3 className={`mb-1.5 ${sectionLabel}`}>고정 필지</h3>
        <div
          className={`flex items-center justify-between rounded-md border p-3 ${
            draft.pinned ? 'border-primary bg-primary/5' : 'border-border bg-surface'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl" aria-hidden>
              📌
            </span>
            <div>
              <p className="text-[14px] font-semibold text-ink">
                {draft.pinned ? '고정 켜짐' : '고정 꺼짐'}
              </p>
              <p className="text-[11px] text-ink-muted">초기화 시 색상·이름·아이콘 보호</p>
            </div>
          </div>
          <Switch
            checked={draft.pinned}
            onChange={(pinned) =>
              // 스위치를 끄면 draft.icon 즉시 제거 (v1 보존), 켤 때는 기존 아이콘 유지
              setDraft((d) => ({ ...d, pinned, icon: pinned ? d.icon : null }))
            }
          />
        </div>

        {draft.pinned && (
          <div className="mt-2.5 flex flex-col gap-2.5">
            {PIN_ICON_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <p className="mb-1 text-[11px] text-ink-muted">{cat.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {cat.icons.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      aria-pressed={draft.icon === icon}
                      className={pinIconButton({ selected: draft.icon === icon })}
                      onClick={() =>
                        // 같은 아이콘 재탭 = 해제 (v1 보존)
                        setDraft((d) => ({ ...d, icon: d.icon === icon ? null : icon }))
                      }
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Button full onClick={handleSave}>
        저장
      </Button>
    </Sheet>
  )
}
