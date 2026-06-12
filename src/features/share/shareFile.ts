import { z } from 'zod'
import { colorLabelSchema, type ColorLabel } from '../../types/api/colors'
import {
  groupSchema,
  parcelOverrideSchema,
  type Group,
  type ParcelOverride,
} from '../../types/api/tabState'

/**
 * 공유 파일 포맷 (version 2) — 클라이언트 전용이라 src/types/api/가 아닌 features 소관.
 * 서버는 파일을 모르고 importTabRequestSchema의 overrides/groups만 받는다 (명세 §파일 포맷)
 */
export const shareFileSchema = z.object({
  version: z.literal(2),
  /** 출처 탭 (정보용 메타) — 적용 대상이 아니다. 적용은 항상 현재 활성 탭 */
  tabId: z.string().min(1),
  exportedAt: z.iso.datetime(),
  overrides: z.record(z.string(), parcelOverrideSchema),
  groups: z.record(z.string(), groupSchema),
  colors: z.array(colorLabelSchema),
})
export type ShareFile = z.infer<typeof shareFileSchema>

/** buildShareFile 입력 — workspace 스토어의 해당 필드 부분집합과 동형 */
export interface ShareSource {
  activeTabId: string
  overrides: Record<string, ParcelOverride>
  groups: Record<string, Group>
  colorLabels: ColorLabel[]
}

export function buildShareFile(source: ShareSource): ShareFile {
  return {
    version: 2,
    tabId: source.activeTabId,
    exportedAt: new Date().toISOString(),
    overrides: source.overrides,
    groups: source.groups,
    colors: source.colorLabels,
  }
}

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g

/** `보구곶리_{탭이름}_{YYYY-MM-DD}.json` — 날짜는 v1 exportJSON과 동일하게 toISOString 기준 */
export function buildShareFileName(tabName: string, now: Date = new Date()): string {
  const safeName = tabName.replace(INVALID_FILENAME_CHARS, '_')
  return `보구곶리_${safeName}_${now.toISOString().slice(0, 10)}.json`
}

export const SHARE_PARSE_ERROR = 'JSON 파일을 읽을 수 없습니다. 파일 형식을 확인해 주세요.'
export const SHARE_VERSION_ERROR =
  '지원하지 않는 파일 버전입니다. v2 앱에서 내보낸 파일만 불러올 수 있습니다.'

export type ParseShareFileResult = { ok: true; file: ShareFile } | { ok: false; message: string }

/** 파일 텍스트 → 검증된 ShareFile. 실패 메시지는 버전 불일치(v1 파일 등)와 일반 형식 오류를 구분 */
export function parseShareFile(text: string): ParseShareFileResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, message: SHARE_PARSE_ERROR }
  }
  const parsed = shareFileSchema.safeParse(raw)
  if (parsed.success) return { ok: true, file: parsed.data }
  const wrongVersion =
    typeof raw === 'object' &&
    raw !== null &&
    'version' in raw &&
    (raw as Record<string, unknown>).version !== 2
  return { ok: false, message: wrongVersion ? SHARE_VERSION_ERROR : SHARE_PARSE_ERROR }
}

/**
 * colors upsert 병합 — 같은 colorId는 파일 값으로 갱신, 새 id는 추가, 기존에만 있는 색은 보존.
 * colors는 전 탭 공유 자원이라 전체 교체하면 수신자의 다른 탭 색 참조가 파괴된다 (명세 §colors 의미론)
 */
export function mergeColors(existing: ColorLabel[], incoming: ColorLabel[]): ColorLabel[] {
  const byId = new Map(existing.map((c) => [c.colorId, c] as const))
  for (const c of incoming) byId.set(c.colorId, c)
  return [...byId.values()]
}

/** 미리보기 "{YYYY-MM-DD HH:mm}에 내보냄" 로컬 시각 표기 — 파싱 불가 시 원문 폴백 */
export function formatExportedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
