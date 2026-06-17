import { useState } from 'react'
import { LogOut, User, X } from 'lucide-react'
import { Button, IconButton, Sheet } from '../../components/ui'
import { signOut } from '../../lib/auth'
import { useUiStore } from '../../stores/ui'
import type { AuthProvider } from '../../types/api/auth'
import { useSession } from './useSession'

const PROVIDER_LABEL: Record<AuthProvider, string> = {
  kakao: '카카오로 로그인',
  apple: 'Apple로 로그인',
  phone: '휴대폰 번호로 로그인',
}

/**
 * 내 정보 시트 (AC-4·6) — 디자인 모바일 ⑨(KGn5m)의 프로필 + 로그아웃.
 * PRO·환경설정·작업공간 항목은 이 슬라이스 비범위(PRO는 슬라이스 6, 작업공간은 NavDrawer 소관).
 * 세션 user를 표시하고 로그아웃 진입점을 제공한다 — 로그아웃은 onAuthStateChange가 anon으로 전이시킨다.
 */
export function AccountSheet() {
  const closeAccount = useUiStore((s) => s.closeAccount)
  const { user } = useSession()
  const [signingOut, setSigningOut] = useState(false)

  const displayName = user?.displayName ?? '로그인 사용자'
  const providerLabel = user ? PROVIDER_LABEL[user.provider] : ''

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut() // 세션 변화 구독이 anon 전이 + App 게이트가 LoginView 복귀 (AC-6)
      closeAccount()
    } catch {
      setSigningOut(false)
    }
  }

  return (
    <Sheet onClose={closeAccount}>
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-[18px] font-extrabold text-ink">내 정보</h2>
        <IconButton icon={X} size="sm" aria-label="닫기" onClick={closeAccount} />
      </header>

      {/* 프로필 카드 — 아바타·이름·연결된 로그인 수단 (디자인 ⑨ 프로필) */}
      <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
        <span
          className="flex size-13 shrink-0 items-center justify-center rounded-full bg-primary/10"
          aria-hidden
        >
          {user?.avatarUrl != null ? (
            <img src={user.avatarUrl} alt="" className="size-13 rounded-full object-cover" />
          ) : (
            <User className="size-6 text-primary" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-[17px] font-extrabold text-ink">{displayName}</p>
          {providerLabel !== '' && (
            <p className="truncate text-[12.5px] font-medium text-ink-muted">{providerLabel}</p>
          )}
          {user?.email != null && (
            <p className="truncate text-[12.5px] text-ink-muted">{user.email}</p>
          )}
        </div>
      </div>

      <Button
        variant="secondary"
        full
        onClick={() => void handleSignOut()}
        disabled={signingOut}
      >
        <LogOut aria-hidden className="size-[18px]" />
        {signingOut ? '로그아웃 중…' : '로그아웃'}
      </Button>
    </Sheet>
  )
}
