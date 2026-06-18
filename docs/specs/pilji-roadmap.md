# 필지 — 전국 전환 로드맵 (슬라이스 작업 순서)

- 근거: `docs/specs/region-entry.md` §비범위·§후속 메모 + `memory/pivot-pilji-national.md` + Pencil 보드(모바일 `kcXpg`·PC `m6wBu7`)
- 운영: 각 슬라이스 = `/pipeline` 1회(기획→디자인→구현→E2E→검증→배포준비). 위에서 아래로 진행. 완료 시 ✅.
- 원칙: 의존이 앞선 것부터. region 모델은 1→N 비파괴 확장(절충 명세 준수). 기존 지도 코어(M-1~16)는 보존.

---

## ✅ 슬라이스 1 — region-entry (완료, `feat/region-entry` 커밋·미push)
필지 리브랜딩 + 지역 선택 진입 게이트 + 지역칩/관리(열람·전환). 보구곶=유일 적재 region, 나머지 "준비 중". frontend-only.

---

## ✅ 슬라이스 2 — 계정·인증 기반 (완료, `feat/auth-accounts` 커밋·미push)
소셜 로그인(카카오 웹 OAuth) + 세션 + 작업공간 멤버십 컬럼. 로그인을 앱 진입 첫 강제 관문으로 승격(비로그인 시 LoginView만, 로그인 후 region 게이트 작동). `src/features/auth/`·`src/lib/{auth,supabase}.ts`·`src/stores/auth.ts`·`server/handlers/auth.ts`(requireUser 토큰검증 + GET /api/me, 전 mutate 핸들러 인증 게이트) + 마이그레이션 `0003_auth_membership.sql`(nullable created_by·profiles·workspace_members 비파괴, RLS 미도입). Apple·휴대폰·멤버십 UI·네이티브 핸드오프 발신부는 비범위(계약·수신 경로만). 명세 `docs/specs/auth-accounts.md`.

<details><summary>원 계획</summary>

- **무엇**: 소셜 로그인(카카오 등) + 계정 모델 + 세션. 웹뷰+네이티브 토큰 핸드오프는 **설계/계약까지**(네이티브 셸 실구현은 슬라이스 8).
- **왜 먼저**: 대국민·다중 사용자·구독·지역 동기화가 전부 "계정"에 의존. 현재 앱은 공유 작업공간으로 부팅(계정 없음).
- **의존**: 없음(독립 착수 가능). **영향**: 백엔드·DB(users/세션)·API 계약 신설 → frontend+backend 병렬.
- **디자인**: ②로그인 ㊹핸드오프 에러.

</details>

## ✅ 슬라이스 3 — 전국 지적도 데이터 파이프라인 (완료, `feat/national-data` 커밋·미push)
region을 DB 권위로 승격(`regions` 테이블 + `GET /api/regions` 카탈로그) + region별 parcels 적재·조회 + 클라이언트 region 스코프 지도 로딩 + region 받기/제거(`user_regions`). 슬라이스 1의 클라이언트 `regionCatalog.ts`는 폴백/부팅 시드로 격하. 보구곶 + 샘플 region 1개(`gyeonggi-gimpo-daegot`, 합성 데이터셋 `public/data/regions/`)로 메커니즘 시연 — 전국 실데이터 대량 취득은 별도 데이터 운영(범위 밖). `server/handlers/regions.ts`(카탈로그 공개 GET·mine/acquire/remove requireUser)·`scripts/import-parcels.ts`(region_id 백필·`--region/--source`)·`src/features/region/`·`src/stores/regions.ts` + 마이그레이션 `0004_regions.sql`(regions·parcels.region_id FK·user_regions 비파괴, RLS 미도입). 명세 `docs/specs/national-data-pipeline.md`.

<details><summary>원 계획</summary>

- **무엇**: region을 DB 개념으로 승격(region 테이블) + region별 parcels 적재·API + 클라이언트 region별 로딩. region "받기/다운로드/제거" 실제 동작. region-entry의 "준비 중"이 실데이터로 해소.
- **왜**: "전국" 서비스의 핵심 가치. region-entry가 비파괴 확장 가능하게 설계됨(이 슬라이스가 그 확장).
- **의존**: 슬라이스 1(region 추상화). 계정(2)과 독립이나 region 즐겨찾기/동기화는 2 이후 강화. **영향**: 백엔드·DB·API·데이터 적재 스크립트 大 → frontend+backend 병렬.
- **디자인**: ④지역선택 ⑦PC지역선택 ⑪지역관리 ㊶지역검색결과.

</details>

## ✅ 슬라이스 4 — GPS 역지오코딩 (완료, `feat/gps-geocoding` 커밋·미push)
좌표→행정구역 역지오코딩 프록시(V-World reverse geocode) + 결과→region 카탈로그 매칭으로 "현재 위치로 시작"을 실동작화. 슬라이스 1의 "항상 보구곶 추천" 폴백 폐기 — 매칭 region 자동 진입 / 준비 중 안내 / 무매칭 안내 3분기. 백엔드 `server/handlers/vworldGeocode.ts`(공용 fetch 모듈)·`server/handlers/geocode.ts`(`reverseGeocodeHandler` — requireUser 401·키부재 503·외부실패 502·미확정 200 area:null·성공 200 area, **좌표 비저장·비로깅**) + `server/routes.ts` `POST /api/geocode/reverse`. 프론트 `src/features/region/matchRegion.ts`(sido·sigungu·emd 정확일치 순수함수)·`useGpsLocate.ts`(geolocation→geocode→matchRegion 7상태 머신)·`RegionSelectView.tsx` GPS 카드 6상태·`src/lib/api.ts` `api.geocode.reverse`. 계약 `src/types/api/geocode.ts`. **DB·parcels.json·마이그레이션 무변경**. 신규 env `V_WORLD_GEOCODER`(reverse 전용 키 — `V_WORLD_LADFRLLIST`와 분리, 미설정 시 GPS 안내만·앱 정상), `V_WORLD_DOMAIN` 재사용. 시군구 폴백 매칭은 범위 밖. 명세 `docs/specs/gps-geocoding.md`.

<details><summary>원 계획</summary>

- **무엇**: 좌표→행정구역 변환(V-World/카카오 등) → "현재 위치로 시작"이 실제 region 자동 선택. region-entry의 폴백 UI를 실동작으로.
- **의존**: 슬라이스 3(region 데이터가 있어야 "내 위치 region"으로 진입 의미). **영향**: 백엔드(외부 API 프록시)+frontend.
- **디자인**: ③위치권한 ④지역선택 GPS 카드.

</details>

## 슬라이스 5 — 영농 ERP 기능 (PRO 콘텐츠 구축) — sub-슬라이스 분할 진행
큰 덩어리이므로 sub-슬라이스로 분할 진행: **5a 인력·거래처 / 5b 업무일지·일당계산 / 5c 재고 / 5d 캘린더**. **5a~5d 전부 완료 → 다음은 슬라이스 6(freemium 게이팅 + PRO 구독).**

### ✅ 5a — 인력·거래처 마스터 (완료, `feat/erp-staff-contacts` 커밋·미push)
영농 ERP 기반 엔티티(인력·거래처) 마스터 CRUD. **전역 공유 단일 테이블**(`tab_id`/`region_id`/`created_by` 격리 없음 — 로그인 멤버 전원이 같은 목록 공유, 행에 `created_by` 신원만 부착) + 소프트 비활성(`active` 플래그, 하드삭제 없음). NavDrawer "영농 PRO" 앰버 섹션 진입점 — **게이팅 강제 없음**(잠금은 슬라이스 6). 백엔드 `server/handlers/{staff,contacts}.ts`(컬렉션/아이템 핸들러, mutate requireUser·소프트삭제)·`server/routes.ts` 라우트 8개·`server/handlers/ids.ts`(genStaffId·genContactId). 프론트 `src/features/erp/`(StaffView·StaffSheet·ContactsView·ContactSheet)·`src/stores/erp.ts`(낙관 CRUD)·`src/lib/api.ts`(staff·contacts 메서드)·`src/stores/ui.ts`(뷰 열림)·`src/App.tsx` 배선·`src/styles/tokens.css`(`--color-pro`·`--color-pro-soft` 앰버 토큰). 계약 `src/types/api/{staff,contacts}.ts`. 마이그레이션 `0005_erp_staff_contacts.sql`(staff·contacts 신규·비파괴, contacts kind CHECK buy|sell|both, RLS 미도입 — 0003 auth.users FK 의존, 0004 region과 독립). **PRO 게이팅·5b~5d 외래참조는 비범위**(이번 슬라이스는 마스터 CRUD까지). 명세 `docs/specs/erp-staff-contacts.md`.

### ✅ 5b — 업무일지·일당계산 (완료, `feat/erp-worklog` 커밋·미push)
날짜별 업무일지 + 투입 인력별 일당·근무율 인건비 자동 산정. 5a 결정값 승계(전역 공유·Realtime 비범위·PRO 게이팅 강제 없음). **2테이블**: `work_logs`(헤더 — 작업일·제목·메모) + `work_log_workers`(투입 인력 조인 — `staff_id` 참조 + `staff_name_snapshot`·`applied_wage`·`work_ratio` 스냅샷). 일당계산은 **공유 순수 모듈 `src/utils/workLogCost.ts`(computeWorkerCost·computeLogTotal)** 단일 권위 — 클라 미리보기와 서버 `totalCost`가 동일 함수 사용, 서버가 응답 `totalCost`를 권위 산정. 삭제는 **하드 삭제**(5a 소프트 비활성과 대비 — `work_log_workers`는 `log_id ON DELETE CASCADE`, `staff_id ON DELETE SET NULL`). 백엔드 `server/handlers/workLogs.ts`(컬렉션 GET/POST·아이템 PATCH/DELETE, mutate requireUser)·`server/routes.ts` 라우트 4개·`server/handlers/ids.ts`(genWorkLogId·genWorkLogEntryId). 프론트 `src/features/erp/worklog/`(WorkLogView·WorkLogSheet·WorkerLineRow·StaffPickerSheet·draft.ts)·`src/stores/worklog.ts`(낙관 CRUD)·`src/lib/api.ts`(workLogs 메서드)·`src/features/tab/NavDrawer.tsx`(PRO 업무일지 진입점)·`src/stores/ui.ts`·`src/App.tsx`(뷰 배선). 계약 `src/types/api/workLogs.ts`. 마이그레이션 `0006_erp_work_logs.sql`(work_logs·work_log_workers 신규·비파괴, 전역 공유·RLS OFF, work_date DESC 인덱스 — 0005 staff 참조·0003 auth.users 의존). **재고·캘린더 연결(5c·5d), M-10 자동 계산기와의 통합은 비범위**(독립 도메인). 운영 적용(`supabase db push 0006`·push·배포)은 사용자 몫. 명세 `docs/specs/erp-worklog.md`.

### ✅ 5c — 재고 (완료, `feat/erp-inventory` 커밋·미push)
품목 마스터 + 입·출고 거래 원장으로 현재고 추적. 5a·5b 결정값 승계(전역 공유·Realtime 비범위·PRO 게이팅 강제 없음·`requireUser` mutate 게이트·RLS OFF). **2테이블**: `inventory_items`(품목 마스터 — 이름·단위·분류·메모·`active` 소프트 비활성) + `inventory_transactions`(입·출고 거래 원장 — **append-only**, `type` CHECK in/out·`quantity>0`·`txn_date`·`item_id`/`contact_id` ON DELETE SET NULL + `item_name_snapshot`·`unit_snapshot`·`contact_name_snapshot`·`unit_price`·`amount` 작성 시점 스냅샷). **현재고는 별도 컬럼 없이 거래 합산 파생** — 공유 순수 모듈 `src/utils/stockBalance.ts`(computeItemBalance·computeBalances) 단일 권위, 클라 미리보기와 서버가 동일 함수 사용(음수 허용). 삭제: 품목=소프트 비활성, 거래=하드 삭제(삭제 시 현재고 자동 재계산). 거래는 생성·삭제만(PATCH 미제공 — 정정은 삭제 후 재생성). 백엔드 `server/handlers/{inventoryItems,inventoryTransactions}.ts`(컬렉션 GET/POST·아이템 PATCH/DELETE·거래 DELETE only, 거래 생성 시 마스터에서 스냅샷·`amount=round(quantity×unitPrice)` 채움, mutate requireUser)·`server/routes.ts` 라우트 6개(`/api/inventory/items`·`/api/inventory/transactions` — matchRoute 세그먼트 수로 컬렉션/아이템 구분)·`server/handlers/ids.ts`(genInventoryItemId·genInventoryTxnId). 프론트 `src/features/erp/inventory/`(InventoryView·InventoryItemSheet·StockTransactionSheet·ContactPickerSheet·TransactionHistory·format.ts)·`src/stores/inventory.ts`(낙관 CRUD·현재고 파생)·`src/lib/api.ts`(inventoryItems·stockTransactions 메서드)·`src/features/tab/NavDrawer.tsx`(PRO 재고 진입점)·`src/stores/ui.ts`·`src/App.tsx`(뷰 배선). 계약 `src/types/api/{inventoryItems,inventoryTransactions}.ts`. 마이그레이션 `0007_erp_inventory.sql`(신규·비파괴, 전역 공유·RLS OFF — 0005 contacts 참조·0003 auth.users 의존). 게이트 green(lint·typecheck 0, 단위 582·통합 inventory 24·E2E 102). **PRO 게이팅·재고 평가액·다품목 전표·필지 연결·캘린더(5d)는 비범위.** 운영 적용(`supabase db push 0007`·push·PR·머지·배포)은 사용자 몫. 명세 `docs/specs/erp-inventory.md`.

### ✅ 5d — 캘린더 (완료, `feat/erp-calendar` 커밋·미push)
기존 5b 업무일지(`work_logs`)·5c 거래(`inventory_transactions`)의 날짜 데이터를 월/일 달력에 집계·조망하는 **A안 집계 뷰 전용 frontend-only 슬라이스**(신규 DB·엔티티·핸들러·계약 0 — 기존 `workLogs.list`·`stockTransactions.list` from/to 필터 재사용). 5a~5c 결정값 승계(전역 공유·Realtime 비범위·PRO 게이팅 강제 없음·`created_by` 신원·RLS OFF). **집계는 클라 전용 순수 함수** `src/features/erp/calendar/aggregate.ts`(groupByDate·summarizeDay·monthRange·buildMonthGrid) 단일 권위 — Vitest 단위 1:1(18케이스). **날짜 경계: `work_date`·`txn_date` YYYY-MM-DD 로컬 문자열을 셀 키로 직접 비교**(`new Date("YYYY-MM-DD")` UTC 파싱 하루밀림 함정 회피, 월 그리드 산술만 로컬 Date). 프론트 `src/features/erp/calendar/`(aggregate.ts·format.ts·DayCell·MonthGrid·DayDetailSheet·CalendarView)·`src/stores/ui.ts`(`calendarViewOpen`·open/close)·`src/features/tab/NavDrawer.tsx`(영농 PRO 앰버 섹션 캘린더 진입점)·`src/App.tsx`(뷰 배선). 드릴인은 5b `WorkLogSheet`/5c 재고 뷰 **재사용**(새 편집 UI 없음) — **반려 1회 해소(B-1): 드릴인 시 `closeCalendarView`→대상 PRO 뷰 열기 상호배타로 z-stack 가림 방지**. 게이트 green(typecheck 0·lint 0·단위 600·E2E 110, 거래 드릴인 가림 회귀 E2E 포함). **백엔드·DB·마이그레이션·API 계약 무변경**(frontend-only). **(B) 일정 엔티티(`calendar_events`)·주/연 뷰·반복·알림은 비범위.** 운영 적용(push·PR·머지·배포)은 사용자 몫(슬라이스 2~5c 선행 전제 승계 — 카카오·V_WORLD_GEOCODER·0003~0007). 명세 `docs/specs/erp-calendar.md`.

<details><summary>원 계획</summary>

- **무엇**: 업무일지·인력·거래처·재고·캘린더 실제 구현(현재 디자인만). 큰 덩어리 → sub-슬라이스로 분할 권장(5a 인력·거래처 / 5b 업무일지·일당계산 / 5c 재고 / 5d 캘린더).
- **왜 수익화보다 먼저**: 팔 PRO 콘텐츠가 있어야 게이팅·구독이 의미. 자동 계산기·V-World 토지정보는 기존 구현분 — PRO 귀속 여부는 슬라이스 6에서 확정.
- **의존**: 계정(2, 멤버 협업). **영향**: 백엔드·DB·API 大 → frontend+backend 병렬, sub-슬라이스마다 /pipeline.
- **디자인**: PC ③인력 ⑦거래처 ⑧재고 ⑩업무 ⑫캘린더 등 + 모바일 대응.

</details>

## 슬라이스 6 — freemium 게이팅 + PRO 구독
- **무엇**: 무료/PRO 권한 게이팅(PRO 탭 잠금·페이월) + 구독(요금제·결제·구독관리) + IAP/웹결제 채널.
- **의존**: 슬라이스 5(팔 기능) + 슬라이스 2(계정). **영향**: 백엔드·DB(구독 상태)·API + 결제 연동(IAP 결정 필요) → frontend+backend.
- **디자인**: ⑦페이월 ⑧요금제 ㊷구독완료 ㊸구독관리 + 잠금 배지(탭바·더보기).

## 슬라이스 7 — 부가 (알림·서포팅)
- **무엇**: 알림 센터 실데이터, 지역 검색 결과 실연동 마감, 빈/로딩/에러 상태 정리.
- **의존**: 2·3·5(알림 소스). **영향**: 백엔드(알림)+frontend.
- **디자인**: ㊵알림 센터 + PC ㊹알림.

## 슬라이스 8 — 앱 패키징
- **무엇**: PWA(매니페스트·서비스워커) → Capacitor 웹뷰 셸 + 네이티브 로그인 토큰 핸드오프 실구현 + 스토어 등록.
- **의존**: 슬라이스 2(로그인 핸드오프 계약). **영향**: 빌드·네이티브 셸(코드베이스 외부 작업 포함).
- **디자인**: ①스플래시·토큰핸드오프 ②로그인 ㊹핸드오프 에러.

---

## 권장 진행 순서
**2(계정) → 3(전국 데이터) → 4(GPS) → 5(영농 ERP, sub분할) → 6(구독) → 7(부가) → 8(패키징)**

조정 포인트(사용자 결정):
- **수익화 시점**: 6을 5 직후가 아니라 더 앞당기려면 5의 일부(예: 5a)만 만들고 6을 끼울 수 있음.
- **계정(2) vs 전국 데이터(3) 선후**: 둘 다 독립 착수 가능. "전국 지도가 먼저 보이는 것"이 우선이면 3을 먼저.
- **IAP vs 외부 웹결제**: 슬라이스 6 착수 전 결제 채널 비즈니스 결정 필요.
