-- 영농 ERP — 재고 관리 (erp-inventory 슬라이스 5c) — 전부 비파괴 신설.
-- 절충 0(5a·5b 승계): 전역 공유 — tab_id·region_id·created_by 격리 없음. created_by(auth.users)는 신원 기록만.
-- 절충 1(현재고 파생): current_qty 컬럼 없음 — 거래 원장 합산(stockBalance.ts)이 단일 진실. 저장 안 함.
-- 절충 3(스냅샷): inventory_transactions는 작성 시점 품목명·단위·거래처 상호 + 거래시점 단가/금액을 복사 저장
--   → 마스터(품목·거래처) 변경/비활성에 소급 안 됨(AC-13·14).
-- 절충 4(삭제): 품목=소프트 비활성(active=false, 핸들러 UPDATE). 거래=하드 삭제(append-only 원장, 절충 5).
-- Realtime 비범위: publication 등록 안 함 — 단발 fetch + 낙관 업데이트. 에코 가드 updated_by 미도입.
-- RLS는 0002~0006 posture 유지(OFF — 정책 0개 + RLS ON이면 anon 접근 차단되므로). 강제는 핸들러 requireUser.

-- 재고 품목(농자재/농산물) 마스터 — 거래가 item_id로 참조(소프트 비활성으로 참조 보존, 절충 4).
CREATE TABLE IF NOT EXISTS public.inventory_items (
  item_id     text PRIMARY KEY,
  name        text NOT NULL,                          -- 품목명 (예: 요소비료)
  unit        text NOT NULL,                          -- 단위 (예: kg·포·박스)
  category    text,                                   -- 분류 (선택 자유 텍스트)
  memo        text,
  active      boolean NOT NULL DEFAULT true,          -- 소프트 비활성 (절충 4)
  created_by  uuid REFERENCES auth.users(id),         -- 신원 기록만 — 격리 아님 (절충 0)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 입·출고 거래 원장(append-only) — 거래 1건 = 품목 1개의 입고/출고 1건(절충 2). 현재고는 이 합산 파생(절충 1).
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  txn_id                text PRIMARY KEY,
  item_id               text NOT NULL REFERENCES public.inventory_items(item_id),  -- 참조만 — 스냅샷이 표시 권위(절충 3)
  item_name_snapshot    text NOT NULL,                -- 작성 시점 품목명 스냅샷
  unit_snapshot         text NOT NULL,                -- 작성 시점 단위 스냅샷
  type                  text NOT NULL CHECK (type IN ('in', 'out')),  -- 입고/출고 (수량 부호 결정)
  quantity              numeric NOT NULL CHECK (quantity > 0),         -- 수량(양수) — 현재고 합산 대상
  txn_date              date NOT NULL,                -- 거래 일자 (목록 정렬·기간 필터 키)
  contact_id            text REFERENCES public.contacts(contact_id) ON DELETE SET NULL,  -- 거래처 참조(선택, 소프트 비활성이라 실제 SET NULL 미발생)
  contact_name_snapshot text,                         -- 작성 시점 거래처 상호 스냅샷 (미연결 시 null)
  unit_price            int,                          -- 단가(원/단위, 선택, 거래시점 값)
  amount                int,                          -- 금액(원) = quantity × unit_price 서버 산출(unit_price 없으면 null)
  memo                  text,
  created_by            uuid REFERENCES auth.users(id),  -- 신원 기록만 — 격리 아님 (절충 0)
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 목록 정렬(최신 우선)·품목별 이력/현재고 합산 최적화.
CREATE INDEX IF NOT EXISTS idx_inventory_items_active           ON public.inventory_items(active);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item_id   ON public.inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_txn_date  ON public.inventory_transactions(txn_date DESC);

-- RLS 미도입(0002~0006 posture 유지).
ALTER TABLE public.inventory_items        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions DISABLE ROW LEVEL SECURITY;
