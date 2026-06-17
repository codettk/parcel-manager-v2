import { beforeEach, describe, expect, it } from 'vitest'
// 명세: docs/specs/region-entry.md AC-4(게이트)·5(진입)·6(미적재 차단)·10(영속)·11(전환)
import { ACTIVE_REGION_STORAGE_KEY, loadActiveRegion, useUiStore } from '../../../src/stores/ui'
import { REGION_CATALOG, SEED_REGION } from '../../../src/features/region/regionCatalog'

const UPCOMING = REGION_CATALOG.find((r) => !r.loaded)!

beforeEach(() => {
  localStorage.clear()
  useUiStore.setState(useUiStore.getInitialState(), true)
})

describe('selectRegion — 진입 게이트 (AC-5·6·10)', () => {
  it('적재 region 선택 시 activeRegionId가 설정되고 true를 반환한다 (AC-5)', () => {
    const ok = useUiStore.getState().selectRegion(SEED_REGION.id)
    expect(ok).toBe(true)
    expect(useUiStore.getState().activeRegionId).toBe(SEED_REGION.id)
  })

  it('적재 region 선택 시 localStorage에 영속된다 (AC-10)', () => {
    useUiStore.getState().selectRegion(SEED_REGION.id)
    expect(localStorage.getItem(ACTIVE_REGION_STORAGE_KEY)).toBe(SEED_REGION.id)
  })

  it('미적재 region 선택은 false를 반환하고 전환하지 않는다 (AC-6)', () => {
    const ok = useUiStore.getState().selectRegion(UPCOMING.id)
    expect(ok).toBe(false)
    expect(useUiStore.getState().activeRegionId).toBeNull()
    expect(localStorage.getItem(ACTIVE_REGION_STORAGE_KEY)).toBeNull()
  })

  it('없는 id 선택은 false', () => {
    expect(useUiStore.getState().selectRegion('없는-id')).toBe(false)
  })

  it('선택 성공 시 선택·관리 화면이 닫힌다', () => {
    useUiStore.setState({ regionSelectOpen: true, regionManageOpen: true })
    useUiStore.getState().selectRegion(SEED_REGION.id)
    expect(useUiStore.getState().regionSelectOpen).toBe(false)
    expect(useUiStore.getState().regionManageOpen).toBe(false)
  })
})

describe('초기 게이트 상태 (AC-4)', () => {
  it('localStorage 기록이 없으면 activeRegionId는 null이다 (게이트 표시)', () => {
    localStorage.clear()
    useUiStore.setState(useUiStore.getInitialState(), true)
    expect(useUiStore.getState().activeRegionId).toBeNull()
  })
})

describe('loadActiveRegion — 새로고침 복원 분기 (AC-10)', () => {
  it('기록 없음이면 null', () => {
    localStorage.clear()
    expect(loadActiveRegion()).toBeNull()
  })

  it('적재 region 기록이면 그 id를 복원해 게이트를 건너뛴다', () => {
    localStorage.setItem(ACTIVE_REGION_STORAGE_KEY, SEED_REGION.id)
    expect(loadActiveRegion()).toBe(SEED_REGION.id)
  })

  it('미적재 region 기록은 인정하지 않고 null (게이트 표시)', () => {
    localStorage.setItem(ACTIVE_REGION_STORAGE_KEY, UPCOMING.id)
    expect(loadActiveRegion()).toBeNull()
  })

  it('카탈로그에 없는 폐기 id 기록도 null', () => {
    localStorage.setItem(ACTIVE_REGION_STORAGE_KEY, '폐기된-id')
    expect(loadActiveRegion()).toBeNull()
  })
})

describe('open/close 진입점 (AC-8·9·11)', () => {
  it('openRegionSelect/closeRegionSelect 토글', () => {
    useUiStore.getState().openRegionSelect()
    expect(useUiStore.getState().regionSelectOpen).toBe(true)
    useUiStore.getState().closeRegionSelect()
    expect(useUiStore.getState().regionSelectOpen).toBe(false)
  })

  it('openRegionManage/closeRegionManage 토글', () => {
    useUiStore.getState().openRegionManage()
    expect(useUiStore.getState().regionManageOpen).toBe(true)
    useUiStore.getState().closeRegionManage()
    expect(useUiStore.getState().regionManageOpen).toBe(false)
  })
})
