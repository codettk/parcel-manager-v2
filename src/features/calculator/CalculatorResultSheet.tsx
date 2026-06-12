import { useEffect, useRef, useState } from 'react'
import { Info, X } from 'lucide-react'
import { AreaText, Badge, IconButton, ListRow, SegmentedControl, Sheet } from '../../components/ui'
import { api } from '../../lib/api'
import { selectParcelToGroup } from '../../stores/selectors'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore } from '../../stores/workspace'
import type { Parcel } from '../../types/api/parcels'
import { AREA_UNITS } from '../../utils/formatArea'
import { computeRecipeAmount, formatRecipeAmount } from './calc'

const UNIT_OPTIONS = AREA_UNITS.map((u) => ({ id: u.id, label: u.label }))

/** 개별/그룹 계산 대상 (v1 calcMode 'individual'/'group' 보존 — 식별자만 v2 명명) */
type CalcTarget = 'parcel' | 'group'

const hintBox =
  'flex flex-col items-center gap-2 rounded-md bg-surface-alt p-4 text-center text-[13px] text-ink-muted'

export interface CalculatorResultSheetProps {
  parcelId: string
}

export function CalculatorResultSheet({ parcelId }: CalculatorResultSheetProps) {
  const closeSheet = useUiStore((s) => s.closeSheet)
  const areaUnit = useUiStore((s) => s.areaUnit)
  const setAreaUnit = useUiStore((s) => s.setAreaUnit)
  const recipes = useWorkspaceStore((s) => s.calcRecipes)
  const parcelToGroup = useWorkspaceStore(selectParcelToGroup)
  const groups = useWorkspaceStore((s) => s.groups)

  const gid: string | undefined = parcelToGroup[parcelId]
  const group = gid !== undefined ? groups[gid] : undefined
  const memberIds = group?.parcelIds
  const memberCount = memberIds?.length ?? 0

  // 그룹 소속이면 기본 '그룹 전체' (v1 calcMode 초기값 보존)
  const [target, setTarget] = useState<CalcTarget>(() => (gid !== undefined ? 'group' : 'parcel'))

  // 필지 전환 시 대상 모드를 새 필지 기준으로 리셋 — 렌더 중 상태 조정 패턴 (ParcelSheet 선례)
  const [targetParcelId, setTargetParcelId] = useState(parcelId)
  if (targetParcelId !== parcelId) {
    setTargetParcelId(parcelId)
    setTarget(gid !== undefined ? 'group' : 'parcel')
  }

  const groupSelected = target === 'group' && group !== undefined

  // 그룹 모드 = 지도에서 그룹 강조, 개별 모드 = 해제 (v1 onCalcModeChange 보존).
  // 결과 시트 닫힘·모드 종료 시의 해제는 closeSheet/exitCalculatorMode 소관
  const highlightGroupId = groupSelected && gid !== undefined ? gid : null
  useEffect(() => {
    useUiStore.setState({ selectedGroupId: highlightGroupId })
  }, [highlightGroupId])

  // 대상 필지 + 그룹 멤버 면적·지번 병렬 조회 — 실패(null)는 합산 제외 (GroupSheet 선례)
  const [infoByPid, setInfoByPid] = useState<Record<string, Parcel | null>>({})
  const requestedRef = useRef(new Set<string>())
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  useEffect(() => {
    for (const pid of [parcelId, ...(memberIds ?? [])]) {
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
  }, [parcelId, memberIds])

  // undefined = 조회 중 — 대상 응답이 모이기 전에는 면적 행·본문을 그리지 않는다 (안내 문구 오출현 방지)
  const settled = groupSelected
    ? (memberIds ?? []).every((pid) => infoByPid[pid] !== undefined)
    : infoByPid[parcelId] !== undefined

  const parcelAreaM2 = infoByPid[parcelId]?.lndpclAr ?? null
  // 그룹 면적 = 면적 known 멤버 합산, 전원 null이면 null (v1 calcGroupAreaM2 보존)
  const knownAreas = (memberIds ?? [])
    .map((pid) => infoByPid[pid]?.lndpclAr)
    .filter((a): a is number => a != null)
  const groupAreaM2 = knownAreas.length > 0 ? knownAreas.reduce((sum, a) => sum + a, 0) : null
  const effectiveAreaM2 = groupSelected ? groupAreaM2 : parcelAreaM2

  const jibun = infoByPid[parcelId]?.jibun ?? parcelId
  const headerTitle = groupSelected ? (group.name ?? `그룹 (${memberCount}필지)`) : jibun

  return (
    <Sheet onClose={closeSheet}>
      <header className="mb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-muted">계산 결과</p>
          <IconButton icon={X} size="sm" aria-label="닫기" onClick={closeSheet} />
        </div>

        {group !== undefined && (
          <SegmentedControl
            className="mt-2 w-full"
            options={[
              { id: 'parcel' as CalcTarget, label: '개별 지번' },
              { id: 'group' as CalcTarget, label: `그룹 전체 (${memberCount}필지)` },
            ]}
            value={target}
            onChange={setTarget}
          />
        )}

        <div className="mt-3 flex items-center gap-2">
          <h2 className={`text-lg font-bold text-ink ${groupSelected ? '' : 'font-mono'}`}>
            {headerTitle}
          </h2>
          {groupSelected && <Badge>{memberCount}필지</Badge>}
        </div>

        {settled && effectiveAreaM2 !== null && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-ink-muted">
                {groupSelected ? '합계' : '면적'}
              </span>
              <span className="text-base font-bold text-ink">
                <AreaText m2={effectiveAreaM2} unit={areaUnit} />
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

      {settled &&
        (effectiveAreaM2 === null ? (
          <div className={hintBox}>
            <Info size={20} aria-hidden />
            {/* v1 calcNoAreaMsg 개별/그룹 문안 구분 보존 */}
            <p>
              {groupSelected
                ? '그룹 내 필지의 면적 정보가 없습니다. V-World에서 토지 정보를 먼저 조회해주세요.'
                : '이 필지의 면적 정보가 없습니다. V-World에서 토지 정보를 먼저 조회해주세요.'}
            </p>
          </div>
        ) : recipes.length === 0 ? (
          <div className={hintBox}>
            <Info size={20} aria-hidden />
            <p>설정된 계산 항목이 없습니다. 자동 계산기 설정에서 항목을 추가하세요.</p>
          </div>
        ) : (
          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-ink-muted">레시피별 투입량</h3>
            <div className="overflow-hidden rounded-md border border-border">
              {recipes.map((r) => (
                <ListRow
                  key={r.id}
                  title={r.name || '(이름 없음)'}
                  subtitle={`${formatRecipeAmount(r.baseArea)} ${r.baseUnit}당 ${formatRecipeAmount(r.amount)} ${r.amountUnit}`}
                  trailing={
                    <span className="font-mono text-[14px] font-semibold text-ink tabular-nums">
                      {formatRecipeAmount(computeRecipeAmount(r, effectiveAreaM2))} {r.amountUnit}
                    </span>
                  }
                />
              ))}
            </div>
          </section>
        ))}
    </Sheet>
  )
}
