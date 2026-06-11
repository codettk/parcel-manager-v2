# Realtime 동기화 + 에코 가드 (lib/realtime.ts)

- 상태: 검토 대기
- 매핑: M-6
- 판정: 보존 + 재설계 (v1 `app.jsx:583-673`에서 검증된 **에코 가드 의미론**(updated_by ≠ 자기 clientId만 반영)·**이벤트→상태 반영 의미론**(행 매핑, DELETE 시 pinned 보호)은 보존. 재설계 4건 — ① 채널 3→4개(+tabs), ② 탭 스코프 채널의 `tab_id` 필터 + activeTabId 변경 시 재구독, ③ 연결 상태 머신(v1은 console.log뿐), ④ App 이펙트 인라인 → `lib/realtime.ts` 모듈 분리. v1 colors 채널의 에코 가드 부재(app.jsx:628 — 자기 변경도 재적용)는 **결함으로 판정**하고 v2에서 가드 적용)

## 사용자 스토리

1. 공동체 사용자는 다른 기기에서 색칠·그룹·팔레트·탭이 변경되면 새로고침 없이 자기 화면에 반영된 것을 본다.
2. 공동체 사용자는 자기가 방금 한 변경이 Realtime 에코로 되돌아와도 화면이 깜빡이거나 입력 중 상태를 덮어쓰지 않는다 (에코 가드).
3. 개발자(M-7+ 시트, M-16 탭)는 연결 상태(`realtimeStatus`)를 스토어에서 읽기만 하면 된다 — 표시 UI는 본 건이 아니다.

## 사전 결정 — colors DELETE 에코 가드 방식

**`REPLICA IDENTITY FULL` 채택** (phase3-db-api.md "다르게 설계한 부분" 6번의 이연 결정을 본 건에서 확정):

- `color_labels`에 `ALTER TABLE color_labels REPLICA IDENTITY FULL;` — DELETE 이벤트의 `old` 레코드에 `updated_by`가 직접 포함되어 다른 채널과 동일한 단일 비교식으로 가드한다.
- 근거: ① 대안인 "선행 자기 UPDATE → 후속 DELETE" 클라이언트 상관 로직은 이벤트 순서·시간창 가정을 심는다(검증 곤란) — FULL이면 클라이언트는 단일 비교식 그대로. ② color_labels는 ~수 행짜리 소형 테이블 — FULL의 WAL 오버헤드 무시 가능.
- **핸들러의 선행 UPDATE는 유지한다** (3단계 구현 중 보정 — 초안은 "제거 가능"이었으나 오류): FULL만으로는 `old.updated_by`가 **마지막 PUT 클라이언트**라서, 마지막 수정자 A가 B의 삭제를 자기 에코로 오인해 무시한다(A 화면에 삭제된 색 잔존). 선행 UPDATE가 `old.updated_by`를 **삭제 요청자**로 만들어야 에코 가드 의미론("자기 변경만 무시")이 성립한다. 비용은 타 클라이언트의 멱등 refetch 1회를 유발하는 UPDATE 이벤트 1건뿐.
- 적용 방식: 프로덕션 미배포이므로 `0001_v2_schema.sql` 직접 수정 (마이그레이션 파일 추가 없음). 통합 테스트에 "old 레코드의 updated_by = 삭제 요청자" 회귀 가드 추가.
- `parcel_settings`·`parcel_groups`·`tabs`는 FULL 불필요: settings는 복합 PK(`tab_id, parcel_local_id`)가 기본 replica identity에 포함되고, groups의 `group_id`는 전역 유일이라 키 삭제가 자연히 탭 스코프이며, tabs는 소프트 클로즈(UPDATE)만 있어 하드 DELETE 이벤트 자체가 없다.

## 동작 명세

### 모듈 구조 — `src/lib/realtime.ts`

- `createRealtimeSync(deps)` — 순수 팩토리. supabase 클라이언트·스토어 접근자·`getClientId`를 주입받아 단위 테스트 가능하게 한다. React 미사용.
- `initRealtime()` — 편의 진입점: `api.config.get()` → `supabaseUrl`/`supabaseAnonKey` 둘 다 있으면 `createClient` 후 시작, 하나라도 없으면 시작하지 않고 상태 `disabled` 유지 (E2E mockApi 환경의 정상 경로).
- 부팅 시퀀스 확장: `boot()` 성공 후 App 이펙트에서 `initRealtime()` 1회 호출. boot 실패 시 미기동.

### 채널 구성 (4개, 모두 `postgres_changes` event `*`, schema `public`)

| 채널                      | 테이블            | 필터                    | 스코프           |
| ------------------------- | ----------------- | ----------------------- | ---------------- |
| `parcel_settings_changes` | `parcel_settings` | `tab_id=eq.<activeTab>` | 탭 — 재구독 대상 |
| `parcel_groups_changes`   | `parcel_groups`   | `tab_id=eq.<activeTab>` | 탭 — 재구독 대상 |
| `tabs_changes`            | `tabs`            | 없음                    | 전역 — 상시 구독 |
| `color_labels_changes`    | `color_labels`    | 없음                    | 전역 — 상시 구독 |

주의: Supabase Realtime의 필터는 **DELETE 이벤트에 적용되지 않는다** (old 레코드 기준 필터 불가) — DELETE는 테이블 전체에서 수신되므로 수신측에서 `old.tab_id` 검사로 보완한다 (아래 매핑 참조).

### 에코 가드 (v1 보존 + colors 확장)

모든 이벤트에서 행의 `updated_by === getClientId()`이면 무시. 비교 지점:

- INSERT/UPDATE: `payload.new.updated_by` (4테이블 공통 — v1 app.jsx:593·650 보존, colors는 v2에서 신규 적용)
- color_labels DELETE: `payload.old.updated_by` (REPLICA IDENTITY FULL로 가능)
- parcel_settings·parcel_groups DELETE: `old`에 updated_by 없음 → 가드 없이 적용. 키 삭제는 멱등이라 자기 에코가 와도 무해 (v1 동작 보존)

### 수신 payload → applyRemote\* 매핑

snake_case 행 → camelCase 변환은 **realtime.ts의 책임**. 행 형태를 모듈 내부 zod 스키마(snake_case)로 `safeParse`하고, 실패 시 해당 이벤트 무시 + DEV `console.error` (API 계약 `src/types/api/`는 변경하지 않는다 — 행 스키마는 DB 표현이지 API 계약이 아님).

| 이벤트                                     | 반영                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| parcel_settings INSERT/UPDATE              | 행 → `ParcelOverride`(`normalizeOverride` 재사용). `isClearedOverride`면 `applyRemoteParcel(id, null)`, 아니면 값 반영                                                              |
| parcel_settings DELETE                     | `old.tab_id !== activeTabId`면 무시(필터 미적용 보완). 현재 override가 `pinned`면 보존(v1 app.jsx:597 고정 보호), 아니면 `applyRemoteParcel(id, null)`                              |
| parcel_groups INSERT/UPDATE                | 행 → `Group`(parcel_ids → parcelIds 등) → `applyRemoteGroup(groupId, group)`                                                                                                        |
| parcel_groups DELETE                       | `applyRemoteGroup(old.group_id, null)` — 타 탭 group_id는 현재 상태에 키가 없어 자연 no-op                                                                                          |
| tabs INSERT/UPDATE (비에코)                | `api.tabs.list()` 1회 refetch → `applyRemoteTabs(tabs)`. 결과에 `activeTabId`가 없으면(다른 기기가 내 활성 탭을 닫음) `setActiveTab(tabs[0].tabId)` 폴백 — C-1 의미론의 런타임 확장 |
| color_labels INSERT/UPDATE/DELETE (비에코) | `api.colors.list()` 1회 refetch → `applyRemoteColors(colorLabels)`                                                                                                                  |

tabs·colors를 행 병합이 아닌 **목록 refetch로 재설계**한 근거: `applyRemoteTabs/Colors` 시그니처가 목록 교체(M-5 확정)이고, 저빈도·소형 목록이라 refetch가 sort_order 정렬·이벤트 순서 역전 문제를 원천 제거한다 (v1의 행 병합 로직 폐기).

### 탭 전환 재구독

- realtime.ts가 workspace 스토어를 `subscribe`로 관찰 — `activeTabId` 변경 시 탭 스코프 채널 2개를 `removeChannel` 후 새 필터로 재생성·재구독한다 (supabase-js는 기존 채널의 필터 변경 불가). `setActiveTab`은 realtime을 모른다 (결합 없음 — M-16 탭 UI도 setActiveTab만 호출하면 됨).
- 재구독 중 도착 못 한 변경은 `setActiveTab`의 `api.tabState.get` 전체 로드가 흡수한다 (별도 처리 없음).
- tabs·colors 채널은 재구독하지 않는다.

### 연결 상태 머신

- 위치 판정: **`stores/ui.ts`** — `realtimeStatus: 'disabled' | 'connecting' | 'subscribed' | 'error'` + `setRealtimeStatus` 액션. 서버 동기화 데이터가 아닌 클라이언트 연결 메타이므로 ui 스토어 소관 (`isInitializing`과 동급). 별도 스토어는 과분리로 기각.
- `disabled`는 명세서 3상태(connecting/subscribed/error)에 추가 — config에 supabase 키가 없는 환경(E2E mockApi, 로컬 미설정)을 에러와 구분하기 위함.
- 전이: 초기 `disabled` → 시작 시 `connecting` → 4채널 모두 `SUBSCRIBED` 시 `subscribed` → 어느 채널이든 `CHANNEL_ERROR`/`TIMED_OUT` 시 `error` → 재구독(탭 전환 포함)·자동 재연결 진행 중 `connecting` → 전 채널 복귀 시 `subscribed`. 상태 표시 UI는 비범위 — 상태만 노출.

## 수용 기준 (AC)

AC-1. Given activeTabId가 `tab_a`로 부팅 완료된 스토어와 채널 생성을 기록하는 모킹 supabase 클라이언트, When 동기화를 시작하면, Then 채널 4개가 생성되고 — `parcel_settings`·`parcel_groups`는 `tab_id=eq.tab_a` 필터로, `tabs`·`color_labels`는 무필터로 — 각각 `postgres_changes` event `*`를 구독한다 (Vitest).

AC-2. Given 구독된 상태, When `updated_by`가 자기 `getClientId()`와 같은 INSERT/UPDATE payload가 4개 테이블 각각에 도착하면, Then 해당 `applyRemote*`가 호출되지 않고 tabs/colors refetch도 발생하지 않는다 (Vitest — 에코 가드).

AC-3. Given 구독된 상태, When 타 클라이언트의 `parcel_settings` INSERT/UPDATE payload(snake_case 행)가 도착하면, Then camelCase `ParcelOverride`로 변환되어 `applyRemoteParcel`에 전달되고, 모든 의미 필드 null + pinned=false 행이면 `null`(키 삭제)로 전달된다 (Vitest).

AC-4. Given 현재 탭 overrides에 pinned 필지 X와 일반 필지 Y가 있는 상태, When `parcel_settings` DELETE payload가 도착하면, Then `old.tab_id`가 activeTabId와 다르면 무시되고, Y는 `applyRemoteParcel(Y, null)`로 삭제되며, X(pinned)는 보존된다 (Vitest — v1 고정 보호 + DELETE 필터 미적용 보완).

AC-5. Given 구독된 상태, When 타 클라이언트의 `parcel_groups` INSERT/UPDATE payload가 도착하면 `Group`(parcelIds 포함)으로 변환되어 `applyRemoteGroup`에 전달되고, DELETE payload가 도착하면 `applyRemoteGroup(old.group_id, null)`이 호출된다 (Vitest).

AC-6. Given 구독된 상태와 모킹된 `api.tabs.list`/`api.colors.list`, When 타 클라이언트의 `tabs` 또는 `color_labels` 이벤트가 도착하면, Then 해당 목록 API가 정확히 1회 호출되고 그 결과로 `applyRemoteTabs`/`applyRemoteColors`가 호출된다 (Vitest).

AC-7. Given `old`에 `updated_by`가 포함된 `color_labels` DELETE payload, When `updated_by`가 자기 clientId면 무시되고 타 클라이언트면 colors refetch가 발생한다 (Vitest). And `supabase db reset` 후 `pg_class.relreplident`가 `color_labels`에서 `f`(FULL)이다 (통합 테스트 — REPLICA IDENTITY FULL 채택 검증).

AC-8. Given activeTabId가 `tab_a`인 상태, When tabs 이벤트 후 refetch 결과에 `tab_a`가 없으면, Then `setActiveTab`이 결과 목록의 첫 탭으로 호출된다 (Vitest — 활성 탭 원격 닫힘 폴백).

AC-9. Given 구독된 상태, When activeTabId가 `tab_a`→`tab_b`로 변경되면, Then 탭 스코프 채널 2개가 `removeChannel`된 뒤 `tab_id=eq.tab_b` 필터로 재구독되고, `tabs`·`color_labels` 채널은 제거되지 않는다 (Vitest).

AC-10. Given ui 스토어, Then `realtimeStatus`가 초기 `disabled`이고, 시작 시 `connecting`, 4채널 모두 SUBSCRIBED 시 `subscribed`, 임의 채널 CHANNEL_ERROR 또는 TIMED_OUT 시 `error`, 재구독 진행 중 `connecting`으로 전이한다 (Vitest — 상태 머신 전수).

AC-11. Given supabase 키가 없는 config를 포함한 mockApi 환경(`tests/e2e/helpers/mockApi.ts`), When 앱이 부팅되면, Then 지도가 정상 렌더되고 페이지 콘솔 에러가 0건이다 (Playwright — realtime 도입이 모킹 환경을 깨지 않는 회귀 가드. 실 Supabase 연결 E2E는 Phase 5로 이연 — 본 건 게이트는 단위 테스트가 담당).

## 비범위

- 시트 UI(M-7+), 탭 UI·TabBar(M-16 — 본 건은 재구독 의미론까지만)
- 연결 상태 **표시** UI — `realtimeStatus` 노출까지만, 배지/토스트는 추후
- 오프라인 큐·재전송·충돌 해소 (v1에도 없음)
- 실 Supabase 인스턴스 대상 Realtime E2E (Phase 5 이연)
- presence·broadcast 채널 (postgres_changes만)

## 영향 범위

- 프론트: `src/lib/realtime.ts` 신규, `src/stores/ui.ts`(`realtimeStatus` + 액션 추가), App 부팅 이펙트에 `initRealtime()` 연결. `src/stores/workspace.ts`는 변경 없음(기존 `applyRemote*`·`setActiveTab` 재사용)
- 백엔드: `server/handlers/colors.ts` DELETE의 선행 UPDATE 블록 **유지** (FULL과 조합 — 위 결정 보정 참조, 주석만 갱신) + 통합 테스트에 삭제 요청자 검증 추가. 그 외 핸들러 변경 없음
- DB: `supabase/migrations/0001_v2_schema.sql`에 `ALTER TABLE color_labels REPLICA IDENTITY FULL;` 추가 (프로덕션 미배포 — 직접 수정, 신규 마이그레이션 없음)
- API 계약: 없음 (행 스키마는 realtime.ts 내부 zod — `src/types/api/` 무변경)
- 디자인: ui-designer 불요 (UI 없음)
