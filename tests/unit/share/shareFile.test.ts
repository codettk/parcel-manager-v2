import { describe, expect, it } from 'vitest'
import {
  SHARE_PARSE_ERROR,
  SHARE_VERSION_ERROR,
  buildShareFile,
  buildShareFileName,
  mergeColors,
  parseShareFile,
  shareFileSchema,
} from '../../../src/features/share/shareFile'
import type { ColorLabel } from '../../../src/types/api/colors'
import type { Group, ParcelOverride } from '../../../src/types/api/tabState'

// 명세: docs/specs/share-json.md — AC-1·AC-2·AC-3 (순수 로직). AC-4~6은 ShareSheet.test.tsx, AC-7은 E2E(tester) 소관.

const OVERRIDES: Record<string, ParcelOverride> = {
  p1: { color: 'eco', style: 'fill', name: '북측 밭', memo: null, pinned: false, icon: null },
  // null 필드 포함 케이스 (AC-1)
  p2: { color: null, style: null, name: null, memo: '검토 중', pinned: true, icon: null },
}

const GROUPS: Record<string, Group> = {
  g_a1b2: { name: '1구역', memo: null, color: 'sun', style: 'border', parcelIds: ['p1', 'p2'] },
}

const COLORS: ColorLabel[] = [
  { colorId: 'eco', label: '매수 예정', hex: '#6CA945', sortOrder: 0 },
  { colorId: 'sun', label: '매수 완료', hex: '#D9A441', sortOrder: 1 },
]

const VALID_FILE = {
  version: 2,
  tabId: 'tab_origin',
  exportedAt: '2026-06-12T00:30:00.000Z',
  overrides: OVERRIDES,
  groups: GROUPS,
  colors: COLORS,
}

describe('AC-1: version 2 포맷 safeParse 성공', () => {
  it('overrides 2건(null 필드 포함)·groups 1건·colors 2건 객체를 통과시키고 값을 보존한다', () => {
    const result = shareFileSchema.safeParse(VALID_FILE)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(VALID_FILE)
  })
})

describe('AC-2: 비정상 포맷 safeParse 실패', () => {
  it('v1 실포맷 파일을 거부한다', () => {
    const v1File = {
      version: 1,
      colors: [{ id: 'eco', label: '매수 예정' }],
      parcels: {},
      groups: {},
    }
    expect(shareFileSchema.safeParse(v1File).success).toBe(false)
  })

  it('version 누락을 거부한다', () => {
    const withoutVersion: Record<string, unknown> = { ...VALID_FILE }
    delete withoutVersion.version
    expect(shareFileSchema.safeParse(withoutVersion).success).toBe(false)
  })

  it('overrides가 배열인 객체를 거부한다', () => {
    expect(shareFileSchema.safeParse({ ...VALID_FILE, overrides: [] }).success).toBe(false)
  })

  it('colors hex가 3자리(#fff)인 객체를 거부한다', () => {
    const shortHex = { ...VALID_FILE, colors: [{ ...COLORS[0], hex: '#fff' }] }
    expect(shareFileSchema.safeParse(shortHex).success).toBe(false)
  })
})

describe('AC-3: buildShareFile 왕복 무결성', () => {
  it('version 2·tabId·ISO exportedAt을 갖고 내용이 입력과 일치하며 스키마를 재통과한다', () => {
    const result = buildShareFile({
      activeTabId: 'tab_origin',
      overrides: OVERRIDES,
      groups: GROUPS,
      colorLabels: COLORS,
    })

    expect(result.version).toBe(2)
    expect(result.tabId).toBe('tab_origin')
    // ISO 8601 — 재직렬화가 원문과 동일하면 toISOString 형식
    expect(new Date(result.exportedAt).toISOString()).toBe(result.exportedAt)
    expect(result.overrides).toEqual(OVERRIDES)
    expect(result.groups).toEqual(GROUPS)
    expect(result.colors).toEqual(COLORS)
    expect(shareFileSchema.parse(result)).toEqual(result)
  })
})

describe('buildShareFileName — 파일명 불가 문자 치환', () => {
  it('탭 이름의 \\ / : * ? " < > | 를 _로 치환하고 날짜를 붙인다', () => {
    const now = new Date('2026-06-12T09:30:00.000Z')
    expect(buildShareFileName('1차: 매수/검토', now)).toBe(
      '필지_1차_ 매수_검토_2026-06-12.json',
    )
    expect(buildShareFileName('a\\b*c?d"e<f>g|h', now)).toBe(
      '필지_a_b_c_d_e_f_g_h_2026-06-12.json',
    )
  })
})

describe('parseShareFile — 오류 메시지 구분', () => {
  it('비JSON 텍스트는 일반 형식 오류를 돌려준다', () => {
    expect(parseShareFile('not json {')).toEqual({ ok: false, message: SHARE_PARSE_ERROR })
  })

  it('version이 2가 아니면 버전 전용 문구를 돌려준다', () => {
    const v1 = JSON.stringify({ version: 1, colors: [], parcels: {}, groups: {} })
    expect(parseShareFile(v1)).toEqual({ ok: false, message: SHARE_VERSION_ERROR })
  })

  it('version 없이 구조만 다른 JSON은 일반 형식 오류를 돌려준다', () => {
    expect(parseShareFile('{"foo": 1}')).toEqual({ ok: false, message: SHARE_PARSE_ERROR })
  })

  it('유효 파일은 검증된 객체를 돌려준다', () => {
    expect(parseShareFile(JSON.stringify(VALID_FILE))).toEqual({ ok: true, file: VALID_FILE })
  })
})

describe('mergeColors — upsert 병합 의미론', () => {
  it('같은 colorId는 파일 값으로, 새 id는 추가, 기존에만 있는 색은 보존한다', () => {
    const incoming: ColorLabel[] = [
      { colorId: 'eco', label: '계약 완료', hex: '#111122', sortOrder: 5 },
      { colorId: 'sky', label: '임차', hex: '#5B8FB9', sortOrder: 2 },
    ]

    expect(mergeColors(COLORS, incoming)).toEqual([
      { colorId: 'eco', label: '계약 완료', hex: '#111122', sortOrder: 5 },
      { colorId: 'sun', label: '매수 완료', hex: '#D9A441', sortOrder: 1 },
      { colorId: 'sky', label: '임차', hex: '#5B8FB9', sortOrder: 2 },
    ])
  })
})
