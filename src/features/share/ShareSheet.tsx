import { useRef, useState, type ChangeEvent } from 'react'
import { CircleAlert, CircleCheck, TriangleAlert, X } from 'lucide-react'
import { Badge, Button, IconButton, Sheet } from '../../components/ui'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore } from '../../stores/workspace'
import {
  SHARE_PARSE_ERROR,
  buildShareFile,
  buildShareFileName,
  formatExportedAt,
  parseShareFile,
  type ShareFile,
} from './shareFile'

/** 시트 3상태 — preview만 별도 화면, error/applied는 기본 화면의 인라인 표시 */
type Phase =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; file: ShareFile }
  | { kind: 'applied' }

interface StatProps {
  label: string
  value: number
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className="flex items-end gap-0.5">
        <span className="font-mono text-lg leading-none font-semibold text-ink">{value}</span>
        <span className="text-xs text-ink-muted">개</span>
      </p>
    </div>
  )
}

/**
 * 공유 시트 (M-12, v1 ShareSheet 재설계) — 내보내기 = Blob 다운로드,
 * 불러오기 = zod 검증 → 미리보기/확인 → importFromFile(전체 교체 + colors 병합 + 재조회)
 */
export function ShareSheet() {
  const closeShare = useUiStore((s) => s.closeShare)
  const overrides = useWorkspaceStore((s) => s.overrides)
  const groups = useWorkspaceStore((s) => s.groups)
  const importFromFile = useWorkspaceStore((s) => s.importFromFile)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [applying, setApplying] = useState(false)

  const handleExport = () => {
    const { activeTabId, tabs, overrides, groups, colorLabels } = useWorkspaceStore.getState()
    if (activeTabId === null) return
    const payload = buildShareFile({ activeTabId, overrides, groups, colorLabels })
    const tabName = tabs.find((t) => t.tabId === activeTabId)?.name ?? activeTabId
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = buildShareFileName(tabName)
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // 같은 파일 재선택에도 change가 발화하도록 즉시 초기화 (v1 fileRef 패턴 보존)
    e.target.value = ''
    if (file === undefined) return
    let text: string
    try {
      text = await file.text()
    } catch {
      setPhase({ kind: 'error', message: SHARE_PARSE_ERROR })
      return
    }
    const result = parseShareFile(text)
    setPhase(
      result.ok
        ? { kind: 'preview', file: result.file }
        : { kind: 'error', message: result.message },
    )
  }

  const handleApply = async () => {
    if (phase.kind !== 'preview' || applying) return
    setApplying(true)
    try {
      const { overrides, groups, colors } = phase.file
      await importFromFile({ overrides, groups, colors })
      setPhase({ kind: 'applied' })
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setApplying(false)
    }
  }

  if (phase.kind === 'preview') {
    const { file } = phase
    const colorCount = file.colors.length
    return (
      <Sheet onClose={closeShare}>
        <header className="mb-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-muted">공유 — 불러오기 확인</p>
            <IconButton icon={X} size="sm" aria-label="닫기" onClick={closeShare} />
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            파일 내용을 확인한 뒤 적용을 누르면 현재 탭에 반영됩니다
          </p>
        </header>

        <div className="mb-4 flex flex-col gap-2 rounded-md bg-surface-alt p-3">
          <p className="text-xs font-semibold text-ink-muted">불러올 파일</p>
          <div className="flex items-center gap-2">
            <Badge>필지 {Object.keys(file.overrides).length}개</Badge>
            <Badge>그룹 {Object.keys(file.groups).length}개</Badge>
            <Badge>색 {colorCount}개</Badge>
          </div>
          <p className="text-xs text-ink-muted">
            {formatExportedAt(file.exportedAt)}에 내보냄 · 출처 탭: {file.tabId}
          </p>
        </div>

        <div className="mb-4 flex gap-2">
          <TriangleAlert size={16} aria-hidden className="shrink-0 text-danger" />
          <p className="text-xs text-danger">
            불러오면 현재 탭의 필지 설정과 그룹이 모두 교체되고
            {colorCount > 0 ? `, 팔레트 색 ${String(colorCount)}개는 모든 탭에 반영됩니다.` : '.'}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={applying}
            onClick={() => setPhase({ kind: 'idle' })}
          >
            취소
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={applying}
            onClick={() => void handleApply()}
          >
            적용
          </Button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={closeShare}>
      <header className="mb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-muted">공유 — JSON 파일로 동기화</p>
          <IconButton icon={X} size="sm" aria-label="닫기" onClick={closeShare} />
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          현재 탭의 색칠·이름·메모·그룹을 JSON 파일 하나로 주고받습니다
        </p>
      </header>

      <div className="mb-4 flex gap-2 rounded-md bg-surface-alt p-3">
        <Stat label="지정 지번" value={Object.keys(overrides).length} />
        <Stat label="그룹" value={Object.keys(groups).length} />
      </div>

      <Button full onClick={handleExport}>
        JSON 내보내기
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="JSON 파일 선택"
        onChange={(e) => void handleFileChange(e)}
      />
      <Button variant="secondary" full className="mt-4" onClick={() => fileRef.current?.click()}>
        JSON 불러오기
      </Button>

      {phase.kind === 'error' && (
        <div className="mt-4 flex gap-2">
          <CircleAlert size={16} aria-hidden className="shrink-0 text-danger" />
          <p className="text-xs text-danger">{phase.message}</p>
        </div>
      )}
      {phase.kind === 'applied' && (
        <div className="mt-4 flex gap-2">
          <CircleCheck size={16} aria-hidden className="shrink-0 text-primary" />
          <p className="text-xs text-ink">불러오기를 적용했습니다 — 현재 탭에 반영되었습니다.</p>
        </div>
      )}
    </Sheet>
  )
}
