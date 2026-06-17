import { RefreshCw, TriangleAlert } from 'lucide-react'
import { signInWithKakao } from '../../lib/auth'

export interface HandoffErrorViewProps {
  /** 오류 코드(진단용 — 핸드오프 만료/형식오류·OAuth 콜백 실패) */
  code: string
  /** "다시 시도" — 호출부가 재시도 흐름을 정의(콜백 재처리 등). 없으면 카카오 OAuth 재시작 */
  onRetry?: () => void
}

/**
 * 로그인 핸드오프/콜백 에러 화면 (AC-7·14) — 디자인 모바일 ㊹(DYqzv).
 * "다시 시도" + "다른 방법으로 로그인"(웹 카카오 OAuth 폴백). 앱은 크래시 없이 이 뷰에 머문다.
 */
export function HandoffErrorView({ code, onRetry }: HandoffErrorViewProps) {
  function handleWebFallback() {
    void signInWithKakao().catch(() => {
      // 폴백 시작 실패는 같은 화면 유지 — 사용자가 재시도 가능
    })
  }

  return (
    <section className="flex h-full flex-col bg-surface">
      <div className="flex flex-1 flex-col items-center justify-center gap-[18px] px-10">
        <div
          className="flex size-[100px] items-center justify-center rounded-full bg-danger/10"
          aria-hidden
        >
          <TriangleAlert className="size-11 text-danger" />
        </div>
        <h1 className="text-[22px] font-extrabold text-ink">연결에 실패했어요</h1>
        <p className="text-center text-[13.5px] font-medium leading-relaxed text-ink-muted">
          로그인 정보를 가져오지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.
        </p>
        <span className="rounded-md bg-surface-alt px-3 py-[7px] font-mono text-[11.5px] text-ink-muted">
          오류 코드 · {code}
        </span>
      </div>

      <div className="flex flex-col gap-2 px-6 pb-10">
        <button
          type="button"
          onClick={onRetry ?? handleWebFallback}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-primary py-[15px] text-[15.5px] font-bold text-surface active:brightness-90"
        >
          <RefreshCw aria-hidden className="size-[18px]" />
          다시 시도
        </button>
        <button
          type="button"
          onClick={handleWebFallback}
          className="w-full py-[13px] text-center text-[14px] font-semibold text-ink-muted active:opacity-70"
        >
          다른 방법으로 로그인
        </button>
      </div>
    </section>
  )
}
