// renderScene 테스트 공용 씬 픽스처
import type { Group, ParcelOverride } from '../../../src/types/api/tabState'
import {
  EMPTY_SELECTION,
  type EngineParcel,
  type MapScene,
  type RenderSize,
} from '../../../src/features/map/engine'

/** 정사각 필지 — (ox, oy)에서 한 변 size. viewport scale=100 기준 화면좌표 = 데이터좌표×100 */
export function square(id: string, ox: number, oy: number, size = 0.1): EngineParcel {
  return {
    id,
    jibun: id,
    poly: [
      [ox, oy],
      [ox + size, oy],
      [ox + size, oy + size],
      [ox, oy + size],
    ],
    area: size * size,
    cx: ox + size / 2,
    cy: oy + size / 2,
    bw: size,
    bh: size,
  }
}

export function makeOverride(partial: Partial<ParcelOverride> = {}): ParcelOverride {
  return { color: null, style: null, name: null, memo: null, pinned: false, icon: null, ...partial }
}

export function makeGroup(partial: Partial<Group> & { parcelIds: string[] }): Group {
  return { name: null, memo: null, color: null, style: 'fill', ...partial }
}

export function parcelToGroupOf(groups: Record<string, Group>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [gid, g] of Object.entries(groups)) {
    for (const pid of g.parcelIds) map[pid] = gid
  }
  return map
}

export function makeScene(partial: Partial<MapScene> = {}): MapScene {
  const groups = partial.groups ?? {}
  return {
    aspect: 1,
    parcels: [],
    overrides: {},
    colorById: {},
    parcelToGroup: parcelToGroupOf(groups),
    viewport: { scale: 100, tx: 0, ty: 0 },
    selection: EMPTY_SELECTION,
    ...partial,
    groups,
  }
}

export const SIZE: RenderSize = { width: 100, height: 100, dpr: 1 }
