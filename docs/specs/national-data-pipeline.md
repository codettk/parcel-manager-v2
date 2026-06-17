# 전국 지적도 데이터 파이프라인 (다중 region)

- 상태: 구현 완료 (`feat/national-data` 커밋·미push, 전 게이트 green — typecheck·lint 0, 단위 487·통합 regions 8·e2e 77 passed)
- 매핑: 신규 (필지 전국 전환 로드맵 슬라이스 3 — `docs/specs/pilji-roadmap.md`. M-1~M-18 매핑표 밖)
- 판정:
  - **region 추상화 → DB 승격**: 재설계 (슬라이스 1의 클라이언트 상수 `regionCatalog.ts`를 서버 권위 `regions` 테이블 + `GET /api/regions` 카탈로그 API로 승격. 클라이언트 상수는 폴백/부팅 시드로 격하, "준비 중" 분류·검색·정렬 순수 로직은 보존).
  - **parcels 저장 위치**: 보존 (기존 DB `parcels` 테이블이 유일 진실 — region별 정적 JSON 추가 폐기. 기존 `local_id` PK·`pnpm import:parcels`·`GET /api/parcel-areas`·V-World 핸들러 전부 정합 유지. nullable `region_id` 컬럼 1개만 비파괴 추가).
  - **클라이언트 region별 로딩**: 재설계 (MapCanvas의 고정 `fetch('/data/parcels.json')`를 활성 region 스코프 로딩으로 전환. 보구곶 region은 그 데이터가 정확히 parcels.json이므로 동작 보존 — 단 경로가 region 스코프 API/정적 자산으로 일반화).
  - **region 받기/제거**: 신규 (슬라이스 1은 열람·전환만 — 데이터 받기/제거 동작 부재. 사용자별 "받은 지역" 목록을 DB 영속).
  - **지도 코어·인증(M-1~16, 슬라이스 1·2)**: 보존.

## 배경 / 절충 (반드시 후속 단계가 인지)

슬라이스 1(`region-entry`)은 region을 클라이언트 상수(`regionCatalog.ts`)·`localStorage`(`pilji_v2_active_region`)로만 표현하고, 보구곶(인천 강화군 화도면)을 유일 적재 region으로 두고 나머지를 "준비 중"으로 노출했다. 이 슬라이스가 그 "준비 중"을 실데이터로 해소하는 **메커니즘**을 만든다. 다음 절충을 못박는다:

1. **이 슬라이스는 메커니즘이지 데이터 적재 사업이 아니다.** region 테이블, region 스코프 parcels 적재/조회 API, 클라이언트 region별 로딩, 받기/제거 동작을 만들고 — 보구곶 + **샘플 region 1개**(작은 합성/추출 데이터셋)로 메커니즘을 시연한다. **전국 실 지적도 대량 취득(연속지적도·V-World 전국 추출)은 별도 데이터 운영 작업으로 명시 분리** — 이번 범위 밖. 시연용 샘플 region 데이터는 `public/data/regions/<regionId>.json`(parcels.json과 동일 구조 `{ bbox, parcels:[{id,jibun,c}] }`)으로 1개 커밋한다.

2. **`public/data/parcels.json`은 절대 수정 금지** — 보구곶 region의 시드 소스로만 **읽기** 사용한다. `pnpm import:parcels`가 이 파일을 보구곶 `region_id`로 라벨링해 `parcels` 테이블에 멱등 upsert한다.

3. **parcels 저장 = DB `parcels` 테이블 단일 경로**(region별 정적 JSON 분산 폐기). 이유: ① 기존 `GET /api/parcel-areas`·`GET /api/parcels/:id`·V-World fetch-land-info가 이미 DB 행을 권위로 쓴다. ② `parcel_settings`/`parcel_groups`가 `parcels(local_id)`를 FK로 참조한다. ③ region별 정적 JSON은 적재·V-World enrich·면적 조회를 분기시켜 v1 부채(server.js ↔ api/ 이중 구현)를 재현한다. 단 **좌표/지오메트리의 최초 로딩**은 정적 자산(`public/data/regions/...` 또는 보구곶의 parcels.json)에서 가져온다 — DB는 좌표 jsonb를 보유하나 4천+ 폴리곤을 매 진입 API로 내려받는 비용을 피하기 위해 렌더 입력은 정적 자산이 1차 소스, DB는 편집/면적/토지정보의 권위로 역할 분담(현행 보존).

4. **region 데이터 = 전역 공용 카탈로그 + 사용자별 "받은 지역"**. region 카탈로그(어떤 지역이 존재하고 적재됐는지)는 전역(공용) — 슬라이스 2의 멤버십과 무관하게 모든 사용자가 같은 카탈로그를 본다. "받은 지역" 목록(사용자가 자기 기기에 받아 둔 region)은 **로그인 사용자별 DB 영속**(`user_regions`) — 슬라이스 2의 `created_by`(auth.users) 신원에 종속. 마지막 활성 region은 슬라이스 1의 `localStorage` 키(`pilji_v2_active_region`)를 **보존**(빠른 부팅 분기) + 로그인 사용자면 서버 "받은 지역"과 정합(서버가 비면 localStorage 폴백). region 카탈로그 조회(`GET /api/regions`)는 인증 불요(공개), 받기/제거(mutate)는 기존 규칙대로 `requireUser` 401 게이트.

5. **작업공간(tabs)은 이번 슬라이스에서 region 스코프로 쪼개지 않는다** — 기존 단일 공유 작업공간 구조 보존. region 전환 시 같은 tabs/parcel_settings 위에서 활성 region의 parcels만 렌더·편집한다(필지 `local_id`가 region 간 충돌하지 않도록 적재 시 prefix 보장). tabs의 region 분할은 후속 슬라이스로 분리(이 슬라이스 비범위).

## 사용자 스토리

1. 사용자로서, 지역 선택/관리 화면에 노출되는 지역 목록이 클라이언트에 박힌 더미가 아니라 서버가 관리하는 실제 카탈로그이길 바란다 (지역이 늘면 앱 재배포 없이 반영).
2. 사용자로서, "준비 중"이던 지역 중 데이터가 적재된 지역을 **받기**로 내 목록에 추가하고, 그 지역으로 전환하면 해당 지역의 실제 지적도가 지도에 뜨길 바란다.
3. 사용자로서, 더는 안 보는 지역을 **제거**해 내 받은 목록을 정리하고 싶다 (단 현재 보고 있는 지역은 실수로 지워지지 않게).
4. 돌아온 사용자로서, 다른 기기에서 로그인해도 내가 받은 지역 목록이 따라오길 바란다 (사용자별 서버 영속).

## 수용 기준 (AC)

> region 카탈로그·받기/제거는 핸들러 통합테스트(`tests/integration/`), 클라이언트 로딩·전환·게이트 보존은 Playwright E2E(`tests/e2e/`)로 검증한다. E2E는 기존 `tests/e2e/helpers/mockApi.ts` 하네스에 region 라우트를 추가해 모킹한다.

### region 카탈로그 — DB 승격 + API

AC-1. (Given `regions` 테이블에 보구곶(`loaded=true`) + 샘플 region(`loaded=true`) + "준비 중" region 1개 이상(`loaded=false`)이 시드된 상태) When `GET /api/regions`를 호출한다 Then 200과 함께 카탈로그 배열이 반환되고, 각 항목이 `id·sido·sigungu·emd·displayName·shortName·loaded·parcelCount` 필드를 포함하며 `regionsResponseSchema`(zod) 검증을 통과한다. (인증 헤더 없이도 200 — 공개 카탈로그)

AC-2. (Given AC-1의 카탈로그) When 클라이언트가 부팅해 region 선택 화면을 연다 Then 화면에 표시되는 적재(활성) region 수와 "준비 중" region 수가 `GET /api/regions` 응답의 `loaded` 분류와 1:1 일치한다 (클라이언트 더미 상수가 아니라 서버 카탈로그 소비).

### region별 parcels 적재

AC-3. (Given `public/data/parcels.json`만 존재하고 `parcels` 테이블이 비어 있는 상태) When `pnpm import:parcels`를 실행한다 Then 4,409행이 보구곶 `region_id`(`incheon-ganghwa-hwado`)로 라벨링되어 멱등 upsert되고, 재실행해도 행 수가 변하지 않으며 `region_id`가 모두 채워진다. (parcels.json 파일은 변경되지 않는다)

AC-4. (Given 샘플 region 정적 데이터셋 `public/data/regions/<sampleId>.json`이 존재) When region 적재 스크립트를 샘플 region 인자로 실행한다 Then 해당 region의 필지가 샘플 `region_id`로 `parcels` 테이블에 멱등 적재되고, 그 `local_id`가 보구곶 필지 `local_id`와 충돌하지 않는다 (region 간 PK 격리).

### region별 클라이언트 지도 로딩

AC-5. (Given 보구곶 region이 활성으로 선택되어 지도에 진입한 상태) When 지도 캔버스가 렌더된다 Then 보구곶 지적도(parcels.json 4,409필지)가 슬라이스 1과 동일하게 렌더된다 (region 스코프 로딩 전환 후에도 보구곶 동작 회귀 없음).

AC-6. (Given 사용자가 받은 샘플 region으로 전환한 상태) When 지도 캔버스가 렌더된다 Then 보구곶 필지가 아니라 샘플 region의 필지(해당 region 데이터셋)만 렌더되고, region을 보구곶으로 되돌리면 다시 보구곶 필지가 렌더된다 (활성 region 단위 지도 데이터 교체).

### region 받기 / 제거 (사용자별 영속)

AC-7. (Given 로그인 세션으로 데이터 적재(`loaded=true`)됐지만 아직 받지 않은 region) When `POST /api/regions/:id/acquire`(받기)를 호출한다 Then 200과 함께 해당 region이 사용자의 `user_regions`에 기록되고, 이어진 `GET /api/regions/mine`(받은 목록)에 그 region이 포함된다.

AC-8. (Given `loaded=false`("준비 중") region) When 받기를 호출한다 Then 409가 반환되고 사용자의 받은 목록에 추가되지 않는다 (데이터 미적재 region은 받을 수 없음 — "준비 중" 의미 보존).

AC-9. (Given 사용자가 받은 region이 2개 이상이고 그중 비활성(현재 보고 있지 않은) region) When `DELETE /api/regions/:id`(제거)를 호출한다 Then 200과 함께 받은 목록에서 제거되고, `parcels` 마스터 행·다른 사용자의 받은 목록은 영향받지 않는다 (`user_regions` 행만 삭제).

AC-10. (Given 유효한 세션 토큰 없이 받기/제거 mutate를 호출) When 요청이 핸들러에 도달한다 Then 401이 반환되고 `user_regions`에 어떤 행도 기록/삭제되지 않는다 (슬라이스 2 `requireUser` 게이트 보존 — 카탈로그 조회 `GET /api/regions`는 예외로 200).

AC-11. (Given 사용자 U가 region을 받아 `user_regions`에 기록된 상태) When 동일 user_id로 다른 토큰/기기에서 `GET /api/regions/mine`를 호출한다 Then 같은 받은 목록이 반환된다 (사용자별 서버 영속 — 기기 독립).

### 지역 관리 UI — 받기/제거 실동작

AC-12. (Given 지역 선택 화면에서 "준비 중"이 아닌(적재됐고 미보유) region) When 사용자가 그 region을 탭한다 Then 받기 동작이 수행되고(낙관적 추가), 받은 뒤 해당 region으로 전환되어 지도가 그 region 데이터로 렌더된다.

AC-13. (Given 지역 관리 화면(`RegionManageView`)에 받은 region이 2개 이상 표시된 상태) When 사용자가 비활성 region의 제거를 실행한다 Then 그 region이 목록에서 사라지고, 현재 활성 region은 그대로 유지된다.

AC-14. (Given 지역 관리 화면에 받은 region이 표시된 상태) When 사용자가 현재 활성(사용 중) region의 제거를 시도한다 Then 제거가 차단되거나 활성 전환을 먼저 요구하는 가드가 동작해, 제거 후 활성 region이 없어 지도가 빈 상태가 되는 일이 없다.

### 슬라이스 1 진입 게이트 회귀 (보존 게이트)

AC-15. (Given `pilji_v2_active_region`에 마지막 region 기록이 없는 첫 진입 — 로그인은 완료) When 앱이 부팅을 마친다 Then 지도 대신 지역 선택 화면이 표시된다 (슬라이스 1 AC-4 보존).

AC-16. (Given 보구곶 region을 한 번 선택해 `localStorage`에 기록된 상태) When 앱을 새로고침한다 Then 지역 선택 화면을 거치지 않고 곧바로 보구곶 지도로 복귀한다 (슬라이스 1 AC-10 보존 — 마지막 region 영속).

AC-17. (Given "준비 중"(`loaded=false`) region) When 사용자가 지역 선택 화면에서 그 항목을 탭한다 Then "준비 중" 안내가 표시되고 지도로 전환되지 않으며, 받기 동작도 일어나지 않는다 (슬라이스 1 AC-6 보존 — 미적재 region 지도 미전환).

## 비범위

- **전국 실 지적도 대량 취득**(연속지적도·V-World 전국 추출·전국 region 메타 생성) — 별도 데이터 운영 작업. 이 슬라이스는 보구곶 + 샘플 region 1개로 메커니즘만 시연.
- GPS 역지오코딩(좌표→행정구역) — 슬라이스 4. region 매칭은 기존 클라이언트 휴리스틱/폴백 유지.
- PRO 구독·freemium 게이팅·페이월·IAP — 슬라이스 6.
- 작업공간(tabs)의 region 스코프 분할 — 단일 공유 작업공간 보존(후속 슬라이스). region 전환 시 같은 tabs 위에서 활성 region의 parcels만 렌더.
- RLS 재도입 — 슬라이스 2 결정 유지(핸들러 레이어 강제, `0002` posture).
- region별 V-World enrich 자동화 — 기존 `scripts/fetch-vworld.ts`·`POST /api/parcels/:id/fetch-land-info` 동작 무변경.
- 지역 검색 결과의 서버 페이징/원격 검색 — 카탈로그는 전량 반환 + 클라이언트 검색(`searchRegions`) 보존.

## 영향 범위

- 프론트:
  - `src/features/region/regionCatalog.ts` — 더미 상수에서 부팅 시드/타입·순수 로직(`searchRegions`·`loadedRegions`·"준비 중" 분류) 모듈로 격하. `Region` 타입은 `src/types/api/regions.ts` zod에서 추론한 것과 호환되게 정렬.
  - 신규 `src/features/region/useRegionCatalog.ts`(`GET /api/regions` 조회·캐시), `src/features/region/regionData.ts`(활성 region → 지도 데이터 자산 경로 해석 — 보구곶=parcels.json, 그 외=`/data/regions/<id>.json`).
  - `src/features/region/RegionSelectView.tsx`·`RegionManageView.tsx`·`RegionRow.tsx` — 서버 카탈로그 소비 + 받기/제거 액션 배선(현재 열람·전환 only → 실 mutate).
  - `src/features/map/MapCanvas.tsx` — 고정 `fetch('/data/parcels.json')`를 활성 region 데이터 경로 로딩으로 전환(region 변경 시 재로딩·viewport fit 리셋).
  - `src/stores/ui.ts` — region 게이트 상태 보존 + 활성 region 변경 시 지도 데이터 재로딩 트리거. 신규 `src/stores/regions.ts`(또는 workspace 확장) — 받은 region 목록 서버 동기화 + 낙관적 받기/제거(M-5 패턴: 롤백 없는 낙관 업데이트).
  - `src/lib/api.ts` — region 엔드포인트 typed client 메서드 추가(mutate 시 기존대로 `clientId`·`Authorization` 자동 주입).
- 백엔드:
  - 신규 `server/handlers/regions.ts` — `regionsCatalogHandler`(GET, 인증 불요), `regionsMineHandler`(GET, requireUser), `regionAcquireHandler`(POST, requireUser, `loaded=false`면 409), `regionItemHandler`(DELETE, requireUser, 활성 보호 가드는 클라/서버 양측). 전부 런타임 비의존 순수 함수(req/res 직접 접근 금지).
  - `server/routes.ts` — `GET /api/regions`·`GET /api/regions/mine`·`POST /api/regions/:id/acquire`·`DELETE /api/regions/:id` 라우트 등록.
  - `server/handlers/parcels.ts` — `parcelAreasHandler`·`parcelItemHandler`에 region 스코프 필터 옵션 추가(쿼리 `?region=`, 미지정 시 현행 전량 — 비파괴 기본값).
- DB: **마이그레이션 필요** — 신규 `supabase/migrations/0004_regions.sql`(비파괴):
  - `regions` 테이블 신설(`region_id` PK·sido·sigungu·emd·display_name·short_name·loaded bool·parcel_count int·size_label·bbox jsonb·sort_order). 보구곶 + 샘플 + "준비 중" seed INSERT 포함.
  - `parcels`에 **nullable `region_id text REFERENCES regions(region_id)`** 추가 + 인덱스(기존 4,409행은 import 스크립트가 보구곶으로 백필 — 컬럼 자체는 nullable 비파괴).
  - `user_regions` 신설(`user_id uuid REFERENCES auth.users` · `region_id text REFERENCES regions` · `acquired_at` · PK(user_id, region_id)). RLS는 0002/0003 posture 따라 OFF.
  - Realtime publication 추가 등록은 불요(받은 목록은 사용자 단발 조회 — 협업 동기화 대상 아님).
- API 계약: **신규** — `src/types/api/regions.ts`: `regionSchema`(카탈로그 항목), `regionsResponseSchema`(배열), `userRegionsResponseSchema`(받은 목록), `regionAcquireRequestSchema`(`clientId` 포함 — mutate 일관성). 401/409는 기존 `errorResponseSchema` 재사용.
- 데이터 적재 스크립트:
  - `scripts/import-parcels.ts` — upsert 행에 `region_id: 'incheon-ganghwa-hwado'` 부여(AC-3).
  - 신규 `scripts/import-region.ts`(또는 import-parcels에 `--region <id> --source <path>` 인자) — 샘플 region 정적 데이터셋을 해당 region_id로 멱등 적재(AC-4). `runImport` 추상화로 fixture 단위테스트 가능하게.

## sub-슬라이스 분할 권고

이번 명세는 **한 `/pipeline`로 다룰 응집 범위**다(region DB 승격 + 받기/제거 + 클라 region 로딩 = 한 데이터 흐름). 다만 frontend+backend 병렬이 크므로, 검증 부하가 과하면 다음 경계로 분할 가능:

- **3a (백엔드 우선)**: `regions`/`user_regions` 마이그레이션 + 핸들러 4종 + 계약 + 적재 스크립트 + 통합테스트(AC-1·3·4·7~11).
- **3b (프론트 후속)**: 카탈로그 서버 소비 + region별 지도 로딩 + 받기/제거 UI + 진입 게이트 회귀 E2E(AC-2·5·6·12~17).

권고: 1회 `/pipeline`로 진행하되, Stage 3 구현을 frontend-dev ∥ backend-dev로 병렬 배치하고 계약(`src/types/api/regions.ts`)을 Stage 2에서 먼저 확정해 양측 동시 착수.
