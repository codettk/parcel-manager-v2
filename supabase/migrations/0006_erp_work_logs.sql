-- 영농 ERP — 업무일지·일당계산 (erp-worklog 슬라이스 5b) — 전부 비파괴 신설.
-- 절충 0(5a 승계): 전역 공유 — tab_id·region_id·created_by 격리 없음. created_by(auth.users)는 신원 기록만.
-- 절충 2(일당 스냅샷): work_log_workers는 작성 시점 staff 이름·일당을 복사 저장 → 마스터 변경/비활성에 소급 안 됨.
-- 절충 4·6(하드 삭제): work_logs 물리 삭제 + work_log_workers ON DELETE CASCADE로 라인 동반 삭제.
-- Realtime 비범위: publication 등록 안 함 — 단발 fetch + 낙관 업데이트. 에코 가드 updated_by 미도입.
-- RLS는 0002~0005 posture 유지(OFF — 정책 0개 + RLS ON이면 anon 접근 차단되므로). 강제는 핸들러 requireUser.

-- 업무일지 헤더 — 날짜 + 작업 제목/메모 + 인건비 합계(서버 산출 computeLogTotal).
CREATE TABLE IF NOT EXISTS public.work_logs (
  log_id      text PRIMARY KEY,
  work_date   date NOT NULL,                          -- 작업 날짜 (목록 정렬·기간 필터 키)
  title       text NOT NULL,                          -- 작업명/제목
  memo        text,
  total_cost  int NOT NULL DEFAULT 0,                 -- Σ(applied_wage × work_ratio) 서버 산출
  created_by  uuid REFERENCES auth.users(id),         -- 신원 기록만 — 격리 아님 (절충 0)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 투입 인력 라인 — 작성 시점 이름·일당을 스냅샷(절충 2). staff 소프트 비활성에도 무결.
CREATE TABLE IF NOT EXISTS public.work_log_workers (
  entry_id            text PRIMARY KEY,
  log_id              text NOT NULL REFERENCES public.work_logs(log_id) ON DELETE CASCADE,  -- 하드 삭제 동반 (절충 6)
  staff_id            text REFERENCES public.staff(staff_id) ON DELETE SET NULL,            -- 참조만 — 스냅샷이 권위 (절충 2)
  staff_name_snapshot text NOT NULL,                  -- 작성 시점 인력명 스냅샷
  applied_wage        int NOT NULL,                   -- 적용 일당 스냅샷
  work_ratio          numeric NOT NULL,               -- 근무율(전일 1.0·반일 0.5·연장 등)
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 목록 정렬(최신 우선)·라인 조인 최적화.
CREATE INDEX IF NOT EXISTS idx_work_logs_work_date ON public.work_logs(work_date DESC);
CREATE INDEX IF NOT EXISTS idx_work_logs_created_by ON public.work_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_work_log_workers_log_id ON public.work_log_workers(log_id);

-- RLS 미도입(0002~0005 posture 유지).
ALTER TABLE public.work_logs        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_log_workers DISABLE ROW LEVEL SECURITY;
