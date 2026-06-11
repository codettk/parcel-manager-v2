# Phase 3 — DB 재설계 + API 단일화

- 상태: 검토 대기
- 매핑: Phase 3 인프라 단계 (M-NN 단일 매핑 아님 — M-16 탭 작업공간의 백엔드 절반, M-13 토지정보의 API 계약을 선행 포함)
- 판정: **재설계** (v1 `app_state` JSON 이중 저장소와 server.js↔api/ 로직 분기를 폐기하고, 정규화 테이블 + 순수 핸들러를 신규 설계. 보존 대상은 clientId 에코 가드와 reset의 pinned 보호 의미론뿐)

## 판정 상세 (선별적 포팅)

| v1                                                                | 판정                                   | v2                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `app_state` JSON 단일 컬럼 (프로덕션 권위 소스)                   | **폐기**                               | 정규화 테이블이 유일한 진실. JSON 상태 컬럼은 v2에 존재하지 않음                             |
| `app_config.reset_snapshots` (스냅샷 10개 FIFO)                   | **폐기**                               | 닫힌 탭(`tabs.closed_at`)이 히스토리. 스냅샷 테이블·FIFO 없음                                |
| server.js ↔ api/ 이중 구현 (로직 분기)                            | **폐기**                               | `server/handlers/` 순수 함수 단일 구현 + express/vercel 이중 어댑터 (Phase 0 골격 위에 확장) |
| `parcel_settings` PK = `parcel_local_id` 단일                     | **재설계**                             | `(tab_id, parcel_local_id)` 복합 PK — 탭 스코프 내장                                         |
| 운영 DB 수동 스키마 (`pinned`/`icon`/`parcel_groups` 등 SQL 부재) | **재설계**                             | 모든 테이블·컬럼·Realtime publication이 `supabase/migrations/`에 존재                        |
| mutate 시 `clientId` → `updated_by` 기록 (Realtime 에코 가드)     | **보존**                               | 모든 mutate API가 `clientId` 필수, 행의 `updated_by`에 기록                                  |
| reset의 `items` 선택 초기화 + `pinned=true` 보호                  | **보존** (스냅샷 생성 부수효과만 제거) | `POST /api/tabs/:tabId/reset` — 탭 스코프, 스냅샷 없음                                       |
| reset 시 모든 의미 필드 null + 비고정 행 삭제 (행 청소)           | **보존**                               | 필지 설정 clear 의미론과 동일 규칙                                                           |
| WebSocket 브로커(`broadcast()`)                                   | **폐기**                               | 프론트 미사용 확인됨 (§7.3) — Realtime은 Supabase publication만                              |

## 사용자 스토리

1. backend-dev/frontend-dev 에이전트는 기능(M-1~M-18) 착수 시, 빈 DB에서 `supabase db reset` 한 번으로 완전한 스키마를 재현하고, zod 계약(`src/types/api/`) 하나만 보고 프론트·백엔드를 병렬 구현하고 싶다.
2. 운영자는 Docker 개발(Express)과 Vercel 배포가 같은 핸들러 코드를 실행해, v1처럼 두 경로의 동작이 갈라지는 사고가 구조적으로 불가능하길 원한다.
3. 공동체 사용자는 (Phase 4 UI가 올라간 뒤) 탭별 독립 작업공간·닫힌 탭 복원이 데이터 유실 없이 동작하길 원한다 — 그 보장(마지막 탭 보호, group_id 재생성)은 서버가 한다.

## 동작 명세

### 1. DB 스키마 — `supabase/migrations/0001_v2_schema.sql` (단일 마이그레이션)

기준 명세서 §6.1 SQL을 그대로 채택한다. 테이블 6종 + Realtime publication:

| 테이블            | 스코프     | 핵심                                                                                                                                                                                                    |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabs`            | —          | `tab_id text PK` (`tab_<timestamp36><random4>`, H-1), `name`, `sort_order`, `closed_at`(NULL=활성/값=히스토리), `history_deleted_at`(히스토리 소프트 딜리트), `updated_by`, `updated_at`                |
| `parcels`         | 전 탭 공유 | `local_id text PK`(SGG_OID), `pnu UNIQUE`, 지번·지목·면적·소유구분 등 V-World 필드, `coordinates jsonb NOT NULL`, `vworld_fetched_at`                                                                   |
| `parcel_settings` | 탭         | PK `(tab_id, parcel_local_id)`, FK tabs(ON DELETE CASCADE)·parcels, `color`, `style CHECK ('fill','border')`, `name`, `memo`, `pinned`, `icon`, `updated_by`, `updated_at`                              |
| `parcel_groups`   | 탭         | `group_id text PK`(`grp_<timestamp36><random>`), FK tabs(ON DELETE CASCADE), `name`, `memo`, `color`, `style DEFAULT 'fill'`, `parcel_ids text[]`, `updated_by`, `updated_at`, `idx_groups_tab(tab_id)` |
| `color_labels`    | 전 탭 공유 | `color_id PK`, `label NOT NULL`, `hex NOT NULL`, `sort_order`, `updated_by` (다르게 설계한 부분 6번)                                                                                                    |
| `app_config`      | 전 탭 공유 | `key PK`, `value jsonb` (계산기 레시피 등)                                                                                                                                                              |

- `ALTER PUBLICATION supabase_realtime ADD TABLE parcel_settings, parcel_groups, color_labels, tabs;` — 마이그레이션에 포함 (v1의 수동 등록 폐기).
- `supabase/seed.sql`: 로컬 개발 편의용 기본 탭 1개('기본 작업공간') + 기본 팔레트 6색(hex 포함). **스키마의 진실은 migrations만** — seed는 프로덕션 재현 조건이 아니다.
- `scripts/import-parcels.ts`: `public/data/parcels.json`(4,409필지, 수정 금지) → `parcels` 테이블 시드. `parcel_settings`의 FK 전제 데이터이므로 Phase 3에 포함. 멱등(upsert) 실행.

### 2. API 명세 — 순수 핸들러 + 이중 어댑터

구조: `server/handlers/<도메인>.ts` 순수 함수(`(HandlerRequest, HandlerContext) => HandlerResponse`, Phase 0 계약 유지) → `server/dev-server.ts`(expressAdapter) + `api/*.ts`(vercelAdapter 재export만). 핸들러는 req/res 직접 접근 금지, Supabase 클라이언트는 ctx.env로부터 생성.

모든 mutate 요청 body는 `clientId: string` 필수 (zod에서 강제), 핸들러는 변경 행의 `updated_by`에 기록한다.

| 메서드/경로                             | 요청                                                         | 응답                                                                        | 비고                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/config`                       | —                                                            | `{ supabaseUrl, supabaseAnonKey }`                                          | Phase 0 기존                                                                                                |
| `GET /api/tabs`                         | —                                                            | 활성 탭 목록 `Tab[]` (sort_order 순)                                        | 활성 탭 0개면 기본 탭 1개 자동 생성 후 반환 (불변식: 활성 탭 ≥ 1)                                           |
| `POST /api/tabs`                        | `{ name?, clientId }`                                        | 생성된 `Tab`                                                                | id는 서버 생성 `tab_<ts36><rand4>`                                                                          |
| `PATCH /api/tabs/:id`                   | `{ name?, sortOrder?, clientId }`                            | 갱신된 `Tab`                                                                |                                                                                                             |
| `DELETE /api/tabs/:id`                  | `{ clientId }`                                               | `{ ok: true }` / **409**                                                    | 소프트 클로즈(`closed_at` 설정). 마지막 활성 탭이면 409 — 서버 검사 (C-2, 클라 가드 의존 금지)              |
| `GET /api/history`                      | —                                                            | 닫힌 탭 목록 (`closed_at` 有, `history_deleted_at` 無)                      |                                                                                                             |
| `PATCH /api/history/:id`                | `{ name, clientId }`                                         | 갱신된 항목                                                                 | v1 `PATCH /api/snapshots/:id` 패리티                                                                        |
| `POST /api/history/:id/restore`         | `{ clientId }`                                               | 새 `Tab`                                                                    | 새 탭 생성 후 settings/groups 복사. **group_id 전부 재생성** (C-3)                                          |
| `DELETE /api/history/:id`               | `{ clientId }`                                               | `{ ok: true }`                                                              | 소프트 딜리트(`history_deleted_at`)                                                                         |
| `GET /api/tabs/:tabId/state`            | —                                                            | `{ overrides: Record<parcelId, Override>, groups: Record<groupId, Group> }` | 탭 초기 로드용                                                                                              |
| `POST /api/tabs/:tabId/parcels/:id`     | `{ color?, style?, name?, memo?, pinned?, icon?, clientId }` | `{ ok: true }`                                                              | upsert. 모든 의미 필드 null·pinned=false면 행 삭제(clear)                                                   |
| `POST /api/tabs/:tabId/groups`          | `{ groupId, group: Group \| null, clientId }`                | `{ ok: true }`                                                              | upsert / `group: null` = 삭제                                                                               |
| `POST /api/tabs/:tabId/reset`           | `{ items: ('color'\|'name'\|'memo'\|'group')[], clientId }`  | `{ ok: true }`                                                              | 탭 스코프 선택 초기화. `pinned=true` 행의 color/name/memo 보존. v1의 스냅샷 생성 부수효과 제거              |
| `PUT /api/tabs/:tabId/import`           | `{ overrides, groups, clientId }`                            | `{ ok: true }`                                                              | 해당 탭의 settings/groups를 입력으로 교체. 파일 포맷(version 2 메타) 검증 상세는 M-12                       |
| `GET /api/colors`                       | —                                                            | `ColorLabel[]`                                                              |                                                                                                             |
| `PUT /api/colors`                       | `{ colors: ColorLabel[], clientId }`                         | `{ ok: true }`                                                              | 전체 upsert (라벨·hex·순서)                                                                                 |
| `DELETE /api/colors/:id`                | `{ clientId }`                                               | `{ ok: true }`                                                              | 삭제 + **전 탭** `parcel_settings`·`parcel_groups`의 해당 color 참조를 null 처리 (v1 M-11 로직의 서버 이전) |
| `GET /api/calc-recipes`                 | —                                                            | `app_config['calc_recipes'].value`                                          |                                                                                                             |
| `PUT /api/calc-recipes`                 | `{ recipes, clientId }`                                      | `{ ok: true }`                                                              |                                                                                                             |
| `GET /api/parcels/:id`                  | —                                                            | 필지 마스터 행 / 404                                                        |                                                                                                             |
| `POST /api/parcels/:id/fetch-land-info` | `{ clientId }`                                               | (계약만)                                                                    | **zod 계약만 Phase 3에서 확정, 핸들러 구현은 M-13(Phase 4)** — 미구현 동안 501                              |

### 3. zod 계약 — `src/types/api/`

- 파일 분할: `common.ts`(clientId·에러), `tabs.ts`, `history.ts`, `tabState.ts`(state/parcels/groups/reset/import), `colors.ts`, `calcRecipes.ts`, `parcels.ts`(마스터+land-info).
- 모든 요청/응답 타입은 `z.infer`로만 노출 — 핸들러는 요청을 `safeParse`로 검증(실패 시 400)하고, 프론트 typed client는 응답을 parse한다. 양쪽이 같은 모듈을 import.

### 4. typed client 골격 — `src/lib/api.ts`

- 위 전 엔드포인트의 typed 함수 (`api.tabs.list()`, `api.tabs.remove(id)`, …). 내부에서만 `fetch` 사용 (프론트의 유일한 fetch 지점), 응답을 zod 스키마로 parse 후 반환. mutate 함수는 `clientId`를 자동 주입(모듈 단위 클라이언트 ID 생성).
- Phase 3에서는 골격+타입 완결까지 — 화면 연결은 Phase 4.

## 수용 기준 (AC)

> Phase 3은 UI가 없으므로 전 AC를 Vitest 핸들러 통합 테스트(로컬 Supabase 대상, `tests/integration/`)·단위 테스트로 검증한다. E2E(Playwright) 단계는 스킵하고 4단계 산출물을 통합 테스트 스위트로 대체한다.

AC-1. Given 빈 로컬 DB, When `supabase db reset`을 실행하면, Then 테이블 6종(tabs·parcels·parcel_settings·parcel_groups·color_labels·app_config)이 명세 컬럼·PK·FK·CHECK 제약대로 존재하고, `supabase_realtime` publication에 parcel_settings·parcel_groups·color_labels·tabs 4개 테이블이 등록되어 있다 (information_schema/pg_publication_tables 조회 테스트).

AC-2. Given reset 직후 DB, When `scripts/import-parcels.ts`를 실행하면, Then `parcels` 행 수가 `public/data/parcels.json`의 필지 수(4,409)와 일치하고, 같은 스크립트를 한 번 더 실행해도(멱등) 행 수가 변하지 않는다.

AC-3. Given 활성 탭 1개, When `POST /api/tabs`로 탭을 생성하면, Then 응답 tab*id가 `tab*`접두 형식이고`GET /api/tabs`에 sort_order 순으로 2개가 반환되며, `PATCH /api/tabs/:id`로 변경한 name이 재조회에 반영된다.

AC-4. Given 활성 탭이 1개뿐일 때, When `DELETE /api/tabs/:id`를 호출하면, Then 409가 반환되고 탭은 활성 상태로 남는다. Given 활성 탭 2개, When 하나를 DELETE하면, Then `closed_at`이 설정되고 `GET /api/tabs`에서 제외되며 `GET /api/history`에 나타난다.

AC-5. Given 활성 탭 0개(전부 소프트 클로즈)인 DB, When `GET /api/tabs`를 호출하면, Then 기본 탭 1개가 생성되어 반환된다 (활성 탭 ≥ 1 불변식).

AC-6. Given settings n개·groups m개를 가진 닫힌 탭, When `POST /api/history/:id/restore`를 호출하면, Then 새 활성 탭이 생성되고 그 탭에 settings n개·groups m개가 복사되며, 복사된 모든 group_id는 원본 group_id 집합과 겹치지 않고(전부 재생성) 각 그룹의 parcel_ids·name·color는 원본과 동일하다.

AC-7. Given 닫힌 탭, When `PATCH /api/history/:id`로 이름을 바꾸면 재조회에 반영되고, When `DELETE /api/history/:id`를 호출하면 `GET /api/history`에서 제외되지만 행은 `history_deleted_at` 값과 함께 DB에 남는다.

AC-8. Given 탭 A·B와 동일 필지 p, When 탭 A에 `POST /api/tabs/A/parcels/p`로 color를 저장하면, Then `GET /api/tabs/A/state`의 overrides에는 반영되고 `GET /api/tabs/B/state`에는 영향이 없다. When 같은 필지의 모든 의미 필드를 null(pinned=false)로 보내면, Then 해당 행이 삭제된다(clear).

AC-9. Given 탭에 그룹 1개, When `POST /api/tabs/:tabId/groups`에 `group: null`을 보내면 그룹이 삭제되고, 새 groupId로 group 객체를 보내면 upsert되어 `GET .../state`의 groups에 나타난다.

AC-10. Given pinned=true 필지 1개와 pinned=false 필지 1개(둘 다 color·name·memo 보유)와 그룹 1개, When `POST /api/tabs/:tabId/reset`에 `items: ['color','name','memo','group']`을 보내면, Then 비고정 필지의 설정 행과 그룹은 삭제되고 pinned 필지의 color·name·memo는 그대로 보존되며, `app_config`에 스냅샷이 생성되지 않는다.

AC-11. Given 팔레트 색 c를 참조하는 parcel_settings(탭 2개에 분산)와 parcel_groups가 있을 때, When `DELETE /api/colors/:c`를 호출하면, Then color_labels에서 c가 삭제되고 모든 탭의 settings·groups에서 color=c 참조가 null로 갱신된다.

AC-12. Given 임의의 mutate 엔드포인트(tabs 생성·필지 upsert·그룹 upsert·reset·colors PUT 각 1개 이상), When body에 `clientId`를 누락하면, Then 400이 반환된다. When 유효한 clientId로 호출하면, Then 변경된 행의 `updated_by`가 해당 clientId와 일치한다 (Realtime 에코 가드 전제).

AC-13. Given 동일 핸들러 함수, When expressAdapter와 vercelAdapter로 각각 감싸 동일한 method/params/query/body를 주입하면, Then 두 런타임에서 status·body가 동일하다 — 정상 경로와 핸들러 throw(500) 경로 모두 (어댑터 단위 테스트, mock req/res).

AC-14. Given `src/types/api/`의 전 요청/응답 스키마, Then 핸들러 통합 테스트의 모든 실제 응답이 해당 응답 스키마 `parse`를 통과하고, `src/lib/api.ts`의 각 함수 반환 타입이 같은 스키마의 `z.infer`와 일치한다 (typecheck + 테스트 내 parse).

AC-15. `pnpm lint`·`pnpm typecheck`·`pnpm test`(단위)·핸들러 통합 테스트가 모두 green이고, `GET /api/parcels/:id`는 존재 필지에 마스터 행을, 미존재 id에 404를 반환한다.

## 비범위

- **프론트 UI 전부** — 지도·시트·TabBar·HistorySheet 등은 Phase 4 (M-1~M-18). 이번 산출물에 화면 변경 없음.
- **Realtime 구독 코드** (`lib/realtime.ts`, 채널 4개·tab_id 필터 재구독·연결 상태 머신) — M-6. Phase 3은 publication 등록과 `updated_by` 기록까지만 (구독의 전제 조건).
- C-1(localStorage activeTabId 폴백)·C-4(isInitializing 입력 차단) — 클라이언트 부팅 로직, Phase 4 (M-5/M-16).
- `POST /api/parcels/:id/fetch-land-info` 구현 (V-World 연동) — M-13. 이번엔 zod 계약 + 501 스텁까지.
- JSON 임포트 파일 포맷(version 2 메타) 검증 상세 — M-12. 이번엔 탭 적용 계약까지.
- v1 데이터 이관 (`scripts/migrate-v1-data.ts`) — Phase 5 §8.1.
- RLS·인증 — v2.1 검토 (명세서 §1.3).

## 영향 범위

- 프론트: `src/lib/api.ts` (typed client 골격 — 화면 연결 없음). **UI 변경 없음 → 파이프라인 2단계 ui-designer 해당 없음** (계약 확정만 수행).
- 백엔드: `server/handlers/` — `tabs.ts`, `history.ts`, `tabState.ts`(state/parcels/groups/reset/import), `colors.ts`, `calcRecipes.ts`, `parcels.ts`(+ land-info 501 스텁), 공용 Supabase 클라이언트 팩토리. `server/dev-server.ts` 라우트 등록, `api/` Vercel 재export 파일 + 경로 파라미터용 `vercel.json` rewrite.
- DB: `supabase/migrations/0001_v2_schema.sql` (신규, 단일), `supabase/seed.sql` (로컬 기본 탭+팔레트 6색), `scripts/import-parcels.ts`.
- API 계약: `src/types/api/` — `common.ts`·`tabs.ts`·`history.ts`·`tabState.ts`·`colors.ts`·`calcRecipes.ts`·`parcels.ts` (신규), 기존 `config.ts` 유지.
- 테스트/CI: `tests/unit/`(어댑터 동등성·스키마·ID 생성), `tests/integration/`(핸들러 — 로컬 Supabase 대상, 신규 디렉터리), CI에 Supabase CLI 기동 + 통합 테스트 단계 추가.

## 기준 명세서(§6)와 다르게 설계한 부분

1. **`GET /api/tabs`의 빈 상태 자동 부트스트랩 (AC-5)** — §6.2에 없는 추가. 프로덕션 `db push`는 seed.sql을 실행하지 않으므로 "활성 탭 ≥ 1" 불변식을 서버가 보장해야 C-1(첫 활성 탭 폴백)이 항상 성립.
2. **`DELETE /api/colors/:id`의 참조 null 처리를 서버 책임으로 (AC-11)** — v1은 클라이언트(M-11 소관) 로직. 탭이 여러 개인 v2에서는 클라이언트가 전 탭을 알 수 없으므로 핸들러로 이전.
3. **`fetch-land-info`는 계약만 확정, 구현은 M-13으로 이연** — §6.2 목록에는 있으나 V-World 연동 자체가 Phase 4 M-13 항목이라 중복 구현을 피함. 미구현 동안 501.
4. **`scripts/import-parcels.ts`를 Phase 3에 포함** — §6에는 명시가 없으나(프로젝트 구조에는 존재) `parcel_settings`→`parcels` FK 때문에 핸들러 통합 테스트의 전제 데이터가 필요.
5. **E2E 단계 대체** — Phase 3은 UI가 없어 Playwright AC 매핑이 불가능하므로, 파이프라인 4단계 산출물을 핸들러 통합 테스트 스위트(`tests/integration/`)로 대체한다.
6. **`color_labels`에 `updated_by text` 컬럼 추가 (5단계 검증 반려 B-1 해소)** — §6.1 원안에는 없으나, color_labels는 Realtime publication 등록 테이블이고 AC-12가 전 mutate의 `updated_by` 기록을 요구하므로 에코 가드 일관성을 위해 추가. colors PUT/DELETE 핸들러가 기록한다. DELETE는 삭제 직전 UPDATE로 행위자를 남기는 방식이라 M-6 구독 구현 시 "선행 자기 UPDATE → 후속 DELETE" 상관 로직이 필요 — 대안으로 `REPLICA IDENTITY FULL`(DELETE old record에 updated_by 직접 포함)을 M-6 착수 시 결정할 것.
