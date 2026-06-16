# V-World 토지정보 조회 (fetch-land-info)

- 상태: 검토 대기
- 매핑: M-13 (`api/parcels/[id]/fetch-land-info.js` 93줄 + `scripts/fetch-vworld.js` 165줄 → `server/handlers/parcels.ts` 구현 교체 + `server/handlers/vworld.ts` 공용 모듈 + `scripts/fetch-vworld.ts`)
- 판정: 재설계 (V-World 호출 사양·필드 매핑·멱등 일괄 적재는 v1 보존, **fetch 기반 단일화**로 v1의 https.request/fetch 이중 구현 폐기 — 명세서 M-13 확정. 에러 의미론·버튼 실패 표시는 재설계)

## 판정 상세 (선별적 포팅)

| 구분   | 항목                                                                                                                                                  | 근거                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 보존   | V-World 호출 사양: `POST https://api.vworld.kr/ned/data/ladfrlList`, form-urlencoded, `pnu`(19자리)·`format=xml`·`numOfRows=1`·`pageNo=1`·`key`·`domain`(있을 때만) | v1 운영에서 검증된 호출 경로 — 키·도메인 등록 그대로 동작                                      |
| 보존   | 응답 파싱: XML(fast-xml-parser) → `fields.ladfrlVOList`(배열이면 첫 항목)                                                                              | v1 검증 경로. JSON 포맷 전환은 실키 없이 검증 불가한 변경이라 채택하지 않음                    |
| 보존   | 필드 매핑 10종 + 정규화(문자열 trim 후 빈 값 null, `lndpclAr` parseFloat, `cnrsPsnCo` parseInt) + `vworld_fetched_at = now()`                          | v1 핸들러·스크립트 공통 매핑 — §V-World 매핑 표 참조                                           |
| 보존   | 일괄 스크립트 동작: pnu 19자리 + `vworld_fetched_at IS NULL`만 대상(멱등), `--force` 재조회, 200ms 간격(rate limit), 페이징 수집, 실패 사유별 리포트   | v1 `fetch-vworld.js` 검증 동작                                                                 |
| 보존   | 버튼 노출 조건: pnu 있고 `vworldFetchedAt` null일 때만 "토지임야 조회" 버튼, 조회 완료면 카드(재조회 버튼 없음 — 갱신은 스크립트 소관)                 | v1 ParcelSheet 동작                                                                            |
| 재설계 | **호출 구현 단일화**: 핸들러(fetch)·스크립트(https.request) 이중 구현 → `server/handlers/vworld.ts` 공용 모듈 하나를 양쪽이 import                     | 명세서 M-13 확정 ("fetch 기반으로 단일화")                                                     |
| 재설계 | 키 부재 시 v1 400 → **503** ("V-World API 키가 설정되지 않았습니다")                                                                                   | 클라이언트 과실이 아닌 서버 구성 문제 — 400은 오분류                                           |
| 재설계 | pnu 미확보 시 v1 400 → **409** (기존 `conflict()` 헬퍼)                                                                                                | 요청이 아닌 리소스 상태 문제                                                                   |
| 재설계 | V-World 호출 실패·파싱 실패·무자료 시 v1 500/500/404 혼재 → **502 단일화**                                                                             | 외부 게이트웨이 오류로 통일 — 프론트는 "조회 실패 + 재시도" 한 분기면 충분                     |
| 재설계 | 성공 응답: v1 `{ok, data:<snake_case 부분>}` → **갱신된 parcels 행 전체**(`parcelSchema`, camelCase)                                                   | Phase 3 확정 계약(`fetchLandInfoResponseSchema = parcelSchema`) — 프론트가 카드 즉시 갱신 가능 |
| 재설계 | 버튼 UX: v1 무소음 실패(console.error만) → 조회 중 비활성 표시 + 실패 시 인라인 오류 문구 + 재시도 가능                                                | v1의 침묵 실패는 사용자가 결과를 알 수 없음                                                    |
| 폐기   | `lad_frtl_sc`/`lad_frtl_sc_nm`/`last_updt_dt` 저장                                                                                                     | v2 확정 스키마(명세서 §6.1 parcels)에 컬럼 없음 + v1 UI 미사용 (select 문자열에만 존재)        |
| 폐기   | 응답 pnu 역갱신 (`update.pnu = fields.pnu`)                                                                                                            | 요청 자체가 pnu 기준 조회라 무의미하고 `pnu UNIQUE` 충돌 위험만 있음                           |
| 폐기   | 실 V-World 통합 테스트(키 있을 때 조건부 실행)                                                                                                         | 외부 API 실호출은 CI 비결정성·키 노출 문제 — 일괄 스크립트 첫 실행이 실질 검증을 대신함        |

## 사용자 스토리

1. 공동체 사용자는 필지 시트에서 "토지임야 조회"를 탭해 해당 필지의 지목·면적·소유구분을 공부(公簿) 기준으로 채워, 모두가 같은 토지 정보를 본다.
2. 운영자는 일괄 스크립트 1회 실행으로 전 필지(4,409개)의 V-World 토지정보를 적재해, 목록 면적·계산기·시트 면적 행이 실데이터로 동작하게 한다.

## 동작 명세

### V-World 공용 모듈 (`server/handlers/vworld.ts`)

- `fetchLadfrl(pnu, env)`: 전역 `fetch`로 `https://api.vworld.kr/ned/data/ladfrlList`에 form-urlencoded POST → XML 파싱(fast-xml-parser) → `fields.ladfrlVOList` 첫 항목 → parcels 컬럼 매핑 객체 반환. 데이터 없으면 실패 표시 반환(throw 또는 결과 타입).
- 핸들러와 일괄 스크립트가 **이 모듈 하나만** 사용한다 — v1 이중 구현 재발 방지.
- 매핑 표 (ladfrlVOList → parcels 컬럼, 문자열은 trim 후 빈 값 null):

| V-World 필드     | parcels 컬럼        | 변환             |
| ---------------- | ------------------- | ---------------- |
| `ldCode`         | `ld_code`           | str              |
| `ldCodeNm`       | `ld_code_nm`        | str              |
| `lndcgrCode`     | `lndcgr_code`       | str (지목 코드)  |
| `lndcgrCodeNm`   | `lndcgr_code_nm`    | str (지목명)     |
| `lndpclAr`       | `lndpcl_ar`         | parseFloat       |
| `posesnSeCode`   | `posesn_se_code`    | str              |
| `posesnSeCodeNm` | `posesn_se_code_nm` | str (소유구분명) |
| `cnrsPsnCo`      | `cnrs_psn_co`       | parseInt         |
| `regstrSeCode`   | `regstr_se_code`    | str              |
| `regstrSeCodeNm` | `regstr_se_code_nm` | str              |
| (호출 시각)      | `vworld_fetched_at` | `now()` ISO      |

### 단건 핸들러 (`fetchLandInfoHandler` — 501 스텁 → 구현 교체)

`POST /api/parcels/:id/fetch-land-info` (계약은 Phase 3 확정 그대로 — 변경 없음):

1. POST 아니면 405, body가 `fetchLandInfoRequestSchema`(clientId) 불통과면 400 (기존 스텁 동작 보존).
2. `ctx.env.V_WORLD_LADFRLLIST` 없으면 **503** — V-World 호출 없이 즉시 반환.
3. `local_id = :id` 필지 조회 — 없으면 **404**.
4. `pnu`가 null이거나 19자리가 아니면 **409** — V-World 호출 없이 반환.
5. `fetchLadfrl(pnu, env)` 호출 — 네트워크 실패·파싱 실패·`ladfrlVOList` 무자료 모두 **502** (`errorResponseSchema` 본문, DB 미변경).
6. 성공: 매핑 객체 + `vworld_fetched_at`으로 parcels UPDATE 후 **갱신 행 전체를 200 + `parcelSchema`(camelCase)** 로 응답 (`update().select('*').single()` → 기존 `rowToParcel`).

- clientId는 계약 일관성·검증용이다 — parcels 마스터에는 `updated_by` 컬럼이 없고 Realtime 구독 대상도 아니므로 에코 가드에 쓰이지 않는다. 다른 클라이언트는 시트 열림 시 단건 조회로 최신 값을 본다.

### ParcelSheet "토지임야 조회" 버튼 (M-7 생략분 추가)

토지 정보 섹션(`info.pnu != null`일 때만 존재)의 분기:

- `vworldFetchedAt != null` → 읽기 전용 카드 (현행 M-7 그대로).
- `vworldFetchedAt == null` → 카드 대신 "토지임야 조회" `Button`.
  - 탭 → `api.parcels.fetchLandInfo(localId)` 1회 호출. 호출 중 버튼 비활성 + "조회 중…" 표기.
  - 성공 → 응답 행으로 시트의 `fetched` 상태 교체 → 버튼이 사라지고 카드·면적 행이 즉시 갱신.
  - 실패(`ApiError`) → 버튼 아래 인라인 오류 문구(서버 `error` 메시지) 표시, 버튼 재활성(재시도 가능). 시트는 닫지 않는다.
- 조회 완료 필지에 재조회 버튼은 두지 않는다 (v1 동일 — 갱신은 일괄 스크립트 소관).

### 일괄 스크립트 (`scripts/fetch-vworld.ts`)

- 실행: `pnpm fetch:vworld` (`tsx scripts/fetch-vworld.ts`), `--force` 옵션. `import-parcels.ts` 선례를 따라 dotenv + `createDb(process.env)` (service role).
- 대상 선정: `pnu LIKE '___________________'`(19자리) AND (`--force` 아니면 `vworld_fetched_at IS NULL`) — `.range()` 페이징으로 전량 수집. **멱등**: 재실행 시 이미 조회된 필지는 건너뜀.
- 필지당 `fetchLadfrl` 호출 → 성공 시 UPDATE, 실패 시 기록 후 계속. 호출 간 **200ms 대기** (V-World rate limit, v1 보존).
- 종료 시 성공/실패 카운트 + 실패 사유별 그룹 리포트 출력. 실패 1건 이상이면 exit code 1.
- 핵심 로직(대상 선정 → 조회 → 갱신)은 export된 함수로 작성해 테스트에서 fetch mock과 함께 호출 가능하게 한다.
- **Phase 5 §8.1 시드와의 관계**: `migrate-v1-data.ts` 시드를 실행하면 v1의 pnu·V-World 데이터가 그대로 복사되므로 본 스크립트는 대상 0건(no-op)이다. 본 스크립트는 ① 시드 없이 빈 DB로 시작할 때의 적재 경로, ② 시드 후 누락·신규 필지 보충 경로다. 두 경로 모두 지원하며 충돌하지 않는다.

### 키 관리

- 환경변수는 v1과 동일한 이름 `V_WORLD_LADFRLLIST`(필수)·`V_WORLD_DOMAIN`(선택) — **이미 `.env.example`에 예약됨**, 값은 v1 키 재사용 (같은 V-World 계정·승인 키. v2 배포 도메인의 V-World 콘솔 등록 여부는 배포 단계에서 확인).
- 키 미설정 환경(로컬 기본 포함)에서 앱은 정상 동작한다 — 버튼 탭 시 503 오류 문구가 표시될 뿐 다른 기능에 영향 없음.
- 배포 준비(Stage 6)에서 Vercel 프로젝트 env에 두 변수 추가 절차를 릴리즈 노트에 포함한다.

## 수용 기준 (AC)

핸들러 단위 (Vitest + 로컬 Supabase + `fetch` mock, `tests/unit/` 또는 `tests/integration/`):

AC-1. Given pnu 19자리·V-World 미조회 필지와 정상 XML 응답으로 mock된 `fetch`, When `POST /api/parcels/:id/fetch-land-info`(clientId 포함)를 호출하면, Then `api.vworld.kr/ned/data/ladfrlList`에 form-urlencoded body(pnu·key 포함)로 정확히 1회 POST되고, parcels 행이 매핑 표대로 갱신되며(`lndcgr_code_nm`·`lndpcl_ar` 숫자·`vworld_fetched_at` not null, 빈 문자열 필드는 null), 응답이 200 + `parcelSchema` 통과(camelCase 갱신 행)다.

AC-2. Given `V_WORLD_LADFRLLIST`가 없는 env, When 같은 요청을 보내면, Then 503 + `errorResponseSchema` 본문이고 `fetch`(V-World)는 호출되지 않는다.

AC-3. Given 존재하지 않는 필지 id, When 요청하면, Then 404다. Given pnu가 null인 필지, When 요청하면, Then 409이고 `fetch`(V-World)는 호출되지 않는다.

AC-4. Given `fetch`가 reject되는 경우 / XML 파싱 불가 본문인 경우 / `ladfrlVOList`가 없는 응답인 경우 각각, When 요청하면, Then 모두 502 + `errorResponseSchema`이고 해당 필지 행은 변경되지 않는다(`vworld_fetched_at` null 유지).

일괄 스크립트 (Vitest + 로컬 Supabase + `fetch` mock):

AC-5. Given pnu 19자리·미조회 필지 2건 + 조회 완료 필지 1건 + pnu null 필지 1건, When 스크립트 핵심 함수를 실행하면, Then 미조회 2건만 V-World 호출·갱신되고(멱등), `--force`로 실행하면 pnu 19자리 3건이 모두 호출된다.

컴포넌트 테스트 (RTL, `tests/unit/`):

AC-6. Given pnu가 있고 `vworldFetchedAt`이 null인 필지 응답으로 시트를 렌더하면, Then 토지 정보 카드 대신 "토지임야 조회" 버튼이 표시되고, pnu가 null인 필지면 버튼·카드 모두 표시되지 않는다.

AC-7. Given AC-6의 버튼, When 탭하면, Then `api.parcels.fetchLandInfo`가 정확히 1회 호출되고 응답 전까지 버튼이 비활성("조회 중…" 표기)이며, 성공 응답 후 버튼이 사라지고 카드에 지목·소유구분이 표시된다.

AC-8. Given 버튼 탭 후 호출이 `ApiError`로 실패하면, Then 인라인 오류 문구가 표시되고 버튼이 재활성되어 재시도 가능하며, 시트는 닫히지 않는다.

E2E (Playwright + mockApi, `tests/e2e/vworld-land-info.spec.ts`):

AC-9. Given mockApi가 pnu 있는 미조회 필지와 fetch-land-info 성공 응답을 제공할 때, When 필지 시트를 열어 "토지임야 조회"를 탭하면, Then 버튼이 사라지고 토지 정보 카드에 지목이 표시된다.

## 비범위

- pnu 적재 자체 — v2 `parcels.json`에 pnu가 없어 현재 전 필지 pnu null. pnu의 소스는 Phase 5 §8.1 v1 데이터 시드(`migrate-v1-data.ts`) 소관. 본 기능은 pnu가 채워진 필지에 대한 조회 경로만 구현한다 (pnu null이면 버튼 자체가 안 보임 — v1 동일).
- 자동 주기 갱신(스케줄러·cron) — 갱신은 수동 스크립트 1회성.
- 조회 완료 필지의 수동 재조회 버튼 (v1에도 없음 — `--force` 스크립트로 충분).
- 지도 면적 라벨·목록 면적 표시 로직 변경 — M-9/M-12 기존 구현이 채워진 `lndpcl_ar`을 그대로 소비.
- 실 V-World API 통합 테스트 — 폐기 판정 (판정 상세 참조).

## 영향 범위

- 프론트: `src/features/parcel/ParcelSheet.tsx` — 토지 정보 섹션에 조회 버튼·로딩·오류 분기 추가 (M-7 생략분). `src/lib/api.ts` 변경 없음 (기존 `api.parcels.fetchLandInfo` 사용, clientId 자동 주입).
- 백엔드: `server/handlers/parcels.ts` — `fetchLandInfoHandler` 501 스텁을 구현으로 교체. `server/handlers/vworld.ts` 신규 (V-World fetch·XML 파싱·매핑 — 핸들러·스크립트 공용). `server/handlers/http.ts`에 503/502 헬퍼 추가.
- 스크립트: `scripts/fetch-vworld.ts` 신규 + package.json `fetch:vworld`.
- 의존성: `fast-xml-parser` 추가 (v1 검증 파서, 순수 JS — Vercel 런타임 무관).
- DB: 마이그레이션 불필요 (0001 스키마의 기존 컬럼만 사용. `lad_frtl_sc`·`last_updt_dt`는 폐기 판정이므로 컬럼 추가 없음).
- API 계약: 변경 없음 — Phase 3 확정 `fetchLandInfoRequestSchema`/`fetchLandInfoResponseSchema`(`src/types/api/parcels.ts`) 그대로.
- 환경변수: `V_WORLD_LADFRLLIST`·`V_WORLD_DOMAIN` — `.env.example` 이미 존재, 로컬 `.env`와 Vercel env에 v1 키 설정 (배포 절차에 포함).
- 디자인: **ui-designer 불요** — 기존 `Button`·카드 스타일 재사용, 신규 공통 컴포넌트·신규 프레임 없음 (버튼 1개 + 오류 문구).
