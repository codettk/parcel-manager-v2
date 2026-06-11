// v1 constants.js PIN_ICON_CATEGORIES 보존 포팅 — 5범주 × 8개 고정 목록 (명세 판정: 그대로 이식)
export interface PinIconCategory {
  label: string
  icons: string[]
}

export const PIN_ICON_CATEGORIES: PinIconCategory[] = [
  { label: '집·건물', icons: ['🏠', '🏡', '🏗', '🏚', '🏭', '🛖', '🏘', '🏢'] },
  { label: '농기계', icons: ['🚜', '🛻', '🔧', '🪓', '🪚', '⚙️', '🔩', '🪛'] },
  { label: '수자원', icons: ['💧', '🚿', '🪣', '⛲', '🌊', '💦', '🏊', '🐟'] },
  { label: '작물', icons: ['🌾', '🌿', '🌱', '🌲', '🌳', '🍃', '🌻', '🌽'] },
  { label: '기타', icons: ['⭐', '📌', '🚩', '🎯', '🔴', '🟡', '🟢', '🔵'] },
]
