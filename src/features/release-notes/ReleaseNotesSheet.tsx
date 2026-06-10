import { Tag } from 'lucide-react'
import releaseNotesRaw from '../../../RELEASE_NOTES.md?raw'
import { Button, Sheet } from '../../components/ui'
import { parseReleaseNotes } from './parseReleaseNotes'

// 빌드 타임 ?raw 포함이므로 모듈 로드 시 1회 파싱 — 런타임 fetch·로딩/실패 상태 없음 (명세 재설계 사항)
const SECTIONS = parseReleaseNotes(releaseNotesRaw)

export interface ReleaseNotesSheetProps {
  onClose: () => void
}

export function ReleaseNotesSheet({ onClose }: ReleaseNotesSheetProps) {
  return (
    <Sheet onClose={onClose}>
      <header className="mb-4">
        <p className="text-xs font-semibold text-primary">앱 정보</p>
        <h2 className="mt-0.5 text-lg font-bold text-ink">릴리즈 노트</h2>
        <p className="mt-0.5 text-[13px] text-ink-muted">버전별 업데이트 내역을 확인합니다.</p>
      </header>

      <div className="flex flex-col gap-3">
        {SECTIONS.map((section, i) => (
          <section
            key={i}
            className="overflow-hidden rounded-md border border-border bg-surface"
          >
            <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-bold text-primary">
              <Tag size={14} aria-hidden className="shrink-0" />
              {section.version}
            </h3>
            <div className="flex flex-col gap-3 px-4 py-3">
              {section.groups.map((group, j) => (
                <div key={j}>
                  <h4 className="mb-1.5 text-[11px] font-bold tracking-wider text-ink-muted uppercase">
                    {group.heading}
                  </h4>
                  <ul className="flex flex-col gap-1">
                    {group.items.map((item, k) => (
                      <li key={k} className="flex gap-2 text-[13px] leading-relaxed text-ink">
                        <span aria-hidden className="shrink-0 text-primary">
                          •
                        </span>
                        <span>
                          {item.map((token, l) =>
                            token.strong ? (
                              <strong key={l}>{token.text}</strong>
                            ) : (
                              <span key={l}>{token.text}</span>
                            ),
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Button variant="secondary" full className="mt-4" onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  )
}
