// /__ui 데모 라우트 (DEV 전용) — UI 공통 컴포넌트 전 variant 시각 검증 (명세서 Phase 1 DoD)
import { useState, type ReactNode } from 'react'
import { Layers, MapPin, Search, Settings, Share2, Trash2, X } from 'lucide-react'
import {
  AreaText,
  Badge,
  Button,
  Checkbox,
  Chip,
  ColorSwatch,
  ConfirmInline,
  Drawer,
  DrawerItem,
  DrawerSection,
  EmptyState,
  IconButton,
  Input,
  ListRow,
  SegmentedControl,
  Sheet,
  Switch,
  TabBar,
  Textarea,
} from '../components/ui'
import type { AreaUnitId } from '../utils/formatArea'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-5">
      <h2 className="mb-3 text-sm font-bold text-ink-muted">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

// 데모용 샘플 색상 — 실서비스 팔레트는 DB(color_labels) 소관
const DEMO_COLORS = ['#6CA945', '#E5A300', '#2B7BC9', '#C8392E']

export function UIDemo() {
  const [checked, setChecked] = useState(false)
  const [switchOn, setSwitchOn] = useState(true)
  const [unit, setUnit] = useState<AreaUnitId>('m2')
  const [chipSel, setChipSel] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [tabs, setTabs] = useState([
    { id: 't1', name: '기본 작업공간' },
    { id: 't2', name: '드론 방제' },
  ])
  const [activeTab, setActiveTab] = useState('t1')

  return (
    <div className="min-h-full pb-20">
      <header className="border-b border-border bg-surface-alt px-4 py-3">
        <h1 className="text-lg font-bold">UI 컴포넌트 데모 (/__ui)</h1>
      </header>

      <Section title="Button — primary / danger / secondary / ghost / disabled / sm / full">
        <Button>저장</Button>
        <Button variant="danger">그룹 해체</Button>
        <Button variant="secondary">취소</Button>
        <Button variant="ghost">닫기</Button>
        <Button disabled>저장</Button>
        <Button size="sm">작게</Button>
        <Button full>전체 너비</Button>
      </Section>

      <Section title="IconButton — ghost / solid / sm">
        <IconButton icon={Layers} aria-label="그룹 모드" />
        <IconButton icon={Settings} aria-label="설정" variant="solid" />
        <IconButton icon={X} aria-label="닫기" size="sm" />
      </Section>

      <Section title="Chip — 기본 / selected / colorHex">
        <Chip selected={chipSel} onClick={() => setChipSel(!chipSel)}>
          전
        </Chip>
        <Chip selected>답</Chip>
        <Chip colorHex={DEMO_COLORS[0]}>친환경</Chip>
        <Chip colorHex={DEMO_COLORS[1]} selected>
          관행
        </Chip>
      </Section>

      <Section title="SegmentedControl — 면적 단위 / fill·border / sm">
        <SegmentedControl
          options={[
            { id: 'm2', label: '㎡' },
            { id: 'pyeong', label: '평' },
            { id: 'a', label: 'a' },
            { id: 'ha', label: 'ha' },
          ]}
          value={unit}
          onChange={setUnit}
        />
        <SegmentedControl
          size="sm"
          options={[
            { id: 'fill', label: '채우기' },
            { id: 'border', label: '테두리' },
          ]}
          value="fill"
          onChange={() => {}}
        />
      </Section>

      <Section title="Checkbox / Switch">
        <Checkbox checked={checked} onChange={setChecked} label="지목 전체" />
        <Checkbox checked disabled onChange={() => {}} label="비활성" />
        <Switch checked={switchOn} onChange={setSwitchOn} label="필지 고정" />
      </Section>

      <Section title="Input / Textarea — 기본 / numeric">
        <Input placeholder="필지 이름" />
        <Input variant="numeric" placeholder="300" />
        <Textarea placeholder="메모를 입력하세요" />
      </Section>

      <Section title="ColorSwatch — fill / border / selected / sm">
        {DEMO_COLORS.map((hex) => (
          <ColorSwatch key={hex} hex={hex} styleMode="fill" />
        ))}
        <ColorSwatch hex={DEMO_COLORS[2]} styleMode="border" />
        <ColorSwatch hex={DEMO_COLORS[0]} styleMode="fill" selected />
        <ColorSwatch hex={DEMO_COLORS[3]} styleMode="fill" size="sm" />
      </Section>

      <Section title="Badge / AreaText">
        <Badge>3필지</Badge>
        <Badge variant="primary">계산기</Badge>
        <Badge variant="danger">오류</Badge>
        <AreaText m2={2340} unit={unit} />
        <AreaText m2={450.5} />
      </Section>

      <Section title="ListRow — leading / trailing / onClick">
        <div className="w-full max-w-sm overflow-hidden rounded-md border border-border">
          <ListRow
            leading={<ColorSwatch hex={DEMO_COLORS[0]} styleMode="fill" size="sm" />}
            title="산 123"
            subtitle={<AreaText m2={450} />}
            trailing={<IconButton icon={X} aria-label="제거" size="sm" />}
            onClick={() => {}}
          />
          <ListRow leading={<MapPin size={16} />} title="435-3 곶" subtitle="그룹: 드론 방제" />
        </div>
      </Section>

      <Section title="ConfirmInline — 2단계 확인">
        <ConfirmInline label="그룹 해체" confirmLabel="해체" onConfirm={() => {}} />
      </Section>

      <Section title="EmptyState">
        <div className="w-full max-w-sm">
          <EmptyState
            icon={Search}
            message="검색 결과가 없습니다"
            action={<Button size="sm">초기화</Button>}
          />
        </div>
      </Section>

      <Section title="TabBar — 선택 / 더블클릭 이름 변경 / 닫기 / 추가">
        <div className="w-full">
          <TabBar
            tabs={tabs}
            activeId={activeTab}
            onSelect={setActiveTab}
            onAdd={() =>
              setTabs((t) => [...t, { id: `t${t.length + 1}`, name: `작업공간 ${t.length + 1}` }])
            }
            onClose={(id) => setTabs((t) => t.filter((x) => x.id !== id))}
            onRename={(id, name) =>
              setTabs((t) => t.map((x) => (x.id === id ? { ...x, name } : x)))
            }
          />
        </div>
      </Section>

      <Section title="Drawer / Sheet (오버레이)">
        <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
          Drawer 열기
        </Button>
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          Sheet 열기 (뷰포트 자동)
        </Button>
      </Section>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <DrawerSection title="보기">
          <DrawerItem icon={MapPin} label="지도" onClick={() => {}} active />
          <DrawerItem icon={Layers} label="필지 목록" onClick={() => {}} />
        </DrawerSection>
        <DrawerSection title="도구">
          <DrawerItem icon={Share2} label="내보내기/불러오기" onClick={() => {}} />
          <DrawerItem
            icon={Trash2}
            label="초기화"
            onClick={() => {}}
            trailing={<Badge variant="danger">주의</Badge>}
          />
        </DrawerSection>
      </Drawer>

      {sheetOpen && (
        <Sheet onClose={() => setSheetOpen(false)}>
          <h3 className="mb-2 text-base font-bold">시트 제목</h3>
          <p className="mb-4 text-sm text-ink-muted">
            720px 미만에서는 BottomSheet, 이상에서는 SidePanel로 렌더됩니다.
          </p>
          <Button full onClick={() => setSheetOpen(false)}>
            닫기
          </Button>
        </Sheet>
      )}
    </div>
  )
}

export default UIDemo
