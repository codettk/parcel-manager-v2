import { Chip } from '../../components/ui'
import { useUiStore } from '../../stores/ui'
import { ALL_JIMOK, JIMOK_LABELS, isAllJimok } from './jimok'

/**
 * 지목 필터 칩 바 (M-14) — '전체' + 6 지목 칩. v1 드롭다운+체크박스를 Chip 토글 바로 재설계.
 * '전체'=isAll(6종 전부 선택) 토글, 개별 칩은 toggleJimok. 선택 표현은 Chip의 aria-pressed.
 */
export function JimokFilter() {
  const jimokFilter = useUiStore((s) => s.jimokFilter)
  const setJimokFilter = useUiStore((s) => s.setJimokFilter)
  const toggleJimok = useUiStore((s) => s.toggleJimok)

  const allSelected = isAllJimok(jimokFilter)

  // 모바일 375px에 7칩이 한 줄로 안 들어가므로 가로 스크롤(flex-nowrap + overflow-x-auto).
  // 각 칩은 shrink-0으로 압축 금지 — 좁은 폭에서 스와이프로 전 칩 도달.
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto rounded-full bg-surface/90 p-1.5 shadow-md backdrop-blur">
      <Chip
        className="shrink-0"
        selected={allSelected}
        onClick={() => setJimokFilter(allSelected ? [] : [...ALL_JIMOK])}
      >
        전체
      </Chip>
      {ALL_JIMOK.map((key) => (
        <Chip
          key={key}
          className="shrink-0"
          selected={jimokFilter.includes(key)}
          onClick={() => toggleJimok(key)}
        >
          {JIMOK_LABELS[key]}
        </Chip>
      ))}
    </div>
  )
}
