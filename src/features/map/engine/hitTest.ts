import { pointInPolygon, type Point } from '../../../utils/geo'
import type { EngineParcel } from './scene'

/**
 * 탭 히트테스트 — 면적 내림차순 배열을 역순 순회해 위에 그려진(작은) 필지 우선 (v1 보존).
 * 데이터 범위 밖이면 null. 입력은 데이터 좌표(0..1 정규화) — 화면→데이터 변환(탭 시작
 * 시점 viewport 스냅샷 기준)은 호출자 책임.
 *
 * v1(MapView.jsx:527)은 x 상한을 aspect로 검사했지만 투영 x 범위는 0..1이다 —
 * 보구곶 aspect≈0.685에서 우측 영역 탭이 무시되던 v1 버그를 실제 범위(0..1)로 교정.
 */
export function hitTest(parcels: EngineParcel[], [x, y]: Point): string | null {
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  for (let i = parcels.length - 1; i >= 0; i--) {
    if (pointInPolygon(x, y, parcels[i].poly)) return parcels[i].id
  }
  return null
}
