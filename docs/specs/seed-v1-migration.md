# v1 → v2 데이터 시드 (migrate-v1-data)

- 상태: 검토 대기
- 매핑: M-N/A (Phase 5 §8.1 — `scripts/migrate-v1-data.ts` 신규 운영 스크립트, M 매핑 기능 아님)
- 판정: 신규 (v1 운영 DB → v2 정규화 스키마 1회성 이관 스크립트. 읽기는 v1 anon, 쓰기는 v2 service role. v1 코드 이식이 아니라 v2 스키마·정규화 규칙 기준으로 새로 설계 — §8.1 + R-1)

## 판정 상세 (선별적 포팅)

| 구분   | 항목                                                                                                                        | 근거                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 보존   | overrides 권위 규칙: `app_state.parcels`가 비어있지 않으면 그것이 권위(parcel_settings 무시), 비었으면 parcel_settings 사용 | v1 `api/reset.js` 프로덕션 로직 — app_state가 운영 권위 소스였음 (§8.1 ※, R-1)                    |
| 보존   | pinned·icon 보존 (v1 운영 DB 실재 컬럼, 001 SQL엔 없음)                                                                     | §8.2 주의 — 시드는 운영 DB 실스키마 기준                                                          |
| 보존   | reset_snapshots(최대 10 FIFO) → 닫힌 탭 N개 (탭명=label, closed_at=createdAt)                                               | §8.1 6번 — v1 히스토리를 v2 닫힌 탭으로 흡수                                                      |
| 재설계 | overrides 정규화: 의미 필드(color·name·memo·pinned) 전무 시 행 생략                                                         | v2 `normalizeOverride`/`isClearedOverride` 동형 — DB에 무의미 행 미생성 (`src/utils/override.ts`) |
| 재설계 | 빈 그룹명 `''` → `null` 정규화                                                                                              | M-10 백로그 — v2 `parcel_groups.name`은 nullable, 빈 문자열 비권장                                |
| 재설계 | group_id 전부 재생성 (스냅샷→닫힌탭 이관 시)                                                                                | C-3 선례 `genGroupIds()` — 동일 group_id 충돌 방지 (`server/handlers/ids.ts`)                     |
| 재설계 | color_labels hex 부재 시 기본 6색 보충 + `app_state.color_labels` 레거시 폴백                                               | v2 `color_labels.hex`는 NOT NULL — hex 없는 v1 행은 채워야 INSERT 가능                            |
| 폐기   | `lad_frtl_sc`·`lad_frtl_sc_nm`·`last_updt_dt` 컬럼 복사                                                                     | v2 parcels 스키마에 컬럼 없음 (M-13 판정, `0001_v2_schema.sql`)                                   |
| 폐기   | 양방향 동기화·증분 시드                                                                                                     | §8.1 — 시드는 v2 실사용 직전 1회성, 이후 두 DB 독립 (R-6)                                         |
| 폐기   | 실 v1 운영 DB 통합 테스트                                                                                                   | 자격증명·CI 비결정성 — 사용자 dry-run이 실질 검증 (M-13 `fetch-vworld` 판정과 동일)               |

## 사용자 스토리

1. 운영자는 v2 실사용 시작 직전, `pnpm seed:v1 --dry-run`을 v1 운영 자격증명으로 1회 실행해 이관될 데이터의 전후 카운트 리포트를 확인하고, 결과가 타당하면 같은 명령을 `--dry-run` 없이 실행해 v1의 필지 설정·그룹·색상·계산기·스냅샷을 v2 빈 DB로 옮긴다.
2. 운영자는 시드 실행 중 v1 DB가 읽기 전용으로만 접근되어 v1 서비스에 어떤 영향도 가지 않음을 보장받는다.
3. 개발자는 시드 핵심 로직을 fixture로 호출하는 단위 테스트로, 권위 규칙·정규화·스냅샷 이관 매핑이 명세대로 동작함을 회귀 검증한다.

## 실행 방법 (운영자 절차)

```bash
# 0. v2 로컬 Supabase 기동 + 스키마 + 지오데이터 시드
pnpm exec supabase start
pnpm import:parcels        # parcels.json(4,409) 선적재 (시드는 parcels upsert로 보강)

# 1. dry-run (쓰기 0회, 리포트만) — v1 소스 선택은 env 또는 --source
V1_SUPABASE_URL=<v1 운영 URL> V1_SUPABASE_ANON_KEY=<v1 운영 anon> \
  pnpm seed:v1 --dry-run --source=prod

# 2. 리포트 검토 후 실제 실행 (로컬 v2 먼저)
V1_SUPABASE_URL=... V1_SUPABASE_ANON_KEY=... pnpm seed:v1 --source=prod

# 3. 검증 후 v2 운영 DB 대상 재실행 (.env의 V2 service role로 전환)
```

- 읽기 소스(v1): `V1_SUPABASE_URL`/`V1_SUPABASE_ANON_KEY` env가 있으면 그것을, 없으면 `--source=dev|prod`로 v1 `.env`의 개발/운영 URL+anon 키를 선택. v1은 RLS DISABLED라 anon 키로 읽기 가능.
- 쓰기 타깃(v2): 기존 선례(`import-parcels.ts`)대로 `.env`의 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`로 `createDb(process.env)` (service role).
- v1에 대한 쓰기는 어떤 경우에도 발생하지 않는다.

## 6단계 이관 매핑 (확정)

1. **parcels**: v1 parcels → v2 parcels. 폐기 3컬럼(`lad_frtl_sc`·`lad_frtl_sc_nm`·`last_updt_dt`) 제외, 그 외 전 컬럼(`pnu`·`vworld_fetched_at` 포함) 복사. `onConflict: 'local_id'` upsert (멱등 — `import-parcels.ts` 선례). pnu·V-World 데이터 보존.
2. **기본 탭 생성**: `genTabId()`로 `tab_<ts36><rand4>` 1개, `name='기본 작업공간'`, `sort_order=0`, `closed_at=null` (v2 필수 활성 탭). 시드 멱등 가드: 이미 활성 탭이 있으면 새로 만들지 않고 기존 첫 활성 탭을 기본 탭으로 사용.
3. **overrides** (→ `parcel_settings`, `tab_id`=기본 탭): 소스 선택은 권위 규칙 — `app_state.parcels`가 비어있지 않으면 그것을, 비었으면 v1 `parcel_settings` 전체를 소스로 한다. 각 항목을 `normalizeOverride`로 정규화 후 `isClearedOverride`면 행 생략(color·name·memo·pinned·icon 전무). pinned·icon 보존. `updated_by`는 시드 클라이언트 id.
4. **parcel_groups** (`tab_id`=기본 탭): group_id는 v1 키를 그대로 사용해도 무방하나(기본 탭은 빈 상태에서 시작), 빈 그룹명 `''`→`null` 정규화. `parcel_ids` text[] 그대로. `color`·`style`·`memo` 복사.
5. **color_labels**: `color_id`·`label`·`hex`·`sort_order` 복사. hex가 없으면 기본 6색 hex로 보충. v1 `color_labels` 테이블이 비어있으면 `app_state.color_labels`(레거시 `{color_id:label}`) 폴백 — label만 있으므로 hex는 기본 6색 보충. `app_config` upsert 멱등.
6. **app_config**: `key='calc_recipes'` value(레시피 배열) 그대로 복사. `key='reset_snapshots'`(최대 10 FIFO)는 **스냅샷 1개당 닫힌 탭 1개** 생성 — `name=snapshot.label`, `closed_at=snapshot.createdAt`, `sort_order` 순차. 각 스냅샷의 `data.overrides`는 그 닫힌 탭의 `parcel_settings`(동일 정규화 적용)로, `data.groups`는 그 탭의 `parcel_groups`로 이관하되 **group_id는 `genGroupIds(n)`로 전부 재생성**(C-3 선례).

## 재실행 정책 (확정)

- 설계 전제: 시드는 **빈 v2 DB 1회성**이다 (§8.1 — v2 실사용 직전 1회).
- parcels(1번)는 `local_id` upsert로 항상 멱등.
- 탭·설정·그룹(2~4번, 6번 스냅샷 탭)은 **중복 생성 방지 가드**: 시드는 실행 전 v2의 활성 탭 수와 `parcel_settings`/`parcel_groups` 행 수를 점검해, 기본 탭이 이미 존재하고 설정/그룹이 비어있지 않으면(= 이미 시드됨 추정) **경고 후 중단**(exit 1). 재시드가 의도된 경우 `--force`로 기존 비-parcels 데이터(tabs·parcel_settings·parcel_groups·color_labels·app_config)를 비우고 다시 적재한다. parcels 마스터는 `--force`에도 비우지 않는다.
- `--dry-run`은 가드·`--force`와 무관하게 항상 쓰기 0회.

## dry-run 리포트 형식

쓰기 없이 v1을 읽어 산출, stdout 출력:

```
=== v1 → v2 시드 dry-run (source=prod) ===
parcels:          v1 4409 → v2 upsert 4409 (폐기 3컬럼 제외)
기본 탭:           생성 1 (tab_xxx, '기본 작업공간')
overrides 소스:    app_state.parcels (1287행)   ← 권위 규칙
  → parcel_settings: 1190행 (97행 의미없어 생략)
  pinned 보존:      42행
parcel_groups:     8개 (빈 그룹명 정규화 1개)
color_labels:      6개 (hex 보충 0개)
calc_recipes:      3개 레시피
reset_snapshots:   4개 → 닫힌 탭 4개
  스냅샷 'a': overrides 320 → 305행, groups 5 (group_id 재생성)
  ...
=== 쓰기 0회 (dry-run) ===
```

- 실제 실행 시에도 동일 카운트를 출력하되 마지막 줄이 `=== 커밋 완료 ===`.

## 핵심 로직 export (테스트 가능성)

- `runSeed(v1Db: Db, v2Db: Db, opts: { dryRun: boolean; force: boolean }): Promise<SeedReport>` export — `main()`은 env 파싱·소스 선택·`runSeed` 호출·리포트 출력만 (`fetch-vworld.ts` `runFetchVworld` 선례).
- `SeedReport`는 위 리포트 카운트를 구조화한 객체(필지·설정·그룹·색·레시피·스냅샷→탭 수, 생략 행 수, pinned 수).
- v1Db는 테스트에서 인메모리 fixture 또는 mock 클라이언트로 주입(실 v1 DB 미접근).

## 수용 기준 (AC)

단위/통합 (Vitest + 로컬 Supabase v2 + v1 인메모리 fixture/mock, `tests/unit/` 또는 `tests/integration/`):

AC-1. Given v1 parcels fixture에 폐기 3컬럼(`lad_frtl_sc`·`lad_frtl_sc_nm`·`last_updt_dt`)과 `pnu`·`vworld_fetched_at`을 가진 행 2건, When `runSeed`(dryRun=false)를 실행하면, Then v2 parcels에 2행이 upsert되고 각 행은 `pnu`·`vworld_fetched_at`이 보존되며 폐기 3컬럼은 존재하지 않는다(v2 스키마에 없음 — 매핑 객체 키에서 제외 확인).

AC-2. Given `app_state.parcels`가 비어있지 않은 v1 fixture(예: parcel A `{color}`)와 동일 parcel A에 다른 값을 가진 v1 `parcel_settings`, When `runSeed`를 실행하면, Then 기본 탭의 `parcel_settings` 행은 `app_state.parcels` 값(권위)을 따른다. Given `app_state.parcels`가 빈 fixture, When 실행하면, Then v1 `parcel_settings` 값을 따른다.

AC-3. Given color·name·memo·pinned·icon이 모두 비어있는 v1 override 1건과 `{color:'red'}` 1건, When `runSeed`를 실행하면, Then v2 `parcel_settings`에는 후자 1행만 INSERT되고(`isClearedOverride` 동형) 전자는 생략된다.

AC-4. Given `pinned=true`·`icon='star'`인 v1 override, When `runSeed`를 실행하면, Then v2 `parcel_settings` 행에 `pinned=true`·`icon='star'`가 보존된다.

AC-5. Given `name=''`(빈 문자열)인 v1 그룹 1개와 `name='논'`인 그룹 1개, When `runSeed`를 실행하면, Then 기본 탭의 `parcel_groups`에서 전자는 `name=null`로, 후자는 `name='논'`으로 INSERT되고 두 행 모두 `tab_id`가 기본 탭이다.

AC-6. Given hex가 없는 v1 `color_labels` 행(label만 존재), When `runSeed`를 실행하면, Then v2 `color_labels` 행의 `hex`가 기본 6색에서 보충된 not-null 값이고 `label`·`sort_order`는 v1 값을 따른다. Given v1 `color_labels`가 비고 `app_state.color_labels` 레거시 맵만 존재, When 실행하면, Then 레거시 맵의 label로 행이 생성되고 hex는 기본 6색 보충이다.

AC-7. Given `reset_snapshots`에 스냅샷 2개(각 label·createdAt·data.overrides·data.groups 포함), When `runSeed`를 실행하면, Then v2 `tabs`에 닫힌 탭 2개(`closed_at`=각 createdAt not null, `name`=각 label)가 생성되고, 각 스냅샷의 overrides는 해당 닫힌 탭 `parcel_settings`로, groups는 해당 닫힌 탭 `parcel_groups`로 이관되며, 이관된 그룹의 `group_id`는 v1 원본 키와 전부 다르다(재생성).

AC-8. Given 위 AC들의 동일 fixture, When `runSeed`(dryRun=true)를 실행하면, Then v2 DB의 모든 테이블 행 수가 실행 전과 동일(쓰기 0회)이고, 반환된 `SeedReport`의 카운트(parcels·설정·그룹·색·레시피·스냅샷→탭·생략 행·pinned 수)가 실제 적재 시 카운트(별도 dryRun=false 실행 결과)와 일치한다.

AC-9. Given v2에 이미 기본 탭과 비어있지 않은 `parcel_settings`가 존재하는 상태, When `runSeed`(force=false, dryRun=false)를 실행하면, Then 중복 생성 없이 거부되고(에러/exit 1) v2 데이터가 변경되지 않는다. Given 동일 상태에서 force=true, When 실행하면, Then 기존 tabs·parcel_settings·parcel_groups·color_labels·app_config가 비워진 뒤 재적재되고 parcels 마스터 행 수는 줄지 않는다.

## 비범위

- 실 v1 운영 DB 통합 테스트 (자격증명·CI 비결정성 — 사용자 dry-run이 실질 검증, M-13 판정과 동일).
- 양방향·증분 동기화 — 시드는 1회성, 이후 두 DB 독립 (R-6).
- v1 데이터 정합성 자동 교정 — `app_state` ↔ `parcel_settings` 불일치는 권위 규칙(app_state 우선)으로 자동 해소하되, 충돌 자체를 사용자에게 건별 확인받는 인터랙티브 UI는 만들지 않는다(리포트 카운트로만 노출 — R-1).
- v2 → v1 역방향 이관.
- 지오데이터(parcels.json) 자체 변경 — 시드는 v1 parcels 행만 보강하며 좌표는 v1 `coordinates`를 우선하지 않고(이미 `import:parcels`로 적재됨) `local_id` upsert로 V-World·지목 필드만 채운다. 기존 v2 master 행 UPDATE 경로는 `jibun`·`jibun_full`·`coordinates`를 절대 쓰지 않는다(import가 권위 소스 — 좌표 보존과 동일 논리를 지번에도 적용). 신규 insert 경로(v2 master에 없는 `local_id`)만 v1 `jibun`·`coordinates`를 그대로 넣는다(import 권위 소스 부재). (coordinates 출처 충돌 처리는 명세 시 backend-dev가 0001 스키마 `coordinates NOT NULL` 제약과 함께 결정.)

## 영향 범위

- 프론트: 없음 (운영 스크립트 — UI 없음).
- 백엔드/스크립트: `scripts/migrate-v1-data.ts` 신규 (`runSeed` export + `main`). `package.json`에 `seed:v1` 추가. v1 읽기용 보조 Db 팩토리(anon 키 허용 — 기존 `createDb`는 service role 우선이므로 v1 anon 전용 생성 경로 또는 옵션 추가)는 `scripts/` 내 로컬 헬퍼로 둔다. `server/handlers/ids.ts`(`genTabId`·`genGroupIds`)·`src/utils/override.ts`(`normalizeOverride`·`isClearedOverride`) 재사용.
- DB: **마이그레이션 불필요** — 0001 스키마의 기존 6테이블만 사용. 신규 컬럼·테이블 없음.
- API 계약: 없음 — 스크립트는 v2 핸들러를 거치지 않고 service role로 직접 DB에 쓴다 (`import-parcels.ts` 선례). v1 읽기 형상은 스크립트 내부 타입으로만 정의(운영 DB 실스키마 기준), API zod 계약 변경 없음.
- 디자인: **ui-designer 불요** — UI 없음, 신규 프레임·컴포넌트 없음.
- 환경변수: `V1_SUPABASE_URL`/`V1_SUPABASE_ANON_KEY`(신규, v1 읽기) — `.env.example`에 예약 추가. v2 쓰기는 기존 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 재사용.
