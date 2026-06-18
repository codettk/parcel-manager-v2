# 영농 ERP — 캘린더 (슬라이스 5d)

- 상태: 구현 완료 (게이트 green, A안 — 집계 뷰 전용. `feat/erp-calendar` 커밋·미push)
- 매핑: 신규 (필지 전국 전환 로드맵 슬라이스 5 영농 ERP의 네 번째이자 마지막 sub-슬라이스 5d — `docs/specs/pilji-roadmap.md`. M-1~M-18 매핑표 밖)
- 판정:
  - **캘린더 도메인**: 신규. **권고 디폴트 = (A) 집계 뷰 전용** — 신규 DB·엔티티·핸들러 없이 기존 5b 업무일지(`work_logs`)·5c 거래(`inventory_transactions`)의 날짜 데이터를 월/일 달력에 집계·조망하는 **frontend-only 슬라이스**. (B) 일정 엔티티 추가는 아래 절충 1에 비용·가치를 제시하고 사용자가 고를 수 있게 둔다.
  - **5b 업무일지·5c 재고**: 보존 (이번 슬라이스는 두 도메인의 list API·계약·스토어를 **읽기 전용으로 소비**만 한다 — 5b·5c 스키마·핸들러·계약·스토어 무변경).
  - **5a 인력·거래처**: 무관 (캘린더는 5a를 직접 읽지 않는다 — 5b/5c 항목에 박힌 스냅샷 텍스트로 충분).
  - **지도 코어·시트 컨테이너·인증·Realtime(M-1~16, 슬라이스 1~4)·M-10 자동 계산기**: 보존 (NavDrawer PRO 섹션 진입점 + 신규 뷰/유틸만 추가, 기존 경로 무변경).

## 배경 / 절충 (반드시 후속 단계가 인지 — 특히 A vs B는 사용자 승인 대상)

이 슬라이스는 영농 ERP(슬라이스 5)의 마지막 기능 — **캘린더**다. 로드맵은 5d를 "작업일 집계 뷰 후보 — 5b 업무일지·5c 거래 날짜 기반"으로 정의한다(`pilji-roadmap.md` §슬라이스 5). 5a~5c가 확정한 5개 결정값(전역 공유·Realtime 비범위·PRO 게이팅 비범위·`created_by` 신원·RLS OFF)을 그대로 승계하고, 5d 고유의 설계 난제를 아래 확정값으로 못박는다.

### 절충 0 — 5a~5c 결정값 승계 (재논의 없음)

| 결정          | 값                                                | 5d 적용                                                                          |
| ------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| 소유/공유     | 전역 공유 (`created_by` 신원만, 격리 없음)        | 캘린더가 보는 5b·5c 데이터도 전역 공유 — 멤버 전원이 같은 달력을 본다             |
| Realtime      | 비범위 (단발 fetch + 낙관)                        | 달력도 뷰 진입/월 이동 시 fetch. 다른 멤버 변경은 재진입(재조회) 시 반영          |
| PRO 게이팅    | 진입점만 PRO 섹션, 잠금 강제 없음                 | NavDrawer 영농 PRO 앰버 섹션에 "캘린더" 항목 추가, 게이팅 강제 없음(슬라이스 6)   |
| RLS           | 미도입                                            | (A) 신규 테이블 없음 → 해당 없음 / (B) 신규 테이블도 RLS OFF + mutate requireUser |

### 절충 1 — 캘린더의 본질: 집계 뷰(A) vs 일정 엔티티(B) → **권고 디폴트: (A) 집계 뷰 전용. 사용자 승인 대상**

| 항목      | (A) 집계 뷰 전용 — **권고**                                                                  | (B) 일정 엔티티 추가                                                       |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 핵심      | 기존 5b·5c의 **이미 일어난** 날짜 데이터를 달력에 집계·조망                                  | 미래 **계획**(파종/방제/수확 예정)·리마인더를 적는 신규 엔티티 + 달력 표시 |
| DB        | **무변경** (신규 테이블 0)                                                                   | 신규 `calendar_events` 테이블 + 마이그레이션 `0008_*`                      |
| 백엔드    | **무변경** (기존 `GET /api/work-logs?from&to`·`GET /api/inventory/transactions?from&to` 재사용) | 신규 핸들러 CRUD + 라우트 4개 + ids + 통합테스트                           |
| 프론트    | 신규 뷰 + 집계 순수 유틸 + 진입점                                                            | (A) 전부 + 일정 작성/수정 시트 + 일정 스토어                              |
| 계약      | **무변경** (기존 계약 소비)                                                                  | 신규 `src/types/api/calendarEvents.ts`                                    |
| 슬라이스 비용 | **작음** (frontend-only, 1 파이프라인 빠르게)                                            | 큼 (frontend+backend 병렬, 5b/5c 규모)                                    |
| 가치      | "지난 6/12에 무슨 작업·입출고가 있었나"를 달력으로 빠르게 회고·정산 보조                     | "다음 주 방제 예정" 같은 영농 계획·할 일 관리 (알림은 슬라이스 7)          |

**권고 = (A)**. 근거:

1. 로드맵 표현이 "**작업일 집계 뷰**"로, 신규 엔티티가 아니라 5b·5c 날짜 데이터의 조망을 가리킨다.
2. ERP를 빨리 슬라이스 6(구독)으로 잇기 위해, PRO 콘텐츠(5a~5c)는 이미 충분하고 5d는 그것을 묶어 보여주는 가벼운 마감 슬라이스가 흐름에 맞다.
3. (B)의 계획·할 일 기능은 가치가 있으나, 알림(슬라이스 7) 없이는 "리마인더"가 반쪽이고 일정 엔티티만 추가하면 과설계 위험. (B)는 후속 슬라이스(예: 7 이후 "영농 일정·할 일")로 분리하는 비파괴 확장 경로가 깔끔하다.

→ **이 명세의 본문 AC는 (A)를 디폴트로 작성**한다. 사용자가 (B)를 원하면 절충 1 하단의 (B) 추가 범위·AC를 활성화한다(아래 "## (B) 채택 시 추가 범위" 참조 — 디폴트는 비범위).

### 절충 2 — (A) 백엔드 필요성 → **확정: 신규 엔드포인트·DB 0. 기존 list API 재사용**

- 캘린더는 월 단위로 `GET /api/work-logs?from&to`·`GET /api/inventory/transactions?from&to`를 호출해(월 첫날~말일) 그 달의 업무일지·거래를 받고, **클라이언트 순수 함수가 날짜별로 그룹·카운트·합계**한다.
- 월 단위 집계 전용 서버 엔드포인트는 **만들지 않는다**(농장 단위 데이터량이 작아 클라 집계로 충분, 신규 백엔드 면적 0이 슬라이스를 가볍게 함, 기존 from/to 필터가 이미 구현·검증됨 — `src/lib/api.ts` `workLogs.list`·`stockTransactions.list` 확인).
- 집계 순수 함수는 `src/features/erp/calendar/aggregate.ts`(React 비의존)에 두고 Vitest 단위 테스트 1:1. (5b `workLogCost.ts`·5c `stockBalance.ts` 공유 순수 모듈 선례. 단 캘린더 집계는 클라 전용이라 `src/utils/`가 아닌 feature 내부에 둔다 — 서버가 쓰지 않음.)

### 절충 3 — 날짜 경계/타임존 → **확정: 문자열 날짜(YYYY-MM-DD) 기준 그룹. UTC 변환 금지**

- 5b `work_date`·5c `txn_date`는 모두 **`YYYY-MM-DD` 문자열(로컬 날짜)**이다(계약 `workDateSchema`·`txnDateSchema` regex 확인).
- 달력 셀 매핑은 **문자열 키 그대로** 비교·그룹한다. `new Date("2026-06-12")`로 파싱 후 `getDate()` 등으로 다시 추출하는 경로는 **금지**(`new Date("YYYY-MM-DD")`가 UTC 자정으로 해석돼 음수 UTC 오프셋(한국은 +09라 무해하나 방어)·DST·환경별 편차로 하루 밀림 함정). 항목의 `workDate`/`txnDate` 문자열을 그날 셀의 키로 직접 사용한다.
- 월 그리드 자체(어떤 날짜 셀들을 그릴지)는 표시용 계산이므로 로컬 `Date` 산술을 쓰되, **항목→셀 매핑은 문자열 동등 비교만** 사용한다. 월 범위 쿼리의 `from`/`to`도 문자열로 조립(`${year}-${mm}-01` ~ 그 달 말일 `${year}-${mm}-${lastDay}`).

### 절충 4 — 달력 UI 범위 → **확정: 월 뷰 + 일(날짜) 상세 + 월 이동까지. 주/연 뷰·반복·외부 연동 비범위**

- **월 뷰**: 7×N 그리드. 각 날짜 셀에 그날의 활동 마커(업무일지 유무·거래 유무를 색/점/카운트로 구분 — 디자이너 확정). 오늘 셀 강조. 항목 있는 날만 마킹, 빈 날은 마킹 없음.
- **월 이동**: 이전 달/다음 달 이동 + "오늘로" 복귀. 월 이동 시 그 달 범위로 재조회.
- **일(날짜) 상세**: 날짜 셀 탭 시 그날의 업무일지 목록(제목·인건비 합계)과 입출고 거래 목록(입고/출고·품목명·수량·금액)을 모아 패널/시트로 표시.
- **드릴인**: 일 상세의 업무일지 항목 탭 → 기존 5b `WorkLogSheet`(수정), 거래 항목 탭 → 기존 5c 거래 이력/품목(읽기). 캘린더는 5b/5c 뷰·시트를 **재사용**하며 새 편집 UI를 만들지 않는다(드릴인 경로 구현 단계 결정 — 최소한 해당 5b/5c 뷰로 이동). **반려 1회 해소(B-1)**: 드릴인 시 캘린더 뷰를 닫고(`closeCalendarView`) 대상 PRO 뷰를 여는 상호배타 전이로 z-stack 가림 방지.
- **비범위**: 주 뷰·연 뷰·반복 일정·외부 캘린더(구글/iCal) 연동·드래그 일정 이동.

### 절충 5 — M-10 자동 계산기·5a~5c와의 구분 (혼동 방지)

| 항목      | M-10 계산기   | 5b 일당계산        | 5c 재고            | 5d 캘린더 (이 슬라이스)                  |
| --------- | ------------- | ------------------ | ------------------ | ---------------------------------------- |
| 저장소    | app_config    | work_logs(+workers)| inventory_*        | **없음 (기존 5b·5c 읽기 전용 소비)**     |
| 진입      | 지도 필지 탭  | PRO "업무일지"     | PRO "재고"         | PRO "캘린더"                             |
| 순수 함수 | `calc.ts`     | `workLogCost.ts`   | `stockBalance.ts`  | `calendar/aggregate.ts` (클라 전용)      |
| 신규 DB   | 없음          | 2테이블            | 2테이블            | **없음 ((A) 권고)**                      |

→ 캘린더는 5b·5c의 **계약·스토어를 import해 읽기만** 한다(`useWorkLogStore`·`useInventoryStore` 또는 전용 월 fetch). 5b·5c는 캘린더를 모른다. 양방향 import 없음.

## 사용자 스토리

1. 영농 사용자로서, 한 달 달력에서 "어느 날 작업이 있었고 어느 날 입출고가 있었나"를 한눈에 보고, 바쁜 날과 한가한 날을 가늠하고 싶다.
2. 영농 사용자로서, 특정 날짜(예: 6/12)를 탭하면 그날 적은 업무일지와 입출고 거래가 한곳에 모여, 그날 무슨 일이 있었는지 회고하고 싶다.
3. 영농 사용자로서, 달력에서 본 업무일지를 바로 열어 수정하거나, 거래를 확인하러 이동하고 싶다(드릴인).
4. 영농 사용자로서, 이전/다음 달로 넘겨 가며 지난 달 활동도 돌아보고 "오늘"로 빠르게 복귀하고 싶다.
5. 함께 농장을 운영하는 팀원으로서, 동료가 적은 업무일지·거래도 같은 달력에서 함께 보며 일정을 맞추고 싶다(전역 공유).

## 수용 기준 (AC) — (A) 집계 뷰 전용 디폴트

### 날짜별 집계 순수 함수 — 단위 테스트 (Vitest, `tests/unit/`)

AC-1. When `groupByDate(workLogs, transactions)`를 호출하면, Then 항목의 `workDate`/`txnDate` 문자열을 키로 `YYYY-MM-DD` → `{ workLogs: WorkLog[], transactions: InventoryTransaction[] }` 맵이 반환되고, ① 같은 날짜의 업무일지·거래가 같은 키 아래 모이며, ② 항목 없는 날짜는 맵에 키가 없고, ③ `"2026-06-12"`·`"2026-06-30"`처럼 월말 경계 날짜도 정확히 그날에 귀속된다(UTC 변환으로 하루 밀리지 않음).

AC-2. When `summarizeDay(workLogsOfDay, transactionsOfDay)`를 호출하면, Then ① 업무일지 건수·인건비 합계(Σ `totalCost`), ② 입고 건수·출고 건수, ③ 입고 금액 합계·출고 금액 합계(`amount` null은 0으로 무시)가 반환되고, ④ 빈 입력은 모든 합계 0·건수 0이다.

AC-3. When `monthRange(year, month)`를 호출하면, Then 그 달 1일 `${year}-${mm}-01`과 말일 `${year}-${mm}-${lastDay}`가 `from`/`to` 문자열로 반환되고(2월 윤년 28/29일 포함), 이 값을 `api.workLogs.list({from,to})`·`api.stockTransactions.list({from,to})`에 그대로 넘길 수 있다.

AC-4. When `buildMonthGrid(year, month)`를 호출하면, Then 월 뷰에 그릴 날짜 셀 배열(앞뒤 빈칸 또는 인접월 셀 포함, 7열 정렬 가능 길이)이 반환되고, 각 셀은 자신의 `YYYY-MM-DD` 키와 "현재월/인접월" 플래그를 갖는다(셀 키는 로컬 날짜 산술로 만들되 항목 매핑은 문자열 키로만 비교 — 절충 3).

### 클라이언트 뷰·집계·드릴인·낙관 — E2E (Playwright + mockApi)

AC-5. (Given 로그인 상태) When 사용자가 NavDrawer의 영농 PRO 섹션 "캘린더" 항목을 탭한다 Then 캘린더 뷰가 잠금/페이월 없이 열리고(게이팅 강제 없음), 현재 달(오늘 기준)의 월 그리드가 표시되며 오늘 셀이 강조된다.

AC-6. (Given 2026-06-12에 업무일지 1건·입고 거래 1건, 2026-06-20에 출고 거래 1건이 mockApi로 주어진 상태, 현재 달 = 2026-06) When 캘린더 월 뷰를 본다 Then 6/12과 6/20 셀에만 활동 마커가 표시되고, 항목 없는 다른 날짜 셀에는 마커가 없다(빈 날 무마킹).

AC-7. (Given 위 상태에서 6/12 셀을 탭) When 일(날짜) 상세가 열린다 Then 그날의 업무일지 제목·인건비 합계와 입고 거래(품목명·수량)가 함께 표시되고, 같은 패널에 6/20의 항목은 표시되지 않는다(날짜 스코프).

AC-8. (Given 6/12 일 상세가 열린 상태) When 사용자가 업무일지 항목을 탭한다 Then 기존 5b 업무일지 편집 시트(또는 5b 뷰)로 진입한다(드릴인 — 캘린더는 새 편집 UI를 만들지 않고 기존 5b 경로 재사용).

AC-9. (Given 현재 달 = 2026-06) When 사용자가 "다음 달"을 탭한다 Then 2026-07 그리드로 바뀌고 그 달 범위(`from=2026-07-01&to=2026-07-31`)로 재조회되며, "오늘로"를 탭하면 오늘이 속한 달로 돌아오고 오늘 셀이 강조된다.

AC-10. (Given 항목이 하나도 없는 달) When 그 달의 월 뷰를 본다 Then 어떤 셀에도 마커가 없고, 빈 날짜를 탭하면 일 상세가 "기록 없음" 빈 상태(EmptyState)로 열린다(달력 자체는 정상 표시 — 빈 상태가 에러가 아님).

### 전역 공유 — E2E

AC-11. (Given 사용자 A가 만든 업무일지·거래가 6/12에 존재) When 사용자 B가 자기 세션으로 캘린더 2026-06을 본다 Then 6/12 셀에 마커가 보이고 일 상세에 A의 항목이 그대로 나타난다(전역 공유 — `created_by` 격리 없음, mockApi가 동일 목록 반환).

## 비범위

- **(B) 일정 엔티티(`calendar_events`)·계획/리마인더 작성** — 디폴트 (A)에서 제외(절충 1). 사용자가 (B) 선택 시 활성화.
- **주 뷰·연 뷰** — 월 뷰 + 일 상세까지만(절충 4).
- **반복 일정·드래그 이동·외부 캘린더(구글/iCal/Outlook) 연동** — 후속(절충 4).
- **알림·푸시·리마인더 발송** — 슬라이스 7(부가). (B)를 채택해도 알림은 별 슬라이스.
- **PRO 게이팅·freemium 잠금·페이월·구독 (슬라이스 6)** — 진입점에 PRO 표식만, 강제 없음(5a~5c 패턴 승계).
- **재고 평가액·급여명세·월별 리포트/차트·통계 대시보드** — 캘린더는 날짜별 조망까지. 집계 리포트는 후속.
- **필지(`parcel`)·작업장소 연결** — 5b·5c가 보류한 것을 캘린더가 되살리지 않음.
- **Realtime 동기화** — 단발 fetch + 월 이동 시 재조회(5a~5c 승계). 채널 추가 없음.
- **5a~5c·M-10 변경** — 캘린더는 5b `work_logs`·5c `inventory_transactions` 계약·핸들러·스토어를 **읽기 전용 소비**만(무변경). 새 컬럼·새 라우트 없음((A) 기준).
- **새 공통 UI 컴포넌트** — 월 그리드는 신규 feature 컴포넌트지만 셀·칩·시트는 기존 공통 UI(`Sheet`·`EmptyState`·`Button`·`ListRow`·`Badge` 등) 재조립 예상(디자이너 확정).

## 영향 범위 — (A) 집계 뷰 전용 디폴트

- 프론트: **frontend-only 슬라이스.**
  - 신규 `src/features/erp/calendar/`:
    - `CalendarView.tsx` — 풀스크린 월 뷰(5a `StaffView`·5b `WorkLogView`·5c `InventoryView` 선례: 지도 대체 풀스크린 레이어). 월 그리드 + 월 이동 헤더(이전/다음/오늘) + 날짜 마커 + 오늘 강조. 와이드는 일 상세를 우측 비모달 패널, 모바일은 셀 탭 시 BottomSheet(공통 `Sheet`).
    - `MonthGrid.tsx` / `DayCell.tsx` — 7열 그리드·셀(마커·카운트·오늘 표식). 신규 feature 컴포넌트(공통 UI 아님 — 도메인 그리드).
    - `DayDetailSheet.tsx`(또는 패널) — 그날 업무일지·거래 모아보기 + 드릴인(5b 시트/뷰 재사용 배선). EmptyState 빈 날.
    - `aggregate.ts` — React 비의존 순수 함수(`groupByDate`·`summarizeDay`·`monthRange`·`buildMonthGrid`). Vitest 단위 1:1. **`src/utils/`가 아니라 feature 내부**(서버 미사용 — 클라 전용).
    - `format.ts` — 날짜·금액 표시 포맷 헬퍼(클라 전용).
  - `src/stores/` — **신규 스토어 불요 권장**. 캘린더 뷰는 진입/월 이동 시 그 달 범위로 `useWorkLogStore.loadWorkLogs({from,to})`·`useInventoryStore.loadTransactions({from,to})`를 호출해 기존 스토어를 채우고 selector/순수 함수로 집계. (단, 캘린더 월 필터가 5b·5c 뷰의 기존 `range`/`filter`와 충돌하면 캘린더 전용 로컬 월 fetch 상태를 뷰 내부 `useState`로 둔다 — 구현 단계 결정. 스토어 신설은 최소화.)
  - `src/stores/ui.ts` — `calendarViewOpen`·`openCalendarView`/`closeCalendarView`(5a `staffViewOpen`·5b `workLogViewOpen`·5c `inventoryViewOpen` 선례).
  - `src/features/tab/NavDrawer.tsx` — 영농 PRO 앰버 섹션에 "캘린더" `DrawerItem` 추가(인력·거래처·업무일지·재고와 나란히), ui 스토어 `openCalendarView` 배선.
  - `src/App.tsx` — `calendarViewOpen` 풀스크린 레이어 배선.
  - `src/lib/api.ts` — **무변경**. 기존 `api.workLogs.list({from,to})`·`api.stockTransactions.list({from,to})` 재사용(from/to 필터 이미 구현·검증됨).
- 백엔드: **없음.** 기존 `server/handlers/workLogs.ts`·`inventoryTransactions.ts`의 from/to 기간 필터 재사용. 신규 핸들러·라우트·ids 없음.
- DB: **마이그레이션 불요.** 신규 테이블·컬럼 없음.
- API 계약: **없음.** 기존 `src/types/api/workLogs.ts`·`inventoryTransactions.ts` 계약을 읽기 전용 소비. 신규 zod 스키마 없음.

## (B) 채택 시 추가 범위 (사용자가 일정 엔티티를 원할 때만 활성 — 디폴트 비범위)

> 아래는 (A) 위에 **얹는** 증분이다. (A) AC-1~11은 그대로 유효하고, 일정 엔티티가 달력 셀의 세 번째 마커 종류로 추가된다.

- 엔티티 `calendarEvent`: `eventId`(서버 `cal_<ts36><rand6>`) · `eventDate`(YYYY-MM-DD) · `title`(min 1) · `memo`(nullable) · `done`(boolean, 완료 체크) · `createdBy` · `createdAt`/`updatedAt`. (반복·시간·알림 필드 없음 — 종일 단건.)
- DB: 신규 `supabase/migrations/0008_erp_calendar_events.sql` — `public.calendar_events`(전역 공유·`created_by` nullable uuid REFERENCES auth.users·RLS OFF·`event_date` 인덱스). 비파괴.
- 백엔드: 신규 `server/handlers/calendarEvents.ts`(컬렉션 GET/POST·아이템 PATCH/DELETE, mutate `requireUser`, `?from&to` 기간 필터) + `server/routes.ts` 라우트 4개 + `ids.ts` `genCalendarEventId`. 거래(5c)처럼 하드 삭제 또는 일지(5b)처럼 가변 — 일정은 가변 권장(PATCH 허용, `done` 토글·제목 수정).
- 계약: 신규 `src/types/api/calendarEvents.ts`(`calendarEventSchema`·list 응답·create/update 요청 `mutationBodySchema.extend`·`clientId`).
- 프론트: `EventSheet.tsx`(작성/수정 — 날짜·제목·메모·완료) + 일정 스토어 또는 ui 확장 + `aggregate.ts`에 일정 합산 추가.
- 추가 AC (B): (B-1) `POST /api/calendar-events` 생성 200 + `created_by` 기록 + 무인증 401(통합) / (B-2) `?from&to` 월 필터 목록·전역 공유(통합) / (B-3) `done` 토글 PATCH·삭제(통합) / (B-4) 달력 셀에 일정 마커 표시·셀 탭 시 일 상세에 일정 항목·완료 토글·"일정 추가" 진입점(E2E).

## 디자인 근거 (Stage 2 ui-designer 인계)

- Pencil 추적 파일 `design/new-design-v3.pen`. 후보 프레임: PC 보드 `m6wBu7` ⑫캘린더. 5a `rFIAH`·5b `AL2JL`·5c `VUHeL` 보드 디자인 언어(PRO 앰버 `--color-pro` #D69021).
- **확인 필요(이번 Stage 1에서 Pencil MCP 미접근)**: ui-designer는 위 보드에서 캘린더 화면이 실제로 존재하는지 확인하고, 없으면 신규 작성·신고한다(5a~5c 보드 언어 따라). 필요한 프레임: 월 뷰(7열 그리드·날짜 셀 마커: 업무일지/입고/출고 구분·카운트·오늘 강조·이전/다음/오늘 헤더)·일(날짜) 상세(그날 업무일지 카드 + 입출고 거래 카드 + 빈 상태 EmptyState + 드릴인 탭 표시). 모바일 셀 탭 → BottomSheet, 와이드 → 우측 비모달 SidePanel(공통 `Sheet` 컨테이너). NavDrawer 영농 PRO 앰버 섹션에 "캘린더" 진입점 추가(인력·거래처·업무일지·재고와 나란히). (B) 채택 시 일정 마커·일정 작성 시트 프레임 추가.
