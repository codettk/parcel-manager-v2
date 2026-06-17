import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Menu } from 'lucide-react'
import { IconButton, TabBar } from './components/ui'
import { AccountSheet } from './features/auth/AccountSheet'
import { HandoffErrorView } from './features/auth/HandoffErrorView'
import { LoginView } from './features/auth/LoginView'
import { readNativeHandoff } from './features/auth/authBridge'
import { useSession } from './features/auth/useSession'
import { completeOAuthFromUrl, setSessionFromHandoff, OAUTH_CALLBACK_PATH } from './lib/auth'
import { useAuthStore } from './stores/auth'
import { CalculatorModeBadge } from './features/calculator/CalculatorModeBadge'
import { CalculatorResultSheet } from './features/calculator/CalculatorResultSheet'
import { CalculatorSettingsSheet } from './features/calculator/CalculatorSettingsSheet'
import { AddToGroupBanner } from './features/group/AddToGroupBanner'
import { GroupSheet } from './features/group/GroupSheet'
import { ContactsView } from './features/erp/ContactsView'
import { StaffView } from './features/erp/StaffView'
import { WorkLogView } from './features/erp/worklog/WorkLogView'
import { ParcelListView } from './features/list/ParcelListView'
import { MultiSelectOverlay } from './features/group/MultiSelectOverlay'
import { JimokFilter } from './features/map/JimokFilter'
import { MapCanvas } from './features/map/MapCanvas'
import { RegionChip } from './features/region/RegionChip'
import { RegionManageView } from './features/region/RegionManageView'
import { RegionSelectView } from './features/region/RegionSelectView'
import { PaletteSheet } from './features/palette/PaletteSheet'
import { ParcelSheet } from './features/parcel/ParcelSheet'
import { HistorySheet } from './features/tab/HistorySheet'
import { NavDrawer } from './features/tab/NavDrawer'
import { ResetSheet } from './features/tab/ResetSheet'
import { ReleaseNotesSheet } from './features/release-notes/ReleaseNotesSheet'
import { ShareSheet } from './features/share/ShareSheet'
import { initRealtime } from './lib/realtime'
import { selectColorById, selectSelection } from './stores/selectors'
import { useRegionsStore } from './stores/regions'
import { useUiStore } from './stores/ui'
import { useWorkspaceStore } from './stores/workspace'

const UIDemo = lazy(() => import('./dev/UIDemo'))

/** 핸드오프/콜백 에러 상태 — null이면 정상, code가 있으면 HandoffErrorView (AC-7·14) */
type AuthError = { code: string } | null

function App() {
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)
  // 설정 시트 열림은 App 로컬 (releaseNotesOpen 선례) — 계산기 '모드'만 ui 스토어 소관
  const [calcSettingsOpen, setCalcSettingsOpen] = useState(false)
  const { status: authStatus } = useSession()
  const accountOpen = useUiStore((s) => s.accountOpen)
  const [authError, setAuthError] = useState<AuthError>(null)
  // OAuth 콜백/네이티브 핸드오프 처리 중 — authed 전이 전까지 게이트를 막는 1회성 비계
  const [callbackBusy, setCallbackBusy] = useState(
    () => window.location.pathname === OAUTH_CALLBACK_PATH,
  )
  const overrides = useWorkspaceStore((s) => s.overrides)
  const groups = useWorkspaceStore((s) => s.groups)
  const colorById = useWorkspaceStore(selectColorById)
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab)
  const createTab = useWorkspaceStore((s) => s.createTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const softCloseTab = useWorkspaceStore((s) => s.softCloseTab)
  const selection = useUiStore(selectSelection)
  const tapParcel = useUiStore((s) => s.tapParcel)
  const openSheet = useUiStore((s) => s.openSheet)
  const listViewOpen = useUiStore((s) => s.listViewOpen)
  const calculatorActive = useUiStore((s) => s.calculatorActive)
  const enterCalculatorMode = useUiStore((s) => s.enterCalculatorMode)
  const openNavDrawer = useUiStore((s) => s.openNavDrawer)
  const historyOpen = useUiStore((s) => s.historyOpen)
  const paletteOpen = useUiStore((s) => s.paletteOpen)
  const shareOpen = useUiStore((s) => s.shareOpen)
  const resetSheetOpen = useUiStore((s) => s.resetSheetOpen)
  const jimokFilter = useUiStore((s) => s.jimokFilter)
  const staffViewOpen = useUiStore((s) => s.staffViewOpen)
  const contactsViewOpen = useUiStore((s) => s.contactsViewOpen)
  const workLogViewOpen = useUiStore((s) => s.workLogViewOpen)
  const activeRegionId = useUiStore((s) => s.activeRegionId)
  const regionSelectOpen = useUiStore((s) => s.regionSelectOpen)
  const regionManageOpen = useUiStore((s) => s.regionManageOpen)

  // ── 인증 게이트 부팅 (명세 §부팅 순서: 로그인 → region → 지도). 1회성 게이트(StrictMode 이중 가드)
  const authRequested = useRef(false)
  useEffect(() => {
    if (authRequested.current) return
    authRequested.current = true
    void (async () => {
      // 네이티브 핸드오프 수신 우선 (AC-13·14) — 토큰 있으면 세션 수립, 형식오류/만료면 에러 뷰
      const handoff = readNativeHandoff()
      if (handoff.kind === 'error') {
        setAuthError({ code: handoff.code })
        await useAuthStore.getState().init()
        return
      }
      if (handoff.kind === 'token') {
        try {
          await setSessionFromHandoff(handoff.token)
        } catch {
          setAuthError({ code: 'AUTH_HANDOFF_SESSION_FAILED' })
        }
      }
      // OAuth 콜백(?code=…)이면 세션 교환 후 게이트로 (AC-2). 실패는 핸드오프 에러(AC-7)
      if (window.location.pathname === OAUTH_CALLBACK_PATH) {
        try {
          await completeOAuthFromUrl()
          // 콜백 쿼리를 URL에서 제거해 새로고침 재처리·코드 노출을 막는다
          window.history.replaceState({}, '', '/')
        } catch {
          setAuthError({ code: 'AUTH_OAUTH_CALLBACK_FAILED' })
        } finally {
          setCallbackBusy(false)
        }
      }
      await useAuthStore.getState().init()
    })()
  }, [])

  // ── 인증 후 작업공간 부팅 — authed 전이 시 1회만 (로그인이 region·지도보다 앞선다)
  const bootRequested = useRef(false)
  useEffect(() => {
    if (authStatus !== 'authed' || bootRequested.current) return
    bootRequested.current = true
    // region 카탈로그·받은 목록 부팅 (전국 전환) — 실패해도 시드/로컬 폴백으로 진행 (명세 절충 4)
    void useRegionsStore.getState().loadCatalog()
    void useRegionsStore.getState().loadMine()
    void useWorkspaceStore
      .getState()
      .boot()
      .then(async () => {
        // boot 실패 시 activeTabId가 null — realtime 미기동 (명세 §부팅 시퀀스)
        if (useWorkspaceStore.getState().activeTabId !== null) await initRealtime()
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) console.warn('[realtime] 기동 실패 — 동기화 없이 계속:', err)
      })
  }, [authStatus])

  if (import.meta.env.DEV && window.location.pathname === '/__ui') {
    return (
      <Suspense fallback={null}>
        <UIDemo />
      </Suspense>
    )
  }

  // ── 인증 게이트 (AC-1·2·6·7·14) — 최상단 우선순위. authed 전까지 region·지도·탭바 일체 미렌더.
  // 핸드오프/콜백 에러는 LoginView보다 우선(재시도·웹 폴백 경로 제공).
  if (authError !== null) {
    return (
      <main className="h-full">
        <HandoffErrorView code={authError.code} onRetry={() => setAuthError(null)} />
      </main>
    )
  }
  // 세션 복원/콜백 처리 중 — 스플래시(본문 미노출). callbackBusy는 ?code 교환 진행 중 게이트 유지
  if (authStatus === 'loading' || callbackBusy) {
    return <main className="h-full bg-surface" aria-busy="true" />
  }
  if (authStatus === 'anon') {
    return (
      <main className="h-full">
        <LoginView onAuthError={() => setAuthError({ code: 'AUTH_SIGNIN_FAILED' })} />
      </main>
    )
  }

  // region 진입 게이트 (AC-4·9) — 미선택이거나 칩/메뉴로 재진입 시 지도·탭바 대신 풀스크린 선택 화면.
  // 지역 관리(AC-11)도 동일 레이어 — region 관련 풀스크린 뷰는 지도 위가 아니라 지도를 대체한다.
  if (activeRegionId === null || regionSelectOpen) {
    return (
      <main className="h-full">
        <RegionSelectView />
      </main>
    )
  }
  if (regionManageOpen) {
    return (
      <main className="h-full">
        <RegionManageView />
      </main>
    )
  }

  return (
    <main className="flex h-full flex-col">
      {/* 최상단 전용 행 — 햄버거 + TabBar. 지도 위 오버레이가 아니라 별도 레이아웃 행이라
          모드 배지(top-3)·지목 필터·멀티선택 토글과 y 겹침이 구조적으로 차단된다 (M-14 교훈) */}
      <div className="flex shrink-0 items-stretch border-b border-border bg-surface">
        <IconButton
          icon={Menu}
          aria-label="메뉴"
          className="shrink-0 self-center"
          onClick={openNavDrawer}
        />
        {/* TabBar는 가로 스크롤을 자체 처리 — min-w-0로 flex 자식이 넘칠 때 스크롤이 동작 */}
        <div className="min-w-0 flex-1">
          {activeTabId !== null && (
            <TabBar
              tabs={tabs.map((t) => ({ id: t.tabId, name: t.name }))}
              activeId={activeTabId}
              onSelect={(id) => void setActiveTab(id)}
              onAdd={() => void createTab()}
              onClose={(id) => void softCloseTab(id)}
              onRename={renameTab}
            />
          )}
        </div>
      </div>

      {/* 지도 영역 — 이 컨테이너 기준으로 모든 absolute 오버레이가 배치된다 (TabBar 행 아래) */}
      <div className="relative min-h-0 flex-1">
        <MapCanvas
          regionId={activeRegionId ?? undefined}
          overrides={overrides}
          groups={groups}
          colorById={colorById}
          selection={selection}
          jimokFilter={jimokFilter}
          onParcelTap={tapParcel}
        />
        {/* 현재 region 칩 (AC-8) — 지도 좌상단. 모드 배지(top-3 중앙)·멀티선택 토글(top-16 right-3)·
            지목 칩 바(top-28)와 좌표가 겹치지 않게 left-3 상단 모서리에 둔다 (M-14 가림 교훈 준수) */}
        {!listViewOpen && (
          <div className="absolute top-3 left-3 z-10">
            <RegionChip />
          </div>
        )}
        {/* 지목 필터 칩 바 (M-14) — 지도 위 상단. 목록 뷰에선 미표시(v1 view!=='list' 보존).
            top-3 중앙엔 모드 배지(계산기/멀티선택/추가)·top-16 right-3엔 멀티선택 토글이 떠서
            그 두 행을 비켜 독립 행(top-28)에 전체 폭으로 둔다 (M-14 가림 교훈 — 칩 바가 IconButton에
            가리지 않게). TabBar는 지도 컨테이너 위 별도 레이아웃 행이라 top-* 좌표와 무관하다 */}
        {!listViewOpen && (
          <div className="absolute top-28 right-3 left-3 z-10">
            <JimokFilter />
          </div>
        )}
        <MultiSelectOverlay />
        {calculatorActive && <CalculatorModeBadge />}
        {selection.addToGroupModeGroupId !== null && <AddToGroupBanner />}
        {/* 목록은 시트(z-40/50) 아래 레이어 — 행 탭으로 열린 시트가 목록 위에 뜬다 (명세 §행 탭) */}
        {listViewOpen && <ParcelListView />}
        {/* 영농 PRO 풀스크린 뷰 (슬라이스 5a, z-30) — 자체 시트(생성·수정)는 뷰 내부 로컬 상태 */}
        {staffViewOpen && <StaffView />}
        {contactsViewOpen && <ContactsView />}
        {workLogViewOpen && <WorkLogView />}
      </div>

      <NavDrawer
        onOpenReleaseNotes={() => setReleaseNotesOpen(true)}
        onOpenCalculator={() => setCalcSettingsOpen(true)}
      />
      {historyOpen && <HistorySheet />}
      {accountOpen && <AccountSheet />}
      {releaseNotesOpen && <ReleaseNotesSheet onClose={() => setReleaseNotesOpen(false)} />}
      {paletteOpen && <PaletteSheet />}
      {shareOpen && <ShareSheet />}
      {resetSheetOpen && <ResetSheet />}
      {calcSettingsOpen && (
        <CalculatorSettingsSheet
          onClose={() => setCalcSettingsOpen(false)}
          onStart={() => {
            setCalcSettingsOpen(false)
            enterCalculatorMode()
          }}
        />
      )}
      {openSheet === 'calcResult' && selection.selectedParcelId !== null && (
        <CalculatorResultSheet parcelId={selection.selectedParcelId} />
      )}
      {openSheet === 'parcel' && selection.selectedParcelId !== null && (
        <ParcelSheet parcelId={selection.selectedParcelId} />
      )}
      {openSheet === 'group' && selection.selectedGroupId !== null && (
        <GroupSheet groupId={selection.selectedGroupId} />
      )}
    </main>
  )
}

export default App
