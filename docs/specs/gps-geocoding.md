# GPS 역지오코딩 — 좌표→행정구역→region 자동 선택

- 상태: 구현 완료 (게이트 green — typecheck 0·lint 0·단위 504·통합 geocode 8·E2E 84 passed, DB·parcels.json·마이그레이션 무변경. `feat/gps-geocoding` 커밋·미push)
- 매핑: 신규 (필지 전국 전환 로드맵 슬라이스 4 — `docs/specs/pilji-roadmap.md` §슬라이스 4. M-1~M-18 매핑표 밖)
- 판정:
  - **`useGpsLocate` 훅**: 재설계 (슬라이스 1의 권한 priming·`denied` 폴백 골격은 보존하되, `matched`를 "시드 region 고정 폴백"에서 "역지오코딩 API 호출 → 카탈로그 매칭 결과"로 실동작화. status 머신을 매칭 결과별 분기로 확장).
  - **역지오코딩 프록시**: 신규 (좌표→행정구역 변환 백엔드 부재. M-13 V-World 공용 모듈 패턴을 따라 `server/handlers/geocode.ts` + 공용 fetch 모듈 신설).
  - **결과 → region 매칭**: 신규 (행정구역명을 슬라이스 3 `GET /api/regions` 카탈로그에 매칭하는 순수 규칙 — `src/features/region/`에 신설).
  - **지도 코어·region 카탈로그·받기/제거·인증(M-1~16, 슬라이스 1·2·3)**: 보존.

## 배경 / 절충 (반드시 후속 단계가 인지)

슬라이스 1(`region-entry`)은 GPS "현재 위치로 찾기"의 **권한 분기·폴백 UI만** 구현했다(AC-7). 좌표를 얻어도 행정구역으로 변환하지 못해 항상 시드 region(보구곶)을 추천으로 고정했다. 이 슬라이스가 그 비범위 — 좌표→행정구역 역지오코딩과 카탈로그 매칭 — 을 실구현으로 메운다. 다음 절충을 못박는다.

1. **역지오코딩 소스 = V-World 지오코더 reverse(택1 권고).** 근거: ① M-13에서 V-World 키(`V_WORLD_LADFRLLIST`)·도메인·form-urlencoded fetch·XML 파싱 패턴(`server/handlers/vworld.ts`)이 이미 검증·운영 중이라 같은 운영 모델(공용 모듈·키 부재 503·502 외부 실패)로 붙는다. ② V-World reverse geocode는 좌표(EPSG:4326 lng,lat)를 입력해 행정구역(시도·시군구·읍면동 + 법정동코드)을 돌려준다 — 카탈로그 매칭에 필요한 sido/sigungu/emd를 직접 얻는다. 카카오 로컬 API(`coord2regioncode`)도 동등 기능이나 **별도 키(`KAKAO_REST_API_KEY`) 발급·신규 운영 모델 도입**이 필요해 부채를 늘린다. 따라서 **V-World reverse geocode를 1차 채택**하고, 키 환경변수는 V-World 계열로 신설한다.
   - 환경변수: `V_WORLD_GEOCODER`(reverse geocode 전용 키 — `V_WORLD_LADFRLLIST`와 분리해 키별 쿼터·권한 격리). `V_WORLD_DOMAIN`은 기존 키 재사용.
   - **키 미설정 시 앱은 정상 동작한다.** 프록시 엔드포인트는 503을 반환하고, 클라이언트는 슬라이스 1의 검색 폴백 동선("아래에서 검색해 지역을 골라 주세요")으로 수렴한다. GPS 카드는 비활성화하지 않되 탭하면 안내만 표시한다(앱 중단 금지).

2. **결과 → region 매칭 정밀도 = 읍면동(emd) 우선, 시군구 폴백 없음(이번 범위).**
   - 역지오코딩이 돌려준 `{sido, sigungu, emd}`를 카탈로그의 `region.sido/sigungu/emd`와 **정규화 후 정확 일치**(공백 제거)로 매칭한다 — `regionCatalog.ts`의 검색 정규화(`replace(/\s+/g,'')`)와 동형. 매칭은 순수 함수 `matchRegionByAdmin(catalog, {sido,sigungu,emd})`로 구현해 단위 테스트 가능.
   - 매칭 결과 3분기:
     - ① **매칭 + `loaded=true`** → 추천 region 카드 제시. 사용자가 탭하면 슬라이스 3 받기/전환 동선(`handleActivate`) 재사용 — 미보유면 받기 후 전환, 지도 진입.
     - ② **매칭 + `loaded=false`("준비 중")** → "현재 위치는 ○○인데 아직 준비 중이에요" 안내. 지도 미전환·받기 미발생(슬라이스 3 AC-17 보존).
     - ③ **무매칭**(역지오코딩 성공했으나 카탈로그에 해당 행정구역 없음) → "현재 위치에 해당하는 지역이 아직 없어요. 검색으로 골라 주세요" 안내 + 검색창 포커스 가능. 시드 region(보구곶) **자동 추천하지 않는다**(슬라이스 1의 오해 소지 폴백 폐기 — 무매칭은 무매칭으로 정직하게).
   - **시군구 단위 폴백 매칭은 이번 범위 밖**(emd가 무매칭이면 시군구가 일치해도 ③로 수렴). 카탈로그가 emd 단위 항목이라 시군구 폴백은 모호한 다중 후보를 낳음 — 후속 슬라이스로 분리.

3. **좌표는 민감정보 — 로깅·저장 금지.** 프록시 핸들러는 좌표를 외부 호출 파라미터로만 사용하고 응답·로그·DB에 좌표를 기록하지 않는다. 역지오코딩 결과(행정구역명)도 영속하지 않는다(요청-응답 1회성). DB·마이그레이션 변경 없음.

4. **인증.** 역지오코딩 프록시는 조회(GET-유사)이나 외부 유료 쿼터를 소비하므로 슬라이스 2 `requireUser` 게이트를 적용한다(무인증 401). 슬라이스 2에서 앱은 로그인 후에야 region 게이트에 도달하므로 GPS 동선은 항상 세션 보유 상태다 — `requireUser` 적용이 동선을 막지 않는다. `clientId` 에코 가드는 무관(Realtime 비대상).

## 사용자 스토리

1. 새 사용자로서, "현재 위치로 시작"을 누르면 내 실제 위치의 행정구역이 데이터 적재된 지역이면 그 지역으로 바로 지도에 진입하고 싶다 (검색 없이 빠른 시작).
2. 새 사용자로서, 내 위치가 아직 준비 안 된 지역이거나 서비스에 없는 지역이면, 잘못된 지역(보구곶)으로 들어가지 않고 정확한 안내를 받아 검색으로 직접 고르고 싶다.
3. 위치 권한을 거부했거나 위치를 못 잡는 사용자로서, 앱이 멈추지 않고 검색으로 지역을 고를 수 있는 길이 계속 열려 있길 바란다 (슬라이스 1 보존).

## 수용 기준 (AC)

> 역지오코딩 프록시는 핸들러 통합테스트(`tests/integration/`)로, GPS 동선·매칭 3분기·권한 분기·슬라이스 1 회귀는 Playwright E2E(`tests/e2e/`)로 검증한다. 외부 V-World API는 통합테스트에서 `fetch` 모킹, E2E에서 `tests/e2e/helpers/mockApi.ts` 하네스에 역지오코딩 라우트 추가로 모킹한다. region 매칭 규칙은 순수 함수 단위테스트(`tests/unit/`)로 검증한다.

### 역지오코딩 프록시 (백엔드)

AC-1. (Given `V_WORLD_GEOCODER` 키가 미설정인 환경) When `POST /api/geocode/reverse`에 유효한 좌표 본문(`{lng, lat, clientId}`)을 유효 세션으로 호출한다 Then 503이 반환되고 응답 본문에 좌표가 포함되지 않는다 (키 부재 — 앱은 검색 폴백으로 수렴).

AC-2. (Given `V_WORLD_GEOCODER` 키가 설정되고 외부 V-World가 행정구역 `{sido:"인천광역시", sigungu:"강화군", emd:"화도면"}`을 반환하도록 모킹된 환경) When 유효 세션으로 `POST /api/geocode/reverse`를 유효 좌표로 호출한다 Then 200과 함께 `reverseGeocodeResponseSchema`(zod) 검증을 통과하는 `{sido, sigungu, emd}` 본문이 반환된다.

AC-3. (Given `V_WORLD_GEOCODER` 키가 설정되고 외부 V-World 호출이 네트워크 실패 또는 파싱 실패하도록 모킹된 환경) When 유효 세션으로 프록시를 호출한다 Then 502가 반환된다 (외부 게이트웨이 실패 — `badGateway`).

AC-4. (Given 유효한 세션 토큰 없이) When `POST /api/geocode/reverse`를 호출한다 Then 401이 반환되고 외부 V-World 호출이 발생하지 않는다 (슬라이스 2 `requireUser` 게이트).

AC-5. (Given 키 설정 + 외부가 좌표에 해당하는 행정구역 없음/빈 결과를 반환하도록 모킹) When 프록시를 호출한다 Then 본문의 `sido/sigungu/emd` 중 확정 불가한 필드가 명세된 방식(`null` 허용)으로 표현되어 200으로 반환된다 (역지오코딩 성공·행정구역 미확정 — 클라이언트가 무매칭 분기로 처리). 본문에 좌표·요청 식별자가 에코되지 않는다.

### region 매칭 규칙 (순수 함수 단위테스트)

AC-6. (Given 보구곶(`loaded=true`)을 포함한 카탈로그) When `matchRegionByAdmin(catalog, {sido:"인천광역시", sigungu:"강화군", emd:"화도면"})`를 호출한다 Then 보구곶 region이 반환된다 (공백 무시 정규화 일치).

AC-7. (Given "준비 중"(`loaded=false`) region "강화읍"을 포함한 카탈로그) When 해당 행정구역으로 `matchRegionByAdmin`을 호출한다 Then 그 `loaded=false` region이 반환된다 (매칭은 적재 여부와 무관 — 클라이언트가 분기② 처리).

AC-8. (Given 카탈로그에 없는 행정구역 `{sido:"서울특별시", sigungu:"종로구", emd:"청운동"}`) When `matchRegionByAdmin`을 호출한다 Then `null`이 반환된다 (무매칭 — 클라이언트가 분기③ 검색 폴백). 시드 region(보구곶)을 폴백으로 반환하지 않는다.

### GPS 동선 — 매칭 3분기 (E2E)

AC-9. (Given 지역 선택 화면 + 역지오코딩이 보구곶 행정구역을 반환하도록 모킹 + geolocation이 좌표를 반환) When 사용자가 "현재 위치로 시작"을 탭한다 Then 추천 카드에 보구곶 region이 제시되고, 이를 탭하면 지도 화면으로 전환되어 보구곶 필지가 렌더된다 (매칭+`loaded=true` → 받기/전환).

AC-10. (Given 역지오코딩이 "준비 중"(`loaded=false`) region 행정구역을 반환하도록 모킹 + 좌표 반환) When "현재 위치로 시작"을 탭한다 Then "준비 중" 안내가 표시되고 지도로 전환되지 않으며 받기가 일어나지 않는다 (매칭+미적재 — 분기②, 슬라이스 3 AC-17 보존).

AC-11. (Given 역지오코딩이 카탈로그에 없는 행정구역을 반환하도록 모킹 + 좌표 반환) When "현재 위치로 시작"을 탭한다 Then "해당 지역이 아직 없어요. 검색으로 골라 주세요" 안내가 표시되고, 보구곶이 추천으로 자동 제시되지 않으며, 검색 경로가 사용 가능하다 (무매칭 — 분기③).

### 권한/에러 분기 — 슬라이스 1 회귀 보존 (E2E)

AC-12. (Given geolocation 권한 거부 또는 미지원으로 모킹) When "현재 위치로 시작"을 탭한다 Then 권한 안내(예: "위치 권한을 확인할 수 없어요. 아래에서 검색해 지역을 골라 주세요.")가 표시되고 앱이 중단되지 않으며 검색으로 지역을 고르는 경로가 계속 사용 가능하다 (슬라이스 1 AC-7 회귀 — 역지오코딩 호출 이전에 권한 분기).

AC-13. (Given geolocation은 좌표를 반환하나 역지오코딩 프록시가 503(키 부재) 또는 502(외부 실패)를 반환하도록 모킹) When "현재 위치로 시작"을 탭한다 Then 역지오코딩 실패 안내가 표시되고 앱이 중단되지 않으며 검색 폴백 경로가 사용 가능하다 (실패는 권한 거부와 동급으로 검색 폴백 수렴, 보구곶 자동 추천 없음).

## 비범위

- **지도 위 실시간 GPS 위치 표시("내 위치" 점·추적)** — 후속 슬라이스로 분리. 로드맵 슬라이스 4의 핵심은 "현재 위치로 시작 = region 자동 선택"이며 지도 내 위치 마커는 별개 가치. (판단: 분리 — 본 슬라이스는 진입 동선만.)
- **카카오 로컬 API 연동** — V-World reverse 채택으로 미사용(키·운영 모델 부채 회피). 후속 다중 소스 폴백 필요 시 별도.
- **시군구 단위 폴백 매칭·근접(최근접 region) 추천** — emd 정확 일치만(절충 2).
- **전국 실 지적도 데이터 적재** — 슬라이스 3 비범위 그대로(보구곶 + 샘플 region 1개로 시연).
- **좌표/행정구역 결과 저장·로깅·분석** — 좌표 민감정보 비저장 원칙(절충 3).
- 작업공간(tabs)·필지 편집·그룹·팔레트·계산기 동작 변경.

## 영향 범위

- 프론트:
  - `src/features/region/useGpsLocate.ts` — 재설계. `getCurrentPosition` 성공 시 좌표를 `src/lib/api.ts`의 역지오코딩 클라이언트로 보내고, 응답을 `matchRegionByAdmin`으로 카탈로그 매칭해 status를 분기. `GpsStatus`를 `'idle' | 'locating' | 'matched-loaded' | 'matched-pending' | 'unmatched' | 'denied' | 'failed'`로 확장(또는 status + 매칭 분기 필드). 카탈로그 주입(`useRegionCatalog` 소비)으로 테스트 용이.
  - 신규 `src/features/region/matchRegion.ts` — `matchRegionByAdmin(catalog, admin)` 순수 함수(공백 정규화 정확 일치, 무매칭 `null`). `regionCatalog.ts`의 정규화 헬퍼 재사용.
  - `src/features/region/RegionSelectView.tsx` — GPS 카드 하위 상태 표시를 매칭 3분기 + 실패/권한 분기로 확장(분기②·③·실패는 안내 텍스트, 분기①은 `RegionRow` 추천 카드 → 기존 `handleActivate` 재사용). 무매칭/실패 시 보구곶 자동 추천 제거.
  - `src/lib/api.ts` — `reverseGeocode(coords)` typed client 메서드 추가(mutate 규약대로 `clientId`·`Authorization` 자동 주입, 503/502/401 에러 매핑).
- 백엔드:
  - 신규 `server/handlers/geocode.ts` — `reverseGeocodeHandler`(POST, `requireUser`, 키 부재 503·외부 실패 502·성공 200). 런타임 비의존 순수 함수.
  - 신규 `server/handlers/vworldGeocode.ts`(또는 `vworld.ts` 확장) — V-World reverse geocode 공용 모듈(전역 `fetch` + 응답 파싱 → `{sido, sigungu, emd}` 매핑, M-13 `fetchLadfrl` 패턴 동형). 핸들러·향후 스크립트 공용. 좌표 비저장·비로깅.
  - `server/routes.ts` — `POST /api/geocode/reverse` 라우트 1건 등록(`geocode`는 신규 리터럴 2세그, 기존 패턴과 충돌 없음).
- DB: **마이그레이션 불필요** (역지오코딩은 외부 프록시 — 좌표·결과 비저장. regions/parcels/user_regions 스키마 무변경).
- API 계약: **신규** — `src/types/api/geocode.ts`:
  - `reverseGeocodeRequestSchema` = `mutationBodySchema`(clientId) + `{ lng: z.number(), lat: z.number() }`(좌표 범위 검증).
  - `reverseGeocodeResponseSchema` = `{ sido: z.string().nullable(), sigungu: z.string().nullable(), emd: z.string().nullable() }`(행정구역 미확정 필드 `null` 허용 — AC-5). 좌표·요청 식별자 미포함.
  - 401/409/502/503은 기존 `errorResponseSchema` 재사용.
- env: 신규 `V_WORLD_GEOCODER`(미설정 시 프록시 503·앱 정상). `V_WORLD_DOMAIN` 재사용. Vercel·로컬 env 문서 갱신.
- 데이터: **무변경** (`parcels.json`·`public/data/regions/` 불변).
