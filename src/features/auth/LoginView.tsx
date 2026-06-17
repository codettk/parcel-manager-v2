import { useState } from 'react'
import { Apple, MessageCircle, Smartphone } from 'lucide-react'
import { signInWithKakao } from '../../lib/auth'

export interface LoginViewProps {
  /** 카카오 OAuth 시작 자체가 실패(키 미구성·네트워크)하면 핸드오프 에러 뷰로 폴백 (AC-7) */
  onAuthError: () => void
}

/**
 * 로그인 진입 게이트 (AC-1·2·8) — 비로그인 시 앱 본문을 대체하는 풀스크린.
 * 카카오만 실구현(primary), Apple·휴대폰은 "준비 중"(세션 미수립, AC-8).
 * 디자인 모바일 ②(jU0Lr) — 브랜드 히어로 + 하단 제공자 버튼 스택.
 */
export function LoginView({ onAuthError }: LoginViewProps) {
  const [pending, setPending] = useState(false)
  const [comingSoon, setComingSoon] = useState<string | null>(null)

  async function handleKakao() {
    setComingSoon(null)
    setPending(true)
    try {
      await signInWithKakao() // 성공 시 OAuth 제공자로 리다이렉트 (이 페이지를 떠남)
    } catch {
      setPending(false)
      onAuthError() // AC-7 — 시작 실패도 핸드오프 에러 경로로
    }
  }

  return (
    <section className="flex h-full flex-col bg-surface">
      {/* 브랜드 히어로 — 로고·앱이름·태그라인 (디자인 ② 히어로) */}
      <div className="flex flex-1 flex-col items-center justify-center gap-[18px] px-8">
        <div
          className="flex size-[82px] items-center justify-center rounded-[24px] bg-primary"
          aria-hidden
        >
          <svg viewBox="0 0 100 100" className="size-11 text-surface" fill="currentColor">
            <path d="M50 12 78 30v36L50 88 22 66V30z" />
          </svg>
        </div>
        <h1 className="text-[38px] font-extrabold text-ink">필지</h1>
        <p className="text-center text-[14px] font-medium text-ink-muted">
          전국 지적도를 색칠하고 메모하세요
        </p>
      </div>

      {/* 제공자 버튼 스택 (디자인 ② 하단) */}
      <div className="flex flex-col gap-2.5 px-6 pb-9">
        {comingSoon !== null && (
          <p
            role="status"
            className="rounded-md bg-surface-alt px-3 py-2 text-center text-[12.5px] text-ink-muted"
          >
            {comingSoon}는 준비 중이에요. 지금은 카카오로 시작할 수 있어요.
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleKakao()}
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-kakao py-[15px] text-[15.5px] font-bold text-kakao-ink transition-[filter] active:brightness-95 disabled:opacity-60"
        >
          <MessageCircle aria-hidden className="size-[19px]" />
          {pending ? '카카오로 이동 중…' : '카카오로 시작하기'}
        </button>

        <button
          type="button"
          onClick={() => setComingSoon('Apple 로그인')}
          aria-label="Apple로 계속하기 (준비 중)"
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-ink py-[15px] text-[15.5px] font-bold text-surface opacity-50"
        >
          <Apple aria-hidden className="size-[19px]" />
          Apple로 계속하기
        </button>

        <button
          type="button"
          onClick={() => setComingSoon('휴대폰 로그인')}
          aria-label="휴대폰 번호로 계속 (준비 중)"
          className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-surface py-[15px] text-[15.5px] font-bold text-ink opacity-50"
        >
          <Smartphone aria-hidden className="size-[19px]" />
          휴대폰 번호로 계속
        </button>

        <p className="text-center text-[11.5px] font-medium text-ink-muted">
          계속하면 이용약관과 개인정보처리방침에 동의합니다
        </p>
      </div>
    </section>
  )
}
