-- 로컬 개발용 seed — 스키마의 진실은 migrations만, seed는 프로덕션 재현 조건이 아니다.

-- 기본 탭 1개 (활성 탭 >= 1 불변식의 로컬 초기값)
INSERT INTO tabs (tab_id, name, sort_order)
VALUES ('tab_seed000001', '기본 작업공간', 0)
ON CONFLICT (tab_id) DO NOTHING;

-- 기본 팔레트 6색 (v1 constants.js 계승)
INSERT INTO color_labels (color_id, label, hex, sort_order) VALUES
  ('eco',  '친환경', '#6CA945', 0),
  ('sun',  '관행',   '#E5A300', 1),
  ('sky',  '파랑',   '#2B7BC9', 2),
  ('rose', '빨강',   '#C8392E', 3),
  ('plum', '보라',   '#8B5CF6', 4),
  ('soil', '갈색',   '#8C6B3F', 5)
ON CONFLICT (color_id) DO NOTHING;
