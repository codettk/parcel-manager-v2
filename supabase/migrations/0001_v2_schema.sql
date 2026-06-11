-- v2 스키마 (마이그레이션 명세서 §6.1 그대로 채택)
-- app_state JSON 컬럼은 존재하지 않는다 — 정규화 테이블이 유일한 진실.

-- 작업공간 (v1 스냅샷/히스토리 대체)
CREATE TABLE tabs (
  tab_id      text PRIMARY KEY,            -- tab_<timestamp><random4>
  name        text NOT NULL DEFAULT '새 작업공간',
  sort_order  int  NOT NULL DEFAULT 0,
  closed_at   timestamptz,                 -- NULL=활성, 값=히스토리(소프트 클로즈)
  history_deleted_at timestamptz,          -- 히스토리에서도 삭제(소프트 딜리트)
  created_at  timestamptz DEFAULT now(),
  updated_by  text,
  updated_at  timestamptz DEFAULT now()
);

-- 필지 마스터 (v1 parcels 계승: 지오데이터 + V-World 토지정보, 탭 무관 공유)
CREATE TABLE parcels (
  local_id    text PRIMARY KEY,            -- SGG_OID (v1과 동일 키)
  pnu         text UNIQUE,
  jibun       text, jibun_full text,
  ld_code     text, ld_code_nm text,
  lndcgr_code text, lndcgr_code_nm text,   -- 지목
  lndpcl_ar   numeric,                     -- 공부상 면적
  posesn_se_code text, posesn_se_code_nm text,
  cnrs_psn_co int,
  regstr_se_code text, regstr_se_code_nm text,
  coordinates jsonb NOT NULL,
  vworld_fetched_at timestamptz
);

-- 필지별 편집 설정 (탭 스코프)
CREATE TABLE parcel_settings (
  tab_id          text NOT NULL REFERENCES tabs(tab_id) ON DELETE CASCADE,
  parcel_local_id text NOT NULL REFERENCES parcels(local_id),
  color  text, style text CHECK (style IN ('fill','border')),
  name   text, memo text,
  pinned boolean DEFAULT false,
  icon   text,
  updated_by text, updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (tab_id, parcel_local_id)
);

-- 그룹 (탭 스코프)
CREATE TABLE parcel_groups (
  group_id   text PRIMARY KEY,             -- grp_<timestamp><random>
  tab_id     text NOT NULL REFERENCES tabs(tab_id) ON DELETE CASCADE,
  name text, memo text,
  color text, style text DEFAULT 'fill',
  parcel_ids text[] DEFAULT '{}',
  updated_by text, updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_groups_tab ON parcel_groups(tab_id);

-- 색상 팔레트 (전 탭 공유, v1 동적 팔레트 계승 — hex 포함)
CREATE TABLE color_labels (
  color_id   text PRIMARY KEY,
  label      text NOT NULL,
  hex        text NOT NULL,
  sort_order int DEFAULT 0,
  updated_by text,                           -- 명세 §6.1에서 보정: Realtime 에코 가드(AC-12)용
  updated_at timestamptz DEFAULT now()
);

-- 앱 설정 (계산기 레시피 등, 전 탭 공유)
CREATE TABLE app_config (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Realtime publication (v1에서 수동 SQL로 하던 것을 마이그레이션에 포함)
ALTER PUBLICATION supabase_realtime ADD TABLE parcel_settings, parcel_groups, color_labels, tabs;

-- DELETE 이벤트 old 레코드에 updated_by 포함 — M-6 에코 가드 (realtime-sync.md AC-7)
ALTER TABLE color_labels REPLICA IDENTITY FULL;
