# 영농 ERP — 업무일지·일당계산 (슬라이스 5b)

- 상태: 구현 완료 (게이트 green — typecheck 0·lint 0·단위 545·통합 workLogs 13/13·E2E 97·`supabase db reset` 0001~0006 재현 OK·`feat/erp-worklog` 커밋·미push)
- 구현 정정(계획 대비): 일당계산 순수 함수는 `src/features/erp/worklog/cost.ts`가 아니라 **`src/utils/workLogCost.ts`**(클라 미리보기·서버 totalCost 공유 권위)로 배치. 마이그레이션 파일명은 `0006_erp_worklog.sql`이 아니라 **`0006_erp_work_logs.sql`**. 시트 구성에 **`WorkerLineRow`·`StaffPickerSheet`·`draft.ts`** 추가, 스토어는 별도 **`src/stores/worklog.ts`**. ID 생성기는 `genWorkLogId`·`genWorkLogEntryId`(`server/handlers/ids.ts`)
- 매핑: 신규 (필지 전국 전환 로드맵 슬라이스 5 영농 ERP의 두 번째 sub-슬라이스 5b — `docs/specs/pilji-roadmap.md`. M-1~M-18 매핑표 밖)
- 판정:
  - **업무일지·일당계산 도메인**: 신규 (5a 인력·거래처 마스터 위에 얹는 PRO 콘텐츠. v1에 없던 개념 — 보존 대상 아님).
  - **5a 인력(`staff`)·거래처(`contacts`)**: 보존 (이번 슬라이스는 5a를 외래 참조만 한다 — 5a 스키마·핸들러·계약 무변경).
  - **지도 코어·시트 컨테이너·인증·Realtime(M-1~16, 슬라이스 1~4)**: 보존 (NavDrawer PRO 섹션 진입점·신규 도메인 뷰/시트·신규 테이블만 추가, 기존 경로 무변경).

## 배경 / 절충 (반드시 후속 단계가 인지)

이 슬라이스는 영농 ERP(슬라이스 5)의 두 번째 기능 — **업무일지(날짜별 작업 기록)와 일당계산(인건비 자동 산정)**이다. 5a가 확정한 5개 결정값(전역 공유·소프트 비활성·Realtime 비범위·PRO 게이팅 비범위·`created_by` 신원)을 그대로 승계하고, 5b 고유의 5개 설계 난제를 아래 확정값으로 못박는다(후속 단계는 이 확정값에 1:1 종속).

### 절충 0 — 5a 결정값 승계 (재논의 없음)

| 결정 | 값 | 5b 적용 |
| --- | --- | --- |
| 소유/공유 스코프 | 전역 공유 (`created_by` 신원만, 격리 없음) | 업무일지도 전역 단일 테이블 — `tab_id`/`region_id`/`created_by` 격리 없음. 로그인 멤버 전원이 같은 일지 목록을 본다 |
| Realtime | 비범위 (단발 fetch + 낙관, 롤백 없음) | 업무일지도 동일. 다른 멤버 변경은 다음 목록 진입(재조회) 시 반영 |
| PRO 게이팅 | 진입점만 PRO 섹션, 잠금 강제 없음 | NavDrawer 영농 PRO 앰버 섹션에 "업무일지" 항목 추가, 게이팅 강제 없음(슬라이스 6 자리) |
| 삭제 정책 | (5a 마스터) 소프트 비활성 | (5b 트랜잭션) **하드 삭제 허용** — 아래 절충 4 참조 |
| RLS | 미도입 (0002~0004 posture, 핸들러 `requireUser` 강제) | 신규 테이블도 RLS OFF + mutate `requireUser` |

### 절충 1 — 엔티티 모델 → **확정: 업무일지(`work_logs`) + 투입 인력 조인(`work_log_workers`) 2테이블**

업무일지 1건 = 날짜 + 작업 내용(제목·메모) + 투입 인력 목록(각 인력별 일당·근무율)이다. 인력↔일지는 다대다(한 일지에 여러 인력, 한 인력이 여러 일지)이므로 조인 테이블로 분리한다.

- **`work_logs`** (헤더): `work_log_id`(PK) · `work_date`(date) · `title`(text, 작업명/제목) · `memo`(text|null) · `created_by` · `created_at` · `updated_at`.
- **`work_log_workers`** (라인 — 투입 인력): `entry_id`(PK) · `work_log_id`(FK → work_logs, ON DELETE CASCADE) · `staff_id`(FK → staff, 참조만 — ON DELETE 제약 없음/RESTRICT, 소프트 비활성이므로 행은 보존됨) · `staff_name_snapshot`(text) · `applied_wage`(int, 적용 일당 스냅샷) · `work_ratio`(numeric, 근무율) · `created_at`.
- **거래처(`contacts`) 연결**: 이번 범위에 **포함하지 않는다**(과설계 회피). 업무일지는 "누가 무슨 작업을 했나 + 인건비"가 핵심이며 거래처(매입/매출)는 5c 재고의 도메인이다. 후속(5c·정산)에서 nullable `contact_id` 컬럼을 비파괴 추가하는 확장 경로만 남긴다.
- **필지(`parcel`) 연결**: 이번 범위에 **포함하지 않는다(후속 권고)**. 근거: (a) 업무일지의 1차 가치는 일별 인건비 기록이고, 필지 연결은 "어느 밭에서 작업했나"라는 부가 차원이다. (b) parcels는 region 스코프 대용량 테이블(4,409+)이라 연결 시 region·다중 필지 선택 UX가 통째로 따라붙어 슬라이스가 비대해진다. (c) 5a가 인력↔거래처 연결조차 후속으로 미룬 선례. 후속에서 nullable `parcel_id`(또는 다중 필지 조인) 비파괴 추가 경로만 남긴다. **이번 슬라이스의 일지는 필지와 무관하게 독립 작성된다.**

### 절충 2 — 일당 스냅샷 vs 참조 → **확정: 작성 시점 일당을 라인에 스냅샷 저장 (회계 무결성)**

`work_log_workers.applied_wage`·`staff_name_snapshot`은 **일지 작성/수정 시점의 값을 복사 저장**한다. 인력 참조(`staff_id`)는 유지하되 계산·표시는 스냅샷 값을 권위로 쓴다.

- 근거: 5a 인력 마스터의 `dailyWage`는 변할 수 있고 인력은 소프트 비활성(`active=false`)될 수 있다. 과거 일지의 인건비가 마스터 변경에 따라 소급 변동되면 회계가 깨진다. 회계 트랜잭션의 표준 패턴(주문 시점 가격 스냅샷)을 따른다.
- **생성 흐름**: 일지에 인력을 투입할 때 `applied_wage` 기본값 = 그 인력의 현재 `dailyWage`(끌어옴). 사용자가 **그날 일당을 오버라이드**할 수 있다(특근·다른 단가 등). `staff_name_snapshot`도 같은 시점 이름을 복사.
- **마스터 변경 후 불변**: 일지 저장 후 인력 마스터의 `dailyWage`를 바꾸거나 인력을 비활성화해도 **기존 일지의 `applied_wage`·합계는 변하지 않는다**(AC로 게이트).
- **비활성 인력 투입 정책**: 새 일지 작성 시 인력 선택 목록은 기본 `active=true`만(5a `GET /api/staff` 기본 동작 재사용). 단 기존 일지가 가리키는 비활성 인력의 라인은 스냅샷 이름·일당으로 그대로 표시·계산된다(참조 보존 — staff 소프트 비활성으로 행이 살아 있으므로 FK 안전).

### 절충 3 — 일당계산 규칙 → **확정: 순수 함수 `computeWorkerCost`/`computeLogTotal`, 합계 = Σ(applied_wage × work_ratio)**

- `computeWorkerCost(appliedWage, workRatio)` = `Math.round(appliedWage × workRatio)`. 음수·NaN 방어(0으로 클램프).
- `computeLogTotal(workers[])` = Σ `computeWorkerCost`.
- **근무율(`work_ratio`)**: 전일=1.0, 반일=0.5, 그 외 사용자 입력 배수(예: 연장 1.5). 입력 UI는 프리셋(전일/반일) + 직접 입력(소수 허용 — calculator의 문자열 draft 패턴 재사용). 저장은 numeric.
- React 비의존 순수 함수(`src/features/erp/worklog/cost.ts`) — Vitest 단위 테스트 1:1.
- 기간 합계(절충 5)도 같은 순수 함수로 일지별 합계를 합산한다.

### 절충 4 — CRUD/집계 범위 → **확정: 일지 CRUD(하드 삭제 포함) + 일지별 합계 + 단순 기간 합계까지. 복잡한 리포트는 후속**

- **CRUD**: 일지 생성·수정(제목·메모·날짜·투입 인력 라인 전체 교체)·삭제. 일지 삭제는 **하드 삭제**(행 제거 + CASCADE로 라인 동반 삭제). 5a 마스터의 소프트 비활성과 달리 트랜잭션 레코드는 외부 참조가 없어(거래처·필지 미연결) 하드 삭제가 안전하고 자연스럽다.
- **라인 교체 모델**: 일지 수정 시 투입 인력 라인은 **전체 치환**(부분 patch 금지 — `tabState` override 전체 치환 선례와 동형). 클라이언트가 병합된 전체 라인 배열을 보낸다.
- **목록**: 일지 목록은 `work_date` 내림차순(최신 우선). 일지별 합계(`computeLogTotal`)는 목록 행에 표기.
- **기간 합계(집계 최소)**: `GET /api/work-logs?from=YYYY-MM-DD&to=YYYY-MM-DD`로 기간 필터된 일지 목록을 반환하고, 클라이언트가 합계를 집계(또는 응답에 기간 총액 포함 — 구현 단계 결정, 계약은 일지 배열 반환으로 충분). **인력별 집계·급여명세·월별 차트·차감/공제는 후속(비범위).**

### 절충 5 — M-10 자동 계산기와의 구분 (혼동 방지 — 명세 필수)

| | M-10 자동 계산기 (`src/features/calculator/`) | 5b 일당계산 (이 슬라이스) |
| --- | --- | --- |
| 입력 | 필지/그룹 **면적(㎡)** | 인력의 **일당 × 근무율** |
| 데이터 소스 | `calcRecipes`(자재 레시피, app_config) + 필지 면적(V-World) | `staff.dailyWage`(5a) + 일지별 스냅샷 |
| 계산식 | (면적 ÷ baseArea) × amount → 자재 투입량 | Σ(applied_wage × work_ratio) → 인건비(원) |
| 진입 | 지도에서 필지 탭(계산기 모드) | NavDrawer PRO 섹션 "업무일지" |
| 저장소 | `app_config['calc_recipes']` 단일 행 | `work_logs` + `work_log_workers` 신규 테이블 |
| 도메인 | 영농 자재 산정 | 인건비 회계 |

→ **두 도메인은 코드·스토어·테이블·진입점이 전부 분리**된다. 5b는 `calcRecipes`·`src/features/calculator/`를 import하지 않으며, M-10도 5b를 모른다. "계산"이라는 단어가 겹칠 뿐 충돌·중복 없음. (5b 순수 함수 파일명은 `cost.ts`로 `calc.ts`와 구분.)

### 엔티티 필드 (zod 계약으로 확정)

**업무일지(`workLog`)**:

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `workLogId` | string | 서버 생성 ID (`wlg_<ts36><rand6>`) |
| `workDate` | string (YYYY-MM-DD) | 작업 날짜 (필수) |
| `title` | string (min 1) | 작업명/제목 (필수) |
| `memo` | string \| null | 메모 |
| `workers` | `WorkLogWorker[]` | 투입 인력 라인 (0개 허용 — 합계 0) |
| `totalCost` | number(int ≥0) | 일당 합계 (서버 산출 — 응답 편의, 클라이언트도 순수 함수로 동일 산출 가능) |
| `createdBy` | string \| null | 신원 기록만 |
| `createdAt` / `updatedAt` | string(ISO) | |

**투입 인력 라인(`workLogWorker`)**:

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `entryId` | string | 서버 생성 ID |
| `staffId` | string | 5a 인력 참조 |
| `staffNameSnapshot` | string | 작성 시점 이름 스냅샷 (절충 2) |
| `appliedWage` | number(int ≥0) | 적용 일당 스냅샷 (절충 2) |
| `workRatio` | number (>0) | 근무율 (전일 1.0·반일 0.5·연장 등) |

문자열 정규화(trim, 빈 문자열 → null)는 5a `normText`/`GroupSheet.handleSave` 선례를 따른다. 근무율 문자열 draft는 M-10 `sanitizeDecimalInput`/`toRecipeNumber` 선례 재사용.

## 사용자 스토리

1. 영농 사용자로서, "오늘(6/18) 고추밭 정식, 김씨·이씨 투입"처럼 날짜별 작업과 투입 인력을 기록해, 누가 언제 무슨 일을 했는지 남기고 싶다.
2. 영농 사용자로서, 일지에 인력을 넣으면 그 사람의 기본 일당이 자동으로 채워지고 인건비 합계가 자동 계산돼, 매번 계산기를 두드리지 않고 싶다.
3. 영농 사용자로서, 어떤 날은 반일만 일했거나 특근 단가를 줬을 때 그날만 일당·근무율을 바꿔 정확히 기록하고 싶다.
4. 영농 사용자로서, 나중에 일꾼 기본 일당을 올리거나 그만둔 일꾼을 비활성해도 **과거 일지의 인건비 기록은 그대로 남아** 정산이 어긋나지 않기를 바란다.
5. 영농 사용자로서, 특정 기간(예: 이번 달)의 일지를 모아 보고 총 인건비를 확인하고 싶다.
6. 함께 농장을 운영하는 팀원으로서, 동료가 적은 업무일지를 내 계정으로도 같이 보며 협업하고 싶다.

## 수용 기준 (AC)

### 일당계산 순수 함수 — 단위 테스트 (Vitest, `tests/unit/`)

AC-1. When `computeWorkerCost(appliedWage, workRatio)`를 호출하면, Then ① `(80000, 1.0)` = 80000, ② `(80000, 0.5)` = 40000(반일), ③ `(80000, 1.5)` = 120000(연장), ④ 소수 결과는 반올림(`(70000, 0.333)` = 23310), ⑤ 음수·NaN 입력은 0으로 클램프된다.

AC-2. When `computeLogTotal(workers)`를 호출하면, Then ① 라인 3개 `[(80000,1.0),(80000,0.5),(60000,1.0)]` 합계 = 180000, ② 빈 배열 = 0이다.

AC-3. Given 근무율 문자열 draft, When `sanitizeDecimalInput`/`toRecipeNumber`(M-10 재사용)를 적용하면, Then `"0.5a"` → `"0.5"`, `"1."`은 입력 중간 상태로 보존되고 `toRecipeNumber("1.")` = 1, `toRecipeNumber("")` = 0이다.

### 계약 스키마 — 단위 테스트 (Vitest, zod)

AC-4. Given `workLogSchema`, When 유효 일지(`workDate` `"2026-06-18"`·`title` 비어있지 않음·workers 배열)를 파싱하면 통과하고, Then `workDate`가 `YYYY-MM-DD` 형식이 아니거나(`"2026/6/18"`)·`title`이 빈 문자열이거나·`appliedWage`가 음수이거나·`workRatio`가 0 이하인 생성 요청은 거부된다.

### 일지 CRUD — 핸들러 통합테스트 (`tests/integration/`, 로컬 Supabase 기동)

AC-5. (Given 유효한 세션 토큰) When `POST /api/work-logs`에 `{ workDate, title, memo, workers: [{staffId, appliedWage, workRatio}], clientId }`로 일지를 생성한다 Then 200으로 `workLogId`가 부여된 `workLogSchema` 행이 반환되고, `workers` 라인이 함께 저장되며(각 `entryId` 부여), 서버가 `staffNameSnapshot`을 그 시점 staff 이름으로 채우고, `totalCost`가 `computeLogTotal`과 일치하며, `created_by`가 인증 사용자로 기록된다.

AC-6. (Given 일지 2건이 서로 다른 `work_date`로 존재) When `GET /api/work-logs`를 호출한다 Then `work_date` 내림차순(최신 우선)으로 각 일지가 `workers` 라인·`totalCost`를 포함해 반환되고, `GET /api/work-logs?from=2026-06-01&to=2026-06-30`을 호출하면 해당 기간 일지만 반환된다.

AC-7. (Given 기존 일지 1건, 투입 인력 2명) When `PATCH /api/work-logs/:id`로 `title`·`workers`(라인 1개로 축소한 전체 배열)를 전송한다 Then 제목이 갱신되고 투입 인력 라인이 **전체 치환**(기존 2개 삭제 후 신규 1개)되며, `totalCost`가 재산출되고 `updatedAt`이 갱신된다.

AC-8. (Given 기존 일지 1건) When `DELETE /api/work-logs/:id`를 호출한다 Then 헤더 행이 물리 삭제되고 연결된 `work_log_workers` 라인도 CASCADE로 함께 삭제되며(하드 삭제), 이후 `GET /api/work-logs`에서 제외된다.

AC-9. (Given 세션 토큰 없이) When `POST`·`PATCH`·`DELETE /api/work-logs*` mutate를 직접 호출한다 Then 핸들러가 401을 반환하고 어떤 행도 생성·변경·삭제되지 않는다(`requireUser` 게이트 — RLS 아님).

### 일당 스냅샷 보존 — 통합테스트 (회계 무결성, 절충 2)

AC-10. (Given staff A의 `dailyWage`=80000으로 일지를 생성해 `applied_wage`=80000이 스냅샷된 상태) When staff A의 마스터 `dailyWage`를 100000으로 `PATCH`한 뒤 그 일지를 `GET`한다 Then 일지 라인의 `appliedWage`는 여전히 80000이고 `totalCost`도 불변이다(마스터 변경 소급 안 됨).

AC-11. (Given staff A를 투입한 일지가 존재) When staff A를 `DELETE /api/staff/:id`(소프트 비활성)한 뒤 그 일지를 `GET`한다 Then 일지 라인이 `staffNameSnapshot`·`appliedWage` 스냅샷으로 그대로 조회되고 계산값이 보존된다(비활성 인력 참조 무결).

### 소유/공유 스코프 — 전역 공유 검증

AC-12. (Given 사용자 A가 세션 토큰으로 일지 1건을 생성한 상태) When 사용자 B가 자기 세션 토큰으로 `GET /api/work-logs`를 호출한다 Then 사용자 A가 만든 일지가 B의 목록에 그대로 보인다(전역 공유 — `created_by`로 격리하지 않음).

### 클라이언트 뷰·시트·낙관 업데이트 — E2E (Playwright + mockApi)

AC-13. (Given 로그인 상태에서 일지 0건) When 사용자가 NavDrawer의 영농 PRO 섹션 "업무일지" 항목을 탭한다 Then 업무일지 뷰가 잠금/페이월 없이 열리고(게이팅 강제 없음), 빈 상태(EmptyState)와 "작성" 진입점이 표시된다.

AC-14. (Given 5a 활성 인력 2명이 등록된 상태에서 업무일지 작성 시트가 열림) When 사용자가 날짜·제목을 입력하고 인력 1명을 선택한다 Then 그 인력의 기본 일당이 라인에 자동 채워지고, 근무율 프리셋 "반일"을 선택하면 그 라인 인건비가 일당의 절반으로 표시되며, 화면 합계가 라인 합과 일치한다.

AC-15. (Given 작성 시트에서 유효한 일지를 입력) When "저장"을 탭한다 Then 시트가 닫히고 재조회 없이도 새 일지가 목록 최상단(최신 날짜순)에 합계와 함께 즉시 나타난다(낙관 업데이트). When 그 일지를 "삭제"하면, Then 목록에서 즉시 사라진다(하드 삭제 낙관).

## 비범위

- **재고 (5c)** — 거래처·입출고·재고 트랜잭션.
- **캘린더 (5d)** — 일지의 달력 뷰·일정.
- **PRO 게이팅·freemium 잠금·페이월·구독 (슬라이스 6)** — 진입점에 PRO 표식만, 강제 없음(5a 패턴 승계).
- **거래처(`contacts`) 연결** — 업무일지↔거래처 매입/매출 연결은 5c·정산 도메인(절충 1).
- **필지(`parcel`) 연결** — 어느 밭에서 작업했는지 연결(후속 권고, 절충 1). 이번 일지는 필지와 독립.
- **복잡한 집계·리포트·급여명세** — 인력별 누적 인건비·월별 차트·공제/세금·급여명세서 출력. 이번엔 일지별 합계 + 단순 기간 합계까지만(절충 4).
- **Realtime 동기화** — 단발 fetch + 낙관(5a 절충 3 승계). 채널 추가는 후속.
- **인력 출근/근태 관리(타임카드)·시간 단위 정밀 근태** — 근무율(전일/반일/배수)까지만. 출퇴근 시각 기록은 후속.
- **5a 인력·거래처 마스터 변경** — 5b는 5a를 외래 참조만(5a 스키마·핸들러·계약 무변경). staff에 신규 컬럼 추가 없음.
- **M-10 자동 계산기 변경** — 별도 도메인(절충 5). `calcRecipes`·`src/features/calculator/` 무변경.
- **RLS 재도입** — 0002~0005 posture(OFF) 유지, 신규 테이블도 RLS OFF + 핸들러 `requireUser` 강제.

## 영향 범위

- 프론트: **frontend-dev 슬라이스.**
  - 신규 `src/features/erp/worklog/` — `WorkLogView`(목록 풀스크린 뷰 — 5a `StaffView` 선례: 지도 대체 풀스크린 레이어, 날짜순 일지 카드 + 일지별 합계 + 기간 필터)·`WorkLogSheet`(작성/수정 — 공통 `Sheet` 래핑, 날짜·제목·메모 + 투입 인력 라인 편집기)·`WorkerLineRow`(라인별 인력 선택·일당 오버라이드·근무율 프리셋/직접 입력)·`cost.ts`(React 비의존 순수 함수 — `computeWorkerCost`/`computeLogTotal`). 생성/수정 draft 패턴(로컬 useState → 저장 버튼에서만 커밋, 5a `StaffSheet`·`GroupSheet` 선례). 근무율 입력은 M-10 `sanitizeDecimalInput`/`toRecipeNumber` 재사용. `EmptyState`·`ConfirmInline`(삭제 확인)·`SegmentedControl`(근무율 프리셋)·`Input`·`Button` 등 공통 UI 재조립 — **신규 공통 UI 컴포넌트 없음 예상**(인력 선택은 5a staff 목록을 시트 내 picker로 — 디자이너 확인).
  - `src/stores/` — 신규 `worklog.ts`(또는 `erp.ts`에 슬라이스 추가): `workLogs[]` 상태 + `loadWorkLogs(from?, to?)`/`createWorkLog`/`updateWorkLog`/`deleteWorkLog`(낙관, 롤백 없음 — 5a 패턴 동형). 인력 기본 일당 끌어옴은 5a `useErpStore.staff` 참조. **시트 내부 편집은 로컬 draft, 저장에서만 스토어 커밋**(CONVENTIONS §3).
  - `src/features/tab/NavDrawer.tsx` — 영농 PRO 앰버 섹션에 "업무일지" `DrawerItem` 추가, ui 스토어 `openWorkLogView` 배선.
  - `src/stores/ui.ts` — `workLogViewOpen`·`openWorkLogView`/`closeWorkLogView`(5a `staffViewOpen` 선례).
  - `src/lib/api.ts` — typed client에 `api.workLogs.{list,create,update,remove}` 추가(mutate 시 `clientId` + `Authorization: Bearer` 자동 주입 — 기존 패턴).
- 백엔드: **backend-dev 슬라이스.**
  - 신규 `server/handlers/workLogs.ts` — 런타임 비의존 순수 핸들러(req/res 직접 접근 금지). 컬렉션 핸들러(`GET`/`POST`)·아이템 핸들러(`PATCH`/`DELETE`) 분리(5a `staff.ts`·`contacts.ts` 선례). 모든 mutate에 `requireUser` 게이트 선적용(무인증 401·행 미기록). 생성 시 `created_by = user.id` 주입 + `workers` 라인의 `staff_name_snapshot`을 그 시점 staff 이름으로 채움(절충 2 — staff 조회). `PATCH`는 헤더 갱신 + 라인 전체 치환(기존 라인 delete 후 신규 insert). `DELETE`는 하드 삭제(CASCADE). `GET`은 헤더 + 라인 조인(또는 2쿼리 후 조립) + `totalCost` 산출, `?from`/`?to` 기간 필터.
  - `server/handlers/ids.ts` — `genWorkLogId`(`wlg_<ts36><rand6>`)·`genWorkLogEntryId` 추가(5a `genStaffId` 선례).
  - `server/routes.ts` — 신규 라우트: `GET`/`POST /api/work-logs`, `PATCH`/`DELETE /api/work-logs/:id`(컬렉션 2세그 vs 아이템 3세그로 `matchRoute` 충돌 없음 — 5a 선례). Vercel 단일 catch-all이라 추가 함수·`vercel.json` 변경 불요.
  - `tests/integration/workLogs.test.ts` — 생성(라인·스냅샷·합계)·목록(날짜순·기간 필터)·수정(라인 전체 치환)·하드 삭제(CASCADE)·무인증 401·스냅샷 보존(마스터 변경/비활성 후 불변)·전역 공유(AC-5~12 매핑). 로컬 Supabase 기동 필요.
- DB: **마이그레이션 필요** — 신규 `supabase/migrations/0006_erp_worklog.sql`(비파괴).
  - 신규 테이블 `public.work_logs`(work_log_id text PK·work_date date NOT NULL·title text NOT NULL·memo text·created_by uuid REFERENCES auth.users·created_at·updated_at)·`public.work_log_workers`(entry_id text PK·work_log_id text REFERENCES work_logs ON DELETE CASCADE·staff_id text REFERENCES staff(staff_id)·staff_name_snapshot text·applied_wage int·work_ratio numeric NOT NULL·created_at).
  - `created_by`는 슬라이스 2/5a 신원 컬럼 패턴 동일(nullable uuid — 격리 아님). 에코 가드 `updated_by`(clientId) 미도입(Realtime 비범위). `clientId`는 계약 바디에만 포함.
  - 인덱스: `work_log_workers(work_log_id)`(라인 조인)·`work_logs(work_date desc)`(목록 정렬) 선택.
  - **RLS 미도입** — 0002~0005 posture 유지, 신규 두 테이블도 `DISABLE ROW LEVEL SECURITY`. Realtime publication 등록 안 함(절충 0).
  - 기존 행·기존 테이블(`staff` 포함) 무변경(완전 신설 — 비파괴). `staff_id` FK는 참조만(staff 소프트 비활성이라 행이 살아 있어 무결).
- API 계약: **신규** — `src/types/api/workLogs.ts`.
  - `workLogWorkerSchema`·`workLogSchema`(위 엔티티 필드), 목록 응답(`z.array`), `createWorkLogRequestSchema`/`updateWorkLogRequestSchema`(`mutationBodySchema.extend` — `clientId` 포함, 5a 선례. workers 라인 배열 포함, 생성 라인은 `appliedWage`·`workRatio`·`staffId`만 — `entryId`·`staffNameSnapshot`은 서버 산출). `workDate`는 `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`, `workRatio`는 `z.number().positive()`. 401·400은 기존 `errorResponseSchema` 재사용. 프론트 클라이언트와 핸들러가 같은 스키마를 import(`z.infer`).

## 디자인 근거 (Stage 2 ui-designer 인계)

- Pencil 추적 파일 `design/new-design-v3.pen`. 후보 프레임: PC 보드 `m6wBu7` ⑩업무(업무일지), 모바일 보드 `kcXpg`.
- **확인 필요(이번 Stage 1에서 Pencil MCP 미접근)**: ui-designer는 위 보드에서 업무일지·일당 화면이 실제로 존재하는지 확인하고, 없으면 신규 작성·신고한다(5a `rFIAH` 보드 디자인 언어 따라). 필요한 프레임: 업무일지 목록 뷰(날짜순 카드 + 일지별 합계 + 기간 필터 + "작성" 진입점 + EmptyState)·작성/수정 시트(날짜 picker·제목·메모 + 투입 인력 라인 편집기: 인력 선택 picker·일당 오버라이드 Input·근무율 프리셋 SegmentedControl + 라인 합계·전체 합계). 모바일 BottomSheet/와이드 비모달 SidePanel(공통 `Sheet` 컨테이너). NavDrawer 영농 PRO 앰버 섹션에 "업무일지" 진입점 추가.
