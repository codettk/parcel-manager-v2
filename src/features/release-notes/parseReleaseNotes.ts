export interface ReleaseNoteToken {
  text: string
  strong: boolean
}

export interface ReleaseNoteGroup {
  heading: string
  items: ReleaseNoteToken[][]
}

export interface ReleaseNoteSection {
  version: string
  groups: ReleaseNoteGroup[]
}

/**
 * 릴리즈 노트 마크다운 파서 — v1 규칙 보존:
 * `## ` = 버전 섹션, `### ` = 그룹 헤딩, `- ` = 항목, 항목 내 `**텍스트**` = 강조.
 * 규칙에 맞지 않는 라인(헤딩 없는 불릿, 일반 문단 등)은 조용히 무시한다.
 * v1과 달리 HTML 문자열 대신 구조화 토큰을 반환한다 (innerHTML 주입 표면 제거).
 */
export function parseReleaseNotes(text: string): ReleaseNoteSection[] {
  const sections: ReleaseNoteSection[] = []
  let section: ReleaseNoteSection | null = null
  let group: ReleaseNoteGroup | null = null

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('## ')) {
      section = { version: line.slice(3).trim(), groups: [] }
      sections.push(section)
      group = null
    } else if (line.startsWith('### ') && section) {
      group = { heading: line.slice(4).trim(), items: [] }
      section.groups.push(group)
    } else if (line.startsWith('- ') && group) {
      group.items.push(tokenizeEmphasis(line.slice(2).trim()))
    }
  }
  return sections
}

/** `**강조**` 마커를 strong 토큰으로 분해 — 마커가 화면에 노출되지 않는다 */
function tokenizeEmphasis(content: string): ReleaseNoteToken[] {
  const tokens: ReleaseNoteToken[] = []
  let last = 0
  for (const m of content.matchAll(/\*\*(.+?)\*\*/g)) {
    if (m.index > last) tokens.push({ text: content.slice(last, m.index), strong: false })
    tokens.push({ text: m[1], strong: true })
    last = m.index + m[0].length
  }
  if (last < content.length) tokens.push({ text: content.slice(last), strong: false })
  return tokens
}
