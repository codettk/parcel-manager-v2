-- 전국 지적도 데이터 파이프라인 (national-data-pipeline 슬라이스) — 전부 비파괴.
-- 슬라이스 1의 클라이언트 상수 regionCatalog.ts를 서버 권위 regions 테이블로 승격하고,
-- 사용자별 "받은 지역"(user_regions)을 DB에 영속한다. RLS는 0002/0003 posture(OFF) 유지 —
-- 멤버십·신원 강제는 서버 핸들러(service_role) 레이어가 담당한다.

-- region 카탈로그 (전역 공개 — 인증 불요 GET /api/regions). loaded=false면 "준비 중"(받기 409·지도 미전환).
CREATE TABLE IF NOT EXISTS public.regions (
  region_id    text PRIMARY KEY,            -- 영속 식별자 = localStorage 키 = parcels.region_id (변경 금지)
  sido         text NOT NULL,
  sigungu      text NOT NULL,
  emd          text NOT NULL,
  display_name text NOT NULL,
  short_name   text NOT NULL,
  loaded       boolean NOT NULL DEFAULT false,
  parcel_count int  NOT NULL DEFAULT 0,
  size_label   text NOT NULL DEFAULT '',
  sort_order   int  NOT NULL DEFAULT 0,
  bbox         jsonb                          -- [minLng,minLat,maxLng,maxLat] (nullable — 미적재 region은 NULL)
);

-- parcels에 region 스코프 컬럼 추가 (nullable — 기존 4,409행은 import 스크립트가 보구곶으로 백필. 비파괴).
ALTER TABLE parcels ADD COLUMN IF NOT EXISTS region_id text REFERENCES public.regions(region_id);
CREATE INDEX IF NOT EXISTS idx_parcels_region ON parcels(region_id);

-- 사용자별 "받은 지역" — 슬라이스 2 created_by(auth.users) 신원에 종속, 기기 독립 영속(AC-11).
CREATE TABLE IF NOT EXISTS public.user_regions (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region_id   text NOT NULL REFERENCES public.regions(region_id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, region_id)
);
CREATE INDEX IF NOT EXISTS idx_user_regions_user ON public.user_regions(user_id);

-- RLS 미도입(0002/0003 유지) — 정책 0개 + RLS ON이면 anon 접근이 차단되므로 OFF로 둔다.
ALTER TABLE public.regions       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_regions  DISABLE ROW LEVEL SECURITY;

-- 카탈로그 시드 — 적재 region(loaded=true)을 sort_order 앞에 둔다(클라이언트 regionCatalog.ts 정합).
-- 대곶면은 샘플 데이터셋(public/data/regions/gyeonggi-gimpo-daegot.json)으로 적재되므로 loaded=true 승격.
INSERT INTO public.regions
  (region_id, sido, sigungu, emd, display_name, short_name, loaded, parcel_count, size_label, sort_order)
VALUES
  ('incheon-ganghwa-hwado',  '인천광역시', '강화군', '화도면', '인천 강화군 화도면(보구곶)', '화도면(보구곶)', true,  4409, '4.2MB', 0),
  ('gyeonggi-gimpo-daegot',  '경기도',     '김포시', '대곶면', '경기 김포시 대곶면',          '대곶면',          true,    36, '12KB',  1),
  ('incheon-ganghwa-ganghwa','인천광역시', '강화군', '강화읍', '인천 강화군 강화읍',          '강화읍',          false, 3180, '9.1MB', 2),
  ('jeonnam-haenam-sani',    '전라남도',   '해남군', '산이면', '전남 해남군 산이면',          '산이면',          false, 4120, '12.4MB',3)
ON CONFLICT (region_id) DO NOTHING;
