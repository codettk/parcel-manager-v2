import { describe, expect, it } from 'vitest'
import { parseReleaseNotes } from '../../src/features/release-notes/parseReleaseNotes'

const SAMPLE = `# 릴리즈 노트

## 2026-06-11

### 새로운 기능

- **지적편집도 v2** 파일럿을 공개합니다.
- 릴리즈 노트를 확인할 수 있습니다.

### 개선사항

- 지도 로딩 속도를 개선했습니다.

## 2026-06-04

### 버그 수정

- 필지 경계선이 어긋나던 문제를 수정했습니다.
`

describe('parseReleaseNotes', () => {
  it('## 버전 섹션을 파일 기재 순서대로 반환한다', () => {
    const sections = parseReleaseNotes(SAMPLE)
    expect(sections.map((s) => s.version)).toEqual(['2026-06-11', '2026-06-04'])
  })

  it('### 그룹 헤딩과 - 항목을 섹션별로 구조화한다', () => {
    const [first, second] = parseReleaseNotes(SAMPLE)
    expect(first.groups.map((g) => g.heading)).toEqual(['새로운 기능', '개선사항'])
    expect(first.groups[0].items).toHaveLength(2)
    expect(first.groups[1].items).toHaveLength(1)
    expect(second.groups[0].heading).toBe('버그 수정')
    expect(second.groups[0].items[0]).toEqual([
      { text: '필지 경계선이 어긋나던 문제를 수정했습니다.', strong: false },
    ])
  })

  it('**강조**를 strong 토큰으로 분해하고 ** 마커를 남기지 않는다 (AC-3)', () => {
    const [first] = parseReleaseNotes(SAMPLE)
    const item = first.groups[0].items[0]
    expect(item).toEqual([
      { text: '지적편집도 v2', strong: true },
      { text: ' 파일럿을 공개합니다.', strong: false },
    ])
    expect(item.map((t) => t.text).join('')).not.toContain('**')
  })

  it('한 항목에 강조가 여러 번 있어도 모두 분해한다', () => {
    const [section] = parseReleaseNotes('## v1\n### 기능\n- **A**와 **B**를 지원')
    expect(section.groups[0].items[0]).toEqual([
      { text: 'A', strong: true },
      { text: '와 ', strong: false },
      { text: 'B', strong: true },
      { text: '를 지원', strong: false },
    ])
  })

  it('파싱 불가 라인(헤딩 없는 불릿·고아 그룹·일반 문단)은 조용히 무시한다 (AC-5)', () => {
    const messy = [
      '- 버전 섹션보다 먼저 나온 불릿',
      '### 버전 없는 그룹',
      '일반 문단 텍스트',
      '## 2026-06-11',
      '- 그룹 헤딩 없는 불릿',
      '#### 지원하지 않는 헤딩',
      '### 새로운 기능',
      '',
      '- 정상 항목',
    ].join('\n')
    expect(() => parseReleaseNotes(messy)).not.toThrow()
    const sections = parseReleaseNotes(messy)
    expect(sections).toEqual([
      {
        version: '2026-06-11',
        groups: [
          {
            heading: '새로운 기능',
            items: [[{ text: '정상 항목', strong: false }]],
          },
        ],
      },
    ])
  })

  it('빈 그룹은 항목 없이 유지되고 예외가 발생하지 않는다 (AC-5)', () => {
    const sections = parseReleaseNotes('## v1\n### 빈 그룹\n### 다음 그룹\n- 항목')
    expect(sections[0].groups).toEqual([
      { heading: '빈 그룹', items: [] },
      { heading: '다음 그룹', items: [[{ text: '항목', strong: false }]] },
    ])
  })

  it('빈 입력은 빈 배열을 반환한다 (AC-5)', () => {
    expect(parseReleaseNotes('')).toEqual([])
    expect(parseReleaseNotes('아무 규칙에도 맞지 않는 텍스트')).toEqual([])
  })
})
