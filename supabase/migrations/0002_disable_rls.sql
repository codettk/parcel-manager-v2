-- RLS 비활성화 (v1 posture 계승 — v1은 RLS DISABLED)
-- v2 스키마는 정책(policy)을 하나도 정의하지 않으므로 RLS가 켜져 있으면 정책 0개 →
-- 서버(service_role) 외 모든 접근이 차단되고, 프론트 Realtime(anon 키 구독)도 행을 못 읽어
-- 동기화가 깨진다. 0001은 SQL CREATE라 RLS가 기본 OFF지만, 대시보드 등으로 테이블이
-- 생성된 환경에서는 RLS가 켜진 채일 수 있어 명시적으로 끈다(db reset 재현성·운영 정합 동시 충족).
-- 트레이드오프: 공개되는 anon 키로 DB 직접 접근이 가능하다(v1과 동일한 비공개 협업 도구 posture).

ALTER TABLE tabs            DISABLE ROW LEVEL SECURITY;
ALTER TABLE parcels         DISABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_groups   DISABLE ROW LEVEL SECURITY;
ALTER TABLE color_labels    DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_config      DISABLE ROW LEVEL SECURITY;
