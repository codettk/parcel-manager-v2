-- 영농 ERP — 인력·거래처 마스터 (erp-staff-contacts 슬라이스 5a) — 전부 비파괴 신설.
-- 절충 1(전역 공유): tab_id·region_id·created_by 격리 없음. created_by(auth.users)는 신원 기록만.
-- 절충 3(Realtime 비범위): publication 등록 안 함 — 단발 fetch + 낙관 업데이트.
-- 절충 4(소프트 삭제): active boolean DEFAULT true. DELETE는 핸들러에서 active=false UPDATE로 구현.
-- 에코 가드 updated_by(clientId)는 도입하지 않는다(Realtime 비범위). clientId는 계약 바디에만 포함.
-- RLS는 0002~0004 posture 유지(OFF — 정책 0개 + RLS ON이면 anon 접근 차단되므로). 강제는 핸들러 requireUser.

-- 인력(일꾼/근로자) 마스터 — 5b 일당계산이 dailyWage를 외래 참조(소프트 삭제로 참조 보존).
CREATE TABLE IF NOT EXISTS public.staff (
  staff_id    text PRIMARY KEY,
  name        text NOT NULL,
  phone       text,
  role        text,                                   -- 역할/직종 (자유 텍스트)
  daily_wage  int,                                    -- 기본 일당(원). NULL=미설정
  memo        text,
  active      boolean NOT NULL DEFAULT true,          -- 소프트 비활성 (절충 4)
  created_by  uuid REFERENCES auth.users(id),         -- 신원 기록만 — 격리 아님 (절충 1)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 거래처(매입/매출 상대처) 마스터 — 5c 재고가 외래 참조(소프트 삭제로 참조 보존).
CREATE TABLE IF NOT EXISTS public.contacts (
  contact_id  text PRIMARY KEY,
  name        text NOT NULL,
  manager     text,                                   -- 담당자명
  phone       text,
  kind        text NOT NULL CHECK (kind IN ('buy', 'sell', 'both')),
  memo        text,
  active      boolean NOT NULL DEFAULT true,          -- 소프트 비활성 (절충 4)
  created_by  uuid REFERENCES auth.users(id),         -- 신원 기록만 — 격리 아님 (절충 1)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 목록 조회 최적화 — 기본 조회는 active=true만 반환(AC-2·8).
CREATE INDEX IF NOT EXISTS idx_staff_active    ON public.staff(active);
CREATE INDEX IF NOT EXISTS idx_contacts_active ON public.contacts(active);

-- RLS 미도입(0002~0004 posture 유지).
ALTER TABLE public.staff    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts DISABLE ROW LEVEL SECURITY;
