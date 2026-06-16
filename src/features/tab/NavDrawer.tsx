import { Calculator, History, List, Palette, RotateCcw, ScrollText, Share2 } from 'lucide-react'
import { Drawer, DrawerItem, DrawerSection } from '../../components/ui'
import { useUiStore } from '../../stores/ui'

export interface NavDrawerProps {
  /** 릴리즈 노트 열림은 App 로컬 상태라 콜백으로 주입 (releaseNotesOpen 선례) */
  onOpenReleaseNotes: () => void
  /** 계산기 설정 시트 열림도 App 로컬 (calcSettingsOpen 선례) */
  onOpenCalculator: () => void
}

/**
 * 앱 메뉴 드로어 (M-16) — 흩어진 임시 IconButton 진입점을 섹션으로 묶는다.
 * 항목 탭 시 해당 시트/뷰를 열고 드로어를 닫는다. 히스토리가 이 기능의 필수 항목.
 */
export function NavDrawer({ onOpenReleaseNotes, onOpenCalculator }: NavDrawerProps) {
  const open = useUiStore((s) => s.navDrawerOpen)
  const close = useUiStore((s) => s.closeNavDrawer)
  const openHistory = useUiStore((s) => s.openHistory)
  const openListView = useUiStore((s) => s.openListView)
  const openPalette = useUiStore((s) => s.openPalette)
  const openShare = useUiStore((s) => s.openShare)
  const openReset = useUiStore((s) => s.openReset)

  /** 항목 동작 실행 후 드로어를 닫는다 — 모든 항목 공통 */
  const run = (action: () => void) => () => {
    action()
    close()
  }

  return (
    <Drawer open={open} onClose={close}>
      <DrawerSection title="작업공간">
        <DrawerItem icon={History} label="히스토리" onClick={run(openHistory)} />
        <DrawerItem icon={List} label="필지 목록" onClick={run(openListView)} />
      </DrawerSection>

      <DrawerSection title="도구">
        <DrawerItem icon={Calculator} label="자동 계산기" onClick={run(onOpenCalculator)} />
        <DrawerItem icon={Palette} label="색상 팔레트" onClick={run(openPalette)} />
        <DrawerItem icon={Share2} label="공유" onClick={run(openShare)} />
        <DrawerItem icon={RotateCcw} label="초기화" onClick={run(openReset)} />
      </DrawerSection>

      <DrawerSection title="정보">
        <DrawerItem icon={ScrollText} label="릴리즈 노트" onClick={run(onOpenReleaseNotes)} />
      </DrawerSection>
    </Drawer>
  )
}
