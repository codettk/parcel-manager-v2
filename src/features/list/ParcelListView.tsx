import { useMemo, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  IconButton,
  Input,
  SegmentedControl,
} from '../../components/ui'
import { selectParcelToGroup } from '../../stores/selectors'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore } from '../../stores/workspace'
import type { ColorLabel } from '../../types/api/colors'
import { AREA_UNITS, formatArea } from '../../utils/formatArea'
import {
  applyColorFilter,
  applySearch,
  buildRows,
  COLOR_FILTER_NONE,
  duplicateSuffix,
  findDuplicateJibuns,
  sortRows,
  type ListRowData,
  type ListSortKey,
  type ParcelIndexEntry,
} from './listQuery'
import { useParcelAreas } from './useParcelAreas'
import { useParcelIndex } from './useParcelIndex'

const SORT_OPTIONS: { id: ListSortKey; label: string }[] = [
  { id: 'jibun', label: '지번' },
  { id: 'color', label: '색상' },
  { id: 'area', label: '면적' },
]

const UNIT_OPTIONS = AREA_UNITS.map((u) => ({ id: u.id, label: u.label }))

const EMPTY_PARCELS: ParcelIndexEntry[] = []
const EMPTY_AREAS: Record<string, number | null> = {}

/** 전체 화면 필지 목록 (M-9) — 시트(z-40/50) 아래·지도 오버레이(z-10) 위 레이어 */
export function ParcelListView() {
  const closeListView = useUiStore((s) => s.closeListView)
  // 행 탭은 모드 분기 비경유 전용 액션 — tapParcel이면 숨은 멀티선택/추가모드로 새는 B-1
  const openParcelFromList = useUiStore((s) => s.openParcelFromList)
  const areaUnit = useUiStore((s) => s.areaUnit)
  const setAreaUnit = useUiStore((s) => s.setAreaUnit)
  const overrides = useWorkspaceStore((s) => s.overrides)
  const groups = useWorkspaceStore((s) => s.groups)
  const colorLabels = useWorkspaceStore((s) => s.colorLabels)
  const parcelToGroup = useWorkspaceStore(selectParcelToGroup)

  const parcels = useParcelIndex()
  const areas = useParcelAreas()

  // 검색·필터·정렬은 컴포넌트 로컬 — 진입마다 초기 상태, 영속하지 않음 (v1 동일)
  const [searchText, setSearchText] = useState('')
  const [colorFilter, setColorFilter] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<ListSortKey>('jibun')

  const allRows = useMemo(
    () =>
      buildRows(parcels ?? EMPTY_PARCELS, overrides, groups, parcelToGroup, areas ?? EMPTY_AREAS),
    [parcels, overrides, groups, parcelToGroup, areas],
  )
  const duplicateJibuns = useMemo(() => findDuplicateJibuns(allRows), [allRows])
  const visibleRows = useMemo(
    () =>
      sortRows(
        applyColorFilter(applySearch(allRows, searchText), colorFilter),
        sortBy,
        colorLabels,
      ),
    [allRows, searchText, colorFilter, sortBy, colorLabels],
  )

  const colorLabelById = useMemo(() => {
    const map: Record<string, ColorLabel> = {}
    for (const c of colorLabels) map[c.colorId] = c
    return map
  }, [colorLabels])

  const toggleColorFilter = (id: string) => {
    setColorFilter((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  return (
    <div data-testid="parcel-list-view" className="absolute inset-0 z-20 flex flex-col bg-surface">
      {/* 헤더 */}
      <div className="flex items-center justify-between py-1 pr-4 pl-2">
        <div className="flex items-center gap-1">
          <IconButton icon={ArrowLeft} aria-label="지도로 돌아가기" onClick={closeListView} />
          <h1 className="text-[17px] font-semibold text-ink">필지 목록</h1>
        </div>
        <span data-testid="list-count" className="text-[12px] text-ink-muted">
          <span className="font-mono font-semibold">
            {visibleRows.length.toLocaleString('ko')} / {allRows.length.toLocaleString('ko')}
          </span>{' '}
          필지
        </span>
      </div>

      {/* 검색 */}
      <div className="px-4 py-2">
        <div className="relative">
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="지번·그룹명 검색…"
            aria-label="지번·그룹명 검색"
            className="pr-10"
          />
          {searchText !== '' && (
            <IconButton
              icon={X}
              size="sm"
              aria-label="검색어 지우기"
              onClick={() => setSearchText('')}
              className="absolute top-1/2 right-1.5 -translate-y-1/2"
            />
          )}
        </div>
      </div>

      {/* 색상 필터 칩 — "전체" + 동적 색상 다중 토글(OR) + "미지정" (v1 colorFilter 의미론) */}
      <div className="flex flex-wrap gap-2 px-4 pb-1">
        <Chip selected={colorFilter.length === 0} onClick={() => setColorFilter([])}>
          전체
        </Chip>
        {colorLabels.map((c) => (
          <Chip
            key={c.colorId}
            selected={colorFilter.includes(c.colorId)}
            colorHex={c.hex}
            onClick={() => toggleColorFilter(c.colorId)}
          >
            {c.label}
          </Chip>
        ))}
        <Chip
          selected={colorFilter.includes(COLOR_FILTER_NONE)}
          onClick={() => toggleColorFilter(COLOR_FILTER_NONE)}
        >
          미지정
        </Chip>
      </div>

      {/* 정렬·단위 행 — 단위는 전역 즉시 반영 (M-7 공유) */}
      <div className="flex items-center justify-between px-4 py-2">
        <SegmentedControl size="sm" options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} />
        <SegmentedControl
          size="sm"
          options={UNIT_OPTIONS}
          value={areaUnit}
          onChange={setAreaUnit}
        />
      </div>

      {/* 컬럼 헤더 */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-alt px-3 py-1.5 text-[12px] font-semibold text-ink-muted">
        <span className="min-w-0 flex-1">지번</span>
        <span className="w-[72px] shrink-0">색상</span>
        <span className="w-[78px] shrink-0 text-right">면적</span>
        <span className="w-[64px] shrink-0">그룹</span>
      </div>

      {/* 행 목록 — 전량 렌더 (가상화 없음, v1 보존) */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {parcels !== null && visibleRows.length === 0 ? (
          <EmptyState
            icon={Search}
            message="검색 결과 없음"
            action={
              <Button variant="secondary" size="sm" onClick={() => setSearchText('')}>
                검색 초기화
              </Button>
            }
          />
        ) : (
          visibleRows.map((row) => (
            <ListViewRow
              key={row.id}
              row={row}
              suffix={duplicateSuffix(row, duplicateJibuns)}
              color={row.colorId !== null ? colorLabelById[row.colorId] : undefined}
              areaText={row.area !== null ? formatArea(row.area, areaUnit) : null}
              onTap={openParcelFromList}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface ListViewRowProps {
  row: ListRowData
  /** 중복지번 식별자 (`#끝4자리`) — 비대상이면 null */
  suffix: string | null
  /** 행의 색 라벨 — colorId가 없거나 삭제된 색이면 undefined → '-' (v1 보존) */
  color: ColorLabel | undefined
  areaText: string | null
  onTap: (parcelId: string) => void
}

// ListRow(ui)는 title/subtitle 구조라 4컬럼 본문을 담을 수 없어 행 컨테이너 스타일만 동일하게 가져온다
// (디자이너 전달: 행 컨테이너 재사용 + Body 4셀 교체 — ui 컴포넌트는 무수정 원칙)
function ListViewRow({ row, suffix, color, areaText, onTap }: ListViewRowProps) {
  const hasCustomName = row.displayName !== row.jibun
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left active:bg-surface-alt"
      onClick={() => onTap(row.id)}
    >
      {/* 지번 셀 */}
      <span className="min-w-0 flex-1">
        {hasCustomName ? (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-semibold text-ink">{row.displayName}</span>
            <span className="truncate text-[11px] text-ink-muted">{row.jibun}</span>
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] text-ink">{row.jibun}</span>
            {suffix !== null && (
              <span className="shrink-0 font-mono text-[11px] text-ink-muted">{suffix}</span>
            )}
          </span>
        )}
      </span>
      {/* 색상 셀 */}
      <span className="flex w-[72px] shrink-0 items-center gap-1.5">
        {color !== undefined ? (
          <>
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              // DB(color_labels)의 동적 색상이라 토큰화 불가 — 인라인 style 허용 (CONVENTIONS §4 예외)
              style={{ backgroundColor: color.hex }}
            />
            <span className="truncate text-[12px] text-ink">{color.label}</span>
          </>
        ) : (
          <span className="text-[12px] text-ink-muted">-</span>
        )}
      </span>
      {/* 면적 셀 */}
      <span
        className={`w-[78px] shrink-0 text-right font-mono text-[12px] ${
          areaText !== null ? 'text-ink' : 'text-ink-muted'
        }`}
      >
        {areaText ?? '-'}
      </span>
      {/* 그룹 셀 */}
      <span className="flex w-[64px] shrink-0 items-center">
        {row.groupName !== null ? (
          <Badge className="max-w-full">
            <span className="truncate">{row.groupName}</span>
          </Badge>
        ) : (
          <span className="text-[12px] text-ink-muted">-</span>
        )}
      </span>
    </button>
  )
}
