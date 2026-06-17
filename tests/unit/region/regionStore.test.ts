import { beforeEach, describe, expect, it } from 'vitest'
// 명세: docs/specs/national-data-pipeline.md — 진입 게이트(AC-15·16·17) + selectRegion 적재 검증.
import { ACTIVE_REGION_STORAGE_KEY, loadActiveRegion, useUiStore } from '../../../src/stores/ui'
import { useRegionsStore } from '../../../src/stores/regions'
import { SEED_CATALOG, SEED_REGION } from '../../../src/features/region/regionCatalog'

const UPCOMING = SEED_CATALOG.find((r) => !r.loaded)!

beforeEach(() => {
  localStorage.clear()
  useUiStore.setState(useUiStore.getInitialState(), true)
  useRegionsStore.setState({ catalog: [...SEED_CATALOG], catalogLoaded: false, acquiredIds: [], acquiring: null })
})

describe('selectRegion — 진입 게이트 (AC-2·17)', () => {
  it('적재 region 선택 시 activeRegionId가 설정되고 true를 반환한다', () => {
    const ok = useUiStore.getState().selectRegion(SEED_REGION.id)
    expect(ok).toBe(true)
    expect(useUiStore.getState().activeRegionId).toBe(SEED_REGION.id)
  })

  it('적재 region 선택 시 localStorage에 영속되고 받은 목록에 보강된다', () => {
    useUiStore.getState().selectRegion(SEED_REGION.id)
    expect(localStorage.getItem(ACTIVE_REGION_STORAGE_KEY)).toBe(SEED_REGION.id)
    expect(useRegionsStore.getState().acquiredIds).toContain(SEED_REGION.id)
  })

  it('준비 중 region 선택은 false를 반환하고 전환하지 않는다 (AC-17)', () => {
    const ok = useUiStore.getState().selectRegion(UPCOMING.id)
    expect(ok).toBe(false)
    expect(useUiStore.getState().activeRegionId).toBeNull()
    expect(localStorage.getItem(ACTIVE_REGION_STORAGE_KEY)).toBeNull()
  })

  it('없는 id 선택은 false', () => {
    expect(useUiStore.getState().selectRegion('없는-id')).toBe(false)
  })

  it('서버 카탈로그가 적재로 분류한 region은 선택 가능하다 (시드 미수록이어도)', () => {
    useRegionsStore.setState({
      catalog: [...SEED_CATALOG, { ...SEED_REGION, id: 'server-only', loaded: true, sortOrder: 99 }],
    })
    expect(useUiStore.getState().selectRegion('server-only')).toBe(true)
  })

  it('선택 성공 시 선택·관리 화면이 닫힌다', () => {
    useUiStore.setState({ regionSelectOpen: true, regionManageOpen: true })
    useUiStore.getState().selectRegion(SEED_REGION.id)
    expect(useUiStore.getState().regionSelectOpen).toBe(false)
    expect(useUiStore.getState().regionManageOpen).toBe(false)
  })
})

describe('초기 게이트 상태 (AC-15)', () => {
  it('localStorage 기록이 없으면 activeRegionId는 null이다 (게이트 표시)', () => {
    localStorage.clear()
    useUiStore.setState(useUiStore.getInitialState(), true)
    expect(useUiStore.getState().activeRegionId).toBeNull()
  })
})

describe('loadActiveRegion — 새로고침 복원 분기 (AC-16)', () => {
  it('기록 없음이면 null (게이트 표시, AC-15)', () => {
    localStorage.clear()
    expect(loadActiveRegion()).toBeNull()
  })

  it('region 기록이면 그 id를 복원해 게이트를 건너뛴다 (AC-16)', () => {
    localStorage.setItem(ACTIVE_REGION_STORAGE_KEY, SEED_REGION.id)
    expect(loadActiveRegion()).toBe(SEED_REGION.id)
  })

  it('서버 카탈로그가 시드에 없는 적재 region을 담을 수 있어 저장 값을 신뢰한다', () => {
    // selectRegion이 적재 검증을 통과시킨 값만 기록되므로 부팅 시점엔 그대로 신뢰
    localStorage.setItem(ACTIVE_REGION_STORAGE_KEY, 'server-only-region')
    expect(loadActiveRegion()).toBe('server-only-region')
  })
})

describe('open/close 진입점', () => {
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
