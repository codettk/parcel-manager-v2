-- 계정·인증 기반 (auth-accounts 슬라이스) — 비파괴 확장.
-- 결정값: 로그인 필수 / 작업공간 멤버십(협업 보존) / clientId 에코가드 ↔ 세션 신원 분리 / RLS 미도입.
--
-- 전부 nullable 신설이라 기존 익명 협업 행은 그대로 유효(데이터 마이그레이션 불요).
-- 신원 컬럼 created_by(auth.users)는 에코 가드용 updated_by(clientId 문자열)와 의미·타입이 분리된다.
-- updated_by는 절대 건드리지 않는다(에코 가드 회귀 방지 — AC-11).

-- 신원 컬럼: 행을 만든/마지막 수정한 인증 사용자(user_id). NULL=기존 익명 행 또는 신원 미상.
ALTER TABLE tabs            ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE parcel_settings ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE parcel_groups   ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE color_labels    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 보조 프로필 (닉네임·연결 제공자·아바타) — auth.users 보강. GET /api/me가 읽는다.
-- 미존재 사용자는 auth.users(jwt) 폴백으로 동작하므로 NULL 행 비파괴.
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url   text,
  provider     text,                          -- 'kakao' | 'apple' | 'phone'
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- 작업공간 멤버십 (협업 보존 모델 — 로그인 사용자는 디폴트로 기존 공유 작업공간 멤버).
-- 이번 슬라이스는 멤버십 강제·UI 비범위(자리만). 비파괴 신설.
CREATE TABLE IF NOT EXISTS public.workspace_members (
  tab_id    text NOT NULL REFERENCES tabs(tab_id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'editor',    -- owner | editor | viewer (등급 강제는 후속)
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (tab_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members(user_id);

-- RLS 미도입(0002 유지) — 멤버십 강제는 서버 핸들러(service_role) 레이어.
-- 신규 테이블도 0002 posture를 따라 RLS OFF로 둔다(정책 0개 + RLS ON이면 anon 접근 차단되므로).
ALTER TABLE public.profiles          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members DISABLE ROW LEVEL SECURITY;
