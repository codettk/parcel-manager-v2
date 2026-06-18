# 영농 ERP — 재고 관리 (슬라이스 5c)

- 상태: 구현 완료 (게이트 green — lint·typecheck 0, 단위 582·통합 inventory 24·E2E 102 passed, `feat/erp-inventory` 미push)
- 구현 정정 메모 (명세↔확정 계약 표기 차이 — 설계 결정은 절충 1~6 그대로): 명세 본문이 쓴 라우트·필드·테이블명은 구현에서 아래로 확정됐다.
  - 거래 라우트 `/api/stock-transactions` → **`/api/inventory/transactions`**, 품목 `/api/inventory-items` → **`/api/inventory/items`** (`/api/inventory/*` 네임스페이스 통일. matchRoute 세그먼트 수로 컬렉션/아이템 구분).
  - 거래 수량 필드 `qty` → **`quantity`** (계약 `src/types/api/inventoryTransactions.ts`·스냅샷·`amount=round(quantity×unitPrice)` 전부 `quantity`).
  - 거래 테이블명 `stock_transactions` → **`inventory_transactions`**, ID 생성 함수 `genStockTransactionId` → **`genInventoryTxnId`**(PK prefix `stx_` 유지) (`supabase/migrations/0007_erp_inventory.sql` 확정 — `item_id`·`contact_id` ON DELETE SET NULL, `type` CHECK in/out, `quantity>0`).
  - 현재고 응답은 별도 `GET /api/item-balances` 라우트 대신 품목 목록 응답 + 클라/서버 공유 `computeBalances`(`src/utils/stockBalance.ts`)로 파생(계약 수용 범위 내 결정).
- 매핑: 신규 (필지 전국 전환 로드맵 슬라이스 5 영농 ERP의 세 번째 sub-슬라이스 5c — `docs/specs/pilji-roadmap.md`. M-1~M-18 매핑표 밖)
- 판정:
  - **재고 도메인(품목 마스터 + 입·출고 거래 원장)**: 신규 (5a 인력·거래처, 5b 업무일지 위에 얹는 PRO 콘텐츠. v1에 없던 개념 — 보존 대상 아님).
  - **5a 거래처(`contacts`)**: 보존 (이번 슬라이스는 5a `contacts`를 외래 참조만 한다 — 5a 스키마·핸들러·계약 무변경. 5b에서 미룬 거래처 연결을 5c가 실현).
  - **5b 업무일지·일당계산**: 보존 (5c는 5b를 import하지 않으며 5b도 5c를 모른다 — 별 도메인. NavDrawer PRO 섹션에 진입점만 나란히 추가).
  - **지도 코어·시트 컨테이너·인증·Realtime(M-1~16, 슬라이스 1~4)·M-10 자동 계산기**: 보존 (NavDrawer PRO 섹션 진입점·신규 도메인 뷰/시트·신규 테이블만 추가, 기존 경로 무변경).

## 배경 / 절충 (반드시 후속 단계가 인지)

이 슬라이스는 영농 ERP(슬라이스 5)의 세 번째 기능 — **재고 관리**다. 농자재(비료·농약·종자 등)와 농산물 품목을 등록하고, 입·출고 거래를 기록해 **현재고를 추적**한다. 5a가 확정한 5개 결정값(전역 공유·소프트 비활성·Realtime 비범위·PRO 게이팅 비범위·`created_by` 신원)과 5b가 확립한 패턴(헤더+라인 모델, 작성 시점 스냅샷, 서버 권위 합계를 공유 순수 모듈로 산출)을 승계하고, 5c 고유의 설계 난제를 아래 확정값으로 못박는다(후속 단계는 이 확정값에 1:1 종속).

### 절충 0 — 5a·5b 결정값 승계 (재논의 없음)

| 결정 | 값 | 5c 적용 |
| --- | --- | --- |
| 소유/공유 스코프 | 전역 공유 (`created_by` 신원만, 격리 없음) | 품목·거래도 전역 단일 테이블 — `tab_id`/`region_id`/`created_by` 격리 없음. 로그인 멤버 전원이 같은 재고를 본다 |
| Realtime | 비범위 (단발 fetch + 낙관, 롤백 없음) | 품목·거래·현재고도 동일. 다른 멤버 변경은 다음 진입(재조회) 시 반영 |
| PRO 게이팅 | 진입점만 PRO 섹션, 잠금 강제 없음 | NavDrawer 영농 PRO 앰버 섹션에 "재고" 항목 추가, 게이팅 강제 없음(슬라이스 6 자리) |
| RLS | 미도입 (0002~0006 posture, 핸들러 `requireUser` 강제) | 신규 테이블도 RLS OFF + mutate `requireUser` |
| `clientId` | 계약 바디에 포함, 에코 가드 `updated_by` 미도입 | 동일 (Realtime 비범위 — `clientId`는 typed client 규약·향후 대비) |

### 절충 1 — 재고 모델: 현재고 계산 방식 → **확정: 거래 원장(transactions) 합산 파생 (단일 진실·감사 추적)**

두 축으로 분해한다. (A) **품목 마스터(`inventory_items`)** + (B) **입·출고 거래 원장(`stock_transactions`)**. 현재고는 **품목에 저장하지 않고 거래 원장 합산으로 파생**한다.

- **현재고 = Σ(입고 수량) − Σ(출고 수량)** — 품목별 거래를 누적 집계한 파생값. 별도 `current_qty` 컬럼을 두지 않는다.
- 근거: (a) 5b 헤더/라인·스냅샷 철학과 정합 — 거래 원장이 단일 진실이고 합계는 그로부터 산출(서버 권위, 공유 순수 모듈). (b) 저장 방식은 거래 생성/삭제 때마다 품목 `current_qty`를 동기 갱신해야 하는 동기화 부채를 낳고, 거래 삭제·수정 시 재계산 누락이 곧 데이터 손상이다. (c) 거래 삭제 시 현재고가 자동으로 정확해진다(파생이므로 별도 재계산 트리거 불요). (d) 품목 수·거래 수가 5c 규모(농장 단위)에선 작아 합산 성능은 무시 가능.
- **초기 재고(opening balance)**: 별도 개념을 두지 않고 **유형 `in`(입고) 거래 1건으로 표현**한다(메모로 "초기 재고" 구분 가능, 거래처·단가 생략 허용). 모델 단순화 — 입출고와 동일 경로.
- **현재고 산출 순수 함수**: `src/utils/stockBalance.ts`(React 비의존, 클라 미리보기·서버 응답 권위 공유 — `src/utils/workLogCost.ts`·`override.ts` 선례). `computeItemBalance(transactions)` = Σ(`in` 수량) − Σ(`out` 수량), `computeBalances(transactions)` = 품목별 현재고 맵. 음수 현재고도 허용(출고 초과 — 경고 없이 음수 표시, 차단하지 않음. 현장에서 거래 누락 시 흔함).

### 절충 2 — 입·출고 거래 + 거래처 연결 → **확정: 헤더 단일 라인(품목당 1거래) 모델 · 거래처 nullable 연결 · 정합 검증 느슨**

5b의 헤더+라인(다대다) 모델과 달리, 재고 거래는 **거래 1건 = 품목 1개의 입고/출고 1건**(단순 단일 레코드)으로 둔다. 한 거래가 여러 품목을 동시에 움직이는 "전표" 묶음은 과설계이므로 이번 범위 밖(후속 — `txn_group_id` 비파괴 추가 경로).

- **거래 필드**: 품목(`itemId` FK)·유형(`type` `in`|`out`)·수량(`qty` >0)·일자(`txnDate`)·거래처 연결(`contactId` nullable FK)·단가(`unitPrice` nullable)·금액(`amount` nullable — 산출 또는 입력)·메모.
- **거래처 연결**: nullable(선택). 입고는 매입처, 출고는 매출처를 연결할 수 있으나 **정합 강제는 느슨하게** — `in`↔`buy`/`both`, `out`↔`sell`/`both` 정합을 **검증·차단하지 않는다**(경고 없이 허용). 근거: 현장 데이터는 거래처 구분이 모호한 경우가 많고, 5a `contacts.kind`는 분류 힌트일 뿐 강제 제약이 아니다. 거래처 미연결(`contactId=null`)도 정상(초기 재고·자가 소비 등).
- **거래처 미연결 vs 비활성 거래처**: 거래 생성 시 거래처 목록은 5a 활성(`active=true`)만 노출(기본). 단 기존 거래가 가리키는 비활성 거래처는 스냅샷 상호로 표시·보존(절충 3).

### 절충 3 — 스냅샷 적용 → **확정: 품목명·단위·거래처 상호를 거래에 스냅샷 저장 (5b 회계 무결성 승계)**

거래 생성 시점의 **품목명(`itemNameSnapshot`)·단위(`unitSnapshot`)·거래처 상호(`contactNameSnapshot`)**를 거래 행에 복사 저장한다. 참조 FK(`itemId`·`contactId`)는 유지하되 표시는 스냅샷이 권위.

- 근거: 5b `applied_wage`·`staff_name_snapshot` 선례와 동형. 품목명·단위·거래처 상호가 나중에 바뀌거나 비활성돼도 과거 거래 표시·기록이 소급 변동되면 회계가 깨진다. 단가(`unit_price`)·금액(`amount`)도 거래 행에 직접 저장(거래 시점 값) — 품목/거래처 변경에 소급 안 됨.
- **수량·현재고는 스냅샷이 아니라 합산 파생**(절충 1) — 스냅샷 대상은 **표시용 텍스트·당시 단가/금액**이다. 현재고는 거래 원장의 살아 있는 `qty` 합산이므로, 거래가 삭제되면 현재고가 줄어드는 것이 정상(스냅샷과 무관).
- **마스터 변경 후 불변(AC 게이트)**: 거래 저장 후 품목명·단위를 바꾸거나 품목을 비활성화해도, 거래처 상호를 바꾸거나 비활성화해도 **기존 거래의 스냅샷·단가·금액은 변하지 않는다**.

### 절충 4 — 삭제 정책 → **확정: 품목 = 소프트 비활성(5a 패턴) · 거래 = 하드 삭제(5b 패턴)**

- **품목(`inventory_items`)**: 소프트 비활성(`active=false`). 과거 거래가 `itemId`로 참조하므로 하드 삭제는 무결성을 깬다(5a 마스터 패턴). "삭제" UI는 `active=false`. 기본 목록은 `active=true`만, `?includeInactive=true`로 비활성 포함·재활성화. 비활성 품목도 과거 거래·현재고 계산에는 그대로 참여(거래 원장이 권위).
- **거래(`stock_transactions`)**: 하드 삭제(행 제거, 5b 트랜잭션 레코드 패턴). 거래는 외부 참조가 없어 하드 삭제가 안전. **거래 삭제 시 그 품목 현재고가 자동 재계산**된다(파생이므로 별도 트리거 불요 — 다음 합산에서 빠짐, 절충 1).
- FK ON DELETE: `stock_transactions.item_id REFERENCES inventory_items(item_id)`는 RESTRICT/제약 보존(품목 소프트 비활성이라 행이 살아 있음). `contact_id REFERENCES contacts(contact_id) ON DELETE SET NULL`(거래처도 소프트 비활성이라 실제 SET NULL은 발생 안 하나, 방어적으로 — 5b `staff_id` 선례).

### 절충 5 — CRUD/집계 범위: 거래 수정 → **확정: 거래는 생성·삭제만(수정은 삭제 후 재생성). 품목은 CRUD. 집계는 현재고·품목별 거래 이력까지**

- **품목**: 목록·생성·수정(이름·단위·분류·메모·active)·소프트 비활성. 5a `staff`/`contacts` CRUD와 동형.
- **거래**: 목록·생성·**하드 삭제만**. **수정(PATCH) 미제공** — 잘못 입력한 거래는 삭제 후 재생성으로 단순화(원장 무결성·스냅샷 일관 유지. 거래 수정은 스냅샷·단가·금액·유형이 얽혀 부분 patch가 위험). 근거: 거래는 append-only 원장에 가깝고, 5b 일지(가변 헤더)와 달리 한 번 기록된 입출고 사실은 정정보다 취소+재기록이 회계적으로 정확.
- **집계 범위**:
  - **현재고**: 품목별 현재고(`computeItemBalance`)를 품목 목록·품목 상세에 표기.
  - **품목별 거래 이력**: 특정 품목의 입출고 거래 목록(`GET /api/stock-transactions?itemId=...`).
  - **기간 필터**: `GET /api/stock-transactions?from=&to=` 거래 기간 필터(5b 선례).
  - **비범위(후속)**: 재고 평가액(원가법·이동평균·선입선출)·재고 회전율·월별 입출고 리포트·차트·재고 부족 알림·재고 실사(조정 거래 전용 UI). 이번엔 단순 입출고 기록 + 수량 기준 현재고까지만.

### 절충 6 — M-10 자동 계산기·5b 일당계산과의 구분 (혼동 방지 — 명세 필수)

| | M-10 자동 계산기 | 5b 일당계산 | 5c 재고 (이 슬라이스) |
| --- | --- | --- | --- |
| 입력 | 필지/그룹 면적(㎡) | 인력 일당 × 근무율 | 품목 입고/출고 수량 |
| 계산식 | (면적÷baseArea)×amount → 자재 투입량 | Σ(applied_wage × work_ratio) → 인건비 | Σ(in qty) − Σ(out qty) → 현재고 |
| 저장소 | `app_config['calc_recipes']` | `work_logs`+`work_log_workers` | `inventory_items`+`stock_transactions` |
| 진입 | 지도 필지 탭(계산기 모드) | NavDrawer PRO "업무일지" | NavDrawer PRO "재고" |
| 순수 함수 | `src/features/calculator/.../calc.ts` | `src/utils/workLogCost.ts` | `src/utils/stockBalance.ts` |

→ **세 도메인은 코드·스토어·테이블·진입점이 전부 분리**된다. 5c는 `calcRecipes`·`src/features/calculator/`·5b `worklog`를 import하지 않으며, 그들도 5c를 모른다. "계산"이라는 단어가 겹칠 뿐 충돌·중복 없음. (5c 순수 함수 파일명은 `stockBalance.ts`로 `calc.ts`·`workLogCost.ts`와 구분.)

### 엔티티 필드 (zod 계약으로 확정)

**품목(`inventoryItem`)**:

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `itemId` | string | 서버 생성 ID (`inv_<ts36><rand6>`) |
| `name` | string (min 1) | 품목명 (필수 — 예: 요소비료) |
| `unit` | string (min 1) | 단위 (필수 — 예: kg·포·박스) |
| `category` | string \| null | 분류 (선택 자유 텍스트 — 예: 비료·농약·종자) |
| `memo` | string \| null | 메모 |
| `active` | boolean | 활성 여부 (소프트 비활성, 기본 true) |
| `createdBy` | string \| null | 신원 기록만 |
| `createdAt` / `updatedAt` | string(ISO) | |

**입·출고 거래(`stockTransaction`)**:

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `txnId` | string | 서버 생성 ID (`stx_<ts36><rand6>`) |
| `itemId` | string | 품목 참조 (필수) |
| `itemNameSnapshot` | string | 작성 시점 품목명 스냅샷 (절충 3, 서버 채움) |
| `unitSnapshot` | string | 작성 시점 단위 스냅샷 (서버 채움) |
| `type` | `'in' \| 'out'` | 입고/출고 (필수) |
| `qty` | number (>0) | 수량 (현재고 합산 대상) |
| `txnDate` | string (YYYY-MM-DD) | 거래 일자 (필수, 목록 정렬·기간 필터 키) |
| `contactId` | string \| null | 거래처 참조 (선택 — 5a contacts) |
| `contactNameSnapshot` | string \| null | 작성 시점 거래처 상호 스냅샷 (서버 채움, 미연결 시 null) |
| `unitPrice` | number(≥0) \| null | 단가 (선택, 거래 시점 값) |
| `amount` | number(≥0) \| null | 금액 (선택, 거래 시점 값) |
| `memo` | string \| null | 메모 |
| `createdBy` | string \| null | 신원 기록만 |
| `createdAt` | string(ISO) | (수정 없음 → updatedAt 불요) |

**품목별 현재고(`itemBalance`)** — 응답 편의(서버 산출, 클라이언트도 순수 함수로 동형 산출 가능):

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `itemId` | string | |
| `balance` | number | Σ(in) − Σ(out). 음수 허용 |

문자열 정규화(trim, 빈 문자열 → null)는 5a `normText`/5b `normMemo` 선례를 따른다. 숫자 문자열 draft는 M-10 `sanitizeDecimalInput`/`toRecipeNumber` 선례 재사용(수량·단가·금액).

## 사용자 스토리

1. 영농 사용자로서, 우리 농장에서 쓰는 농자재(요소비료·살균제·고추 종자 등)와 단위(kg·포·박스)를 품목으로 등록해, 입출고를 기록하고 싶다.
2. 영농 사용자로서, 비료 10포를 매입처에서 들여오면 입고로, 30kg을 밭에 썼으면 출고로 기록해, 지금 창고에 얼마가 남았는지(현재고)를 항상 확인하고 싶다.
3. 영농 사용자로서, 입고 거래에 어느 매입처에서 얼마(단가·금액)에 샀는지 연결해 두고, 나중에 거래처별로 다시 들여다보고 싶다.
4. 영농 사용자로서, 나중에 품목명·단위를 바꾸거나 거래처 상호가 바뀌어도 **과거 입출고 기록은 그대로 남아** 장부가 어긋나지 않기를 바란다.
5. 영농 사용자로서, 잘못 입력한 거래를 지우면 현재고가 자동으로 맞춰지길 바란다.
6. 함께 농장을 운영하는 팀원으로서, 동료가 기록한 같은 재고·거래 목록을 내 계정으로도 같이 보며 협업하고 싶다.

## 수용 기준 (AC)

### 현재고 산출 순수 함수 — 단위 테스트 (Vitest, `tests/unit/`)

AC-1. When `computeItemBalance(transactions)`를 호출하면, Then ① `[{type:'in',qty:100},{type:'out',qty:30}]` = 70, ② 입고만 `[{type:'in',qty:10}]` = 10, ③ 출고가 입고를 초과 `[{type:'in',qty:5},{type:'out',qty:8}]` = -3(음수 허용), ④ 빈 배열 = 0이다.

AC-2. When `computeBalances(transactions)`(여러 품목 혼합)를 호출하면, Then 품목별로 분리 집계되어 `itemId` → `balance` 맵이 반환된다(품목 A·B 거래가 섞여도 각각 정확히 합산).

AC-3. Given 수량·단가 문자열 draft, When `sanitizeDecimalInput`/`toRecipeNumber`(M-10 재사용)를 적용하면, Then `"10.5x"` → `"10.5"`, `toRecipeNumber("")` = 0, `toRecipeNumber("3.")` = 3으로 정규화된다.

### 계약 스키마 — 단위 테스트 (Vitest, zod)

AC-4. Given `inventoryItemSchema`/`createStockTransactionRequestSchema`, When 유효 값을 파싱하면 통과하고, Then ① 품목 `name`/`unit`이 빈 문자열이거나, ② 거래 `type`이 `in`/`out` 외 값(`"adjust"`)이거나, ③ `qty`가 0 이하이거나, ④ `txnDate`가 `YYYY-MM-DD` 형식이 아니거나, ⑤ `unitPrice`/`amount`가 음수인 생성 요청은 거부된다.

### 품목 CRUD — 핸들러 통합테스트 (`tests/integration/`, 로컬 Supabase 기동)

AC-5. (Given 유효한 세션 토큰) When `POST /api/inventory-items`에 `{ name, unit, category, memo, clientId }`로 품목을 생성한다 Then 200으로 `itemId`가 부여된 `inventoryItemSchema` 행이 반환되고 `active=true`, `created_by`가 인증 사용자로 기록된다.

AC-6. (Given 품목 2건 중 1건이 `active=false`) When `GET /api/inventory-items`를 호출한다 Then 기본은 `active=true`만 반환되고, `?includeInactive=true`면 비활성 행도 포함된다.

AC-7. (Given 기존 품목 1건) When `PATCH /api/inventory-items/:id`로 `name`·`unit`을 변경하면 변경 필드가 반영되고 `updatedAt`이 갱신되며, When `DELETE /api/inventory-items/:id`를 호출하면 물리 삭제되지 않고 `active=false`로 전환되어(소프트 비활성) 기본 목록에서 제외되고 `includeInactive=true`에서는 보인다.

### 입·출고 거래 CRUD + 거래처 연결 — 핸들러 통합테스트

AC-8. (Given 유효한 세션 토큰, 품목 1건·거래처 1건 존재) When `POST /api/stock-transactions`에 `{ itemId, type:'in', qty:100, txnDate, contactId, unitPrice, amount, clientId }`로 입고 거래를 생성한다 Then 200으로 `txnId`가 부여된 행이 반환되고, 서버가 `itemNameSnapshot`·`unitSnapshot`을 품목 마스터 현재값으로, `contactNameSnapshot`을 거래처 현재 상호로 채우며, `created_by`가 인증 사용자로 기록된다.

AC-9. (Given 거래처 미연결로 출고 거래 생성 `{ itemId, type:'out', qty:30, txnDate, clientId }`(contactId 없음)) When `POST /api/stock-transactions`를 호출한다 Then 200으로 거래가 생성되고 `contactId`·`contactNameSnapshot`이 null이다(거래처 연결은 선택 — 미연결 정상). 또한 `in`↔`buy`, `out`↔`sell` 정합을 위반하는 연결(예: `out` 거래에 `kind='buy'` 거래처)도 **차단 없이 200으로 허용**된다(정합 검증 느슨, 절충 2).

AC-10. (Given 같은 품목에 입고 100·출고 30 거래가 존재) When `GET /api/stock-transactions?itemId=...`로 품목별 거래 이력을 조회하고 `GET /api/item-balances`(또는 품목 목록 응답의 balance)로 현재고를 조회한다 Then 거래 이력은 `txn_date` 내림차순으로 반환되고 현재고는 70이며, `?from=&to=` 기간 필터 시 해당 기간 거래만 반환된다.

AC-11. (Given 입고 100·출고 30으로 현재고 70인 상태) When 출고 30 거래를 `DELETE /api/stock-transactions/:id`로 하드 삭제한다 Then 거래 행이 물리 삭제되고 그 품목 현재고가 100으로 자동 재계산되며(파생 — 별도 재계산 호출 불요), 이후 거래 이력에서 제외된다. (거래는 `PATCH` 미제공 — 수정 라우트 없음.)

### 무인증 게이트 — 통합테스트

AC-12. (Given 세션 토큰 없이) When 품목·거래의 mutate(`POST`·`PATCH`·`DELETE /api/inventory-items*`·`/api/stock-transactions*`)를 직접 호출한다 Then 핸들러가 401을 반환하고 어떤 행도 생성·변경·삭제·비활성되지 않는다(`requireUser` 게이트 — RLS 아님). `GET`(조회)은 인증 없이도 허용(5a·5b 선례).

### 스냅샷 보존 — 통합테스트 (회계 무결성, 절충 3)

AC-13. (Given 품목 A(name="요소", unit="포")로 입고 거래를 생성해 스냅샷이 박힌 상태) When 품목 A의 `name`을 "고급요소", `unit`을 "kg"로 `PATCH`하거나 품목 A를 비활성(`DELETE`)한 뒤 그 거래를 `GET`한다 Then 거래의 `itemNameSnapshot`="요소"·`unitSnapshot`="포"·`unitPrice`·`amount`가 그대로이고(마스터 변경 소급 안 됨), 단 현재고 계산에는 비활성 품목의 거래도 그대로 참여한다.

AC-14. (Given 거래처 C(상호="농협")를 연결한 거래가 존재) When 거래처 C의 상호를 변경하거나 거래처 C를 비활성(`DELETE /api/contacts/:id`)한 뒤 그 거래를 `GET`한다 Then 거래의 `contactNameSnapshot`="농협" 스냅샷이 그대로 조회된다(거래처 마스터 변경/비활성 소급 안 됨, 참조 무결).

### 소유/공유 스코프 — 전역 공유 검증

AC-15. (Given 사용자 A가 세션 토큰으로 품목 1건·거래 1건을 생성한 상태) When 사용자 B가 자기 세션 토큰으로 `GET /api/inventory-items`·`GET /api/stock-transactions`를 호출한다 Then 사용자 A가 만든 품목·거래가 B의 목록에 그대로 보인다(전역 공유 — `created_by`로 격리하지 않음).

### 클라이언트 뷰·시트·낙관 업데이트 — E2E (Playwright + mockApi)

AC-16. (Given 로그인 상태에서 품목 0건) When 사용자가 NavDrawer의 영농 PRO 섹션 "재고" 항목을 탭한다 Then 재고 뷰가 잠금/페이월 없이 열리고(게이팅 강제 없음), 빈 상태(EmptyState)와 "품목 추가" 진입점이 표시된다.

AC-17. (Given 품목 1건이 등록되고 입고 100·출고 30 거래가 기록된 상태) When 재고 뷰에서 그 품목 행을 본다 Then 품목명·단위와 함께 현재고 70이 표시된다. When 입고 거래를 추가하면 재조회 없이도 현재고가 즉시 증가하고(낙관 업데이트), 거래를 삭제하면 현재고가 즉시 줄어든다.

AC-18. (Given 입고 거래 작성 시트가 열리고 활성 거래처 1건이 존재) When 사용자가 품목·수량·일자를 입력하고 매입처를 선택한 뒤 "저장"한다 Then 시트가 닫히고 거래가 거래 이력 최상단(최신 일자순)에 즉시 나타나며(낙관), 거래처 상호가 거래에 표시된다. 거래처는 선택하지 않고도 저장할 수 있다(미연결 정상).

## 비범위

- **캘린더 (5d)** — 거래·일정의 달력 뷰.
- **PRO 게이팅·freemium 잠금·페이월·구독 (슬라이스 6)** — 진입점에 PRO 표식만, 강제 없음(5a 패턴 승계).
- **재고 평가액·원가법(이동평균·선입선출·총평균)·재고 회전율·재고 부족 알림** — 이번엔 수량 기준 현재고 + 단순 거래 이력·기간 필터까지만(절충 5).
- **월별 입출고 리포트·차트·재고 실사(조정 거래 전용 UI)·다품목 전표(한 거래로 여러 품목)** — 후속(절충 2·5).
- **바코드·QR 스캔 입출고** — 수기 입력만.
- **다창고(warehouse) 관리** — 단일 재고 풀(창고 구분 없음).
- **필지(`parcel`) 연결** — 어느 밭에 무엇을 썼는지 연결은 후속(5b와 동일 보류 — region 대용량 필지 연결 UX 비대). 이번 거래는 필지와 독립.
- **거래 수정(PATCH)** — 삭제 후 재생성으로 단순화(절충 5). 거래 수정 라우트·핸들러·UI 없음.
- **거래처 매입/매출 정합 강제** — `in`↔`buy`/`out`↔`sell` 차단·경고 없음(절충 2).
- **Realtime 동기화** — 단발 fetch + 낙관(5a 절충 3 승계). 채널 추가는 후속.
- **5a 인력·거래처, 5b 업무일지 마스터 변경** — 5c는 5a `contacts`를 외래 참조만(5a·5b 스키마·핸들러·계약 무변경). contacts에 신규 컬럼 추가 없음.
- **M-10 자동 계산기·5b 일당계산 변경** — 별 도메인(절충 6). `calcRecipes`·`src/features/calculator/`·`src/stores/worklog.ts` 무변경.
- **RLS 재도입** — 0002~0006 posture(OFF) 유지, 신규 테이블도 RLS OFF + 핸들러 `requireUser` 강제.

## 영향 범위

- 프론트: **frontend-dev 슬라이스.**
  - 신규 `src/features/erp/inventory/` — `InventoryView`(품목 목록 풀스크린 뷰 — 5a `StaffView`·5b `WorkLogView` 선례: 지도 대체 풀스크린 레이어, 품목 행 + 현재고 + "비활성 포함 보기" 토글 + "품목 추가" 진입점)·`InventoryItemSheet`(품목 작성/수정 — 공통 `Sheet` 래핑, 이름·단위·분류·메모)·`StockTransactionSheet`(입출고 거래 작성 — 품목·유형(입고/출고 `SegmentedControl`)·수량·일자·거래처 picker(선택)·단가·금액·메모)·`TransactionHistory`(품목별 거래 이력 — 일자순 거래 카드, 하드 삭제 `ConfirmInline`)·`ContactPickerSheet`(5a 활성 거래처 picker — 5b `StaffPickerSheet` 선례, 또는 시트 내 인라인 select). 순수 함수는 `src/utils/stockBalance.ts`(아래 별도). 생성/수정 draft 패턴(로컬 useState → 저장 버튼에서만 커밋, 5a·5b 선례). 숫자 입력은 M-10 `sanitizeDecimalInput`/`toRecipeNumber` 재사용. `EmptyState`·`ConfirmInline`·`SegmentedControl`·`Input`·`Button`·`ListRow` 공통 UI 재조립 — **신규 공통 UI 컴포넌트 없음 예상**(거래처 picker는 5a contacts 목록 — 디자이너 확인).
  - `src/utils/stockBalance.ts` — React 비의존 순수 함수(`computeItemBalance`·`computeBalances`) — 클라 미리보기·서버 현재고 권위 공유(`workLogCost.ts`·`override.ts` 선례). Vitest 단위 테스트 1:1.
  - `src/stores/` — 신규 `inventory.ts`(또는 `erp.ts`에 슬라이스 추가): `items[]`·`transactions[]` 상태 + `loadItems`/`createItem`/`updateItem`/`deactivateItem` + `loadTransactions(itemId?, range?)`/`createTransaction`/`deleteTransaction`(낙관, 롤백 없음 — 5a·5b 패턴 동형). 현재고는 selector(`computeBalances`)로 파생 — 별도 상태 저장 금지(절충 1). 거래처 상호 스냅샷 끌어옴은 5a `useErpStore.contacts`, 품목명/단위 끌어옴은 자기 `items` 참조. **시트 내부 편집은 로컬 draft, 저장에서만 스토어 커밋**(CONVENTIONS §3).
  - `src/features/tab/NavDrawer.tsx` — 영농 PRO 앰버 섹션에 "재고" `DrawerItem` 추가(인력·거래처·업무일지 항목과 나란히), ui 스토어 `openInventoryView` 배선.
  - `src/stores/ui.ts` — `inventoryViewOpen`·`openInventoryView`/`closeInventoryView`(5a `staffViewOpen`·5b `workLogViewOpen` 선례).
  - `src/lib/api.ts` — typed client에 `api.inventoryItems.{list,create,update,deactivate}`·`api.stockTransactions.{list,create,remove}`(+ 현재고 조회 — `list` 응답에 포함 또는 `api.itemBalances.list`) 추가(mutate 시 `clientId` + `Authorization: Bearer` 자동 주입 — 기존 패턴).
- 백엔드: **backend-dev 슬라이스.**
  - 신규 `server/handlers/inventoryItems.ts`·`server/handlers/stockTransactions.ts` — 런타임 비의존 순수 핸들러(req/res 직접 접근 금지). 컬렉션 핸들러(`GET`/`POST`)·아이템 핸들러(품목 `PATCH`/`DELETE`, 거래 `DELETE`만) 분리(5a `staff.ts`·5b `workLogs.ts` 선례). 모든 mutate에 `requireUser` 게이트 선적용(무인증 401·행 미기록). 품목 생성 시 `created_by=user.id`·`active=true`, `DELETE`는 `active=false` UPDATE(소프트 비활성). 거래 생성 시 `itemId`로 품목 마스터에서 `itemNameSnapshot`·`unitSnapshot` 조회 복사, `contactId` 지정 시 거래처 상호 조회해 `contactNameSnapshot` 복사(절충 3 — 5b `buildWorkerRows` 선례). 거래 `DELETE`는 하드 삭제. 현재고는 `computeBalances` 순수 함수로 거래 합산 산출(저장 안 함, 절충 1). `?itemId`·`?from`·`?to` 필터.
  - `server/handlers/ids.ts` — `genInventoryItemId`(`inv_<ts36><rand6>`)·`genStockTransactionId`(`stx_<ts36><rand6>`) 추가(5a `genStaffId`·5b `genWorkLogId` 선례).
  - `server/routes.ts` — 신규 라우트: `GET`/`POST /api/inventory-items`, `PATCH`/`DELETE /api/inventory-items/:id`, `GET`/`POST /api/stock-transactions`, `DELETE /api/stock-transactions/:id`, (현재고) `GET /api/item-balances` 또는 품목 목록 응답에 balance 포함(구현 결정 — 계약은 둘 다 수용). 세그먼트 수·메서드로 `matchRoute` 충돌 없음(5a·5b 선례). Vercel 단일 catch-all이라 추가 함수·`vercel.json` 변경 불요.
  - `tests/integration/inventoryItems.test.ts`·`tests/integration/stockTransactions.test.ts` — 품목 생성·목록·active 필터·수정·소프트삭제·재활성화 / 거래 생성(스냅샷·거래처 연결·미연결·정합 느슨)·목록(itemId·기간 필터)·하드삭제+현재고 재계산·무인증 401·스냅샷 보존(품목/거래처 변경·비활성 후 불변)·전역 공유(AC-5~15 매핑). 로컬 Supabase 기동 필요.
- DB: **마이그레이션 필요** — 신규 `supabase/migrations/0007_erp_inventory.sql`(비파괴).
  - 신규 테이블 `public.inventory_items`(item_id text PK·name text NOT NULL·unit text NOT NULL·category text·memo text·active boolean DEFAULT true·created_by uuid REFERENCES auth.users·created_at·updated_at)·`public.stock_transactions`(txn_id text PK·item_id text NOT NULL REFERENCES inventory_items(item_id)·item_name_snapshot text NOT NULL·unit_snapshot text NOT NULL·type text CHECK in (in,out)·qty numeric NOT NULL·txn_date date NOT NULL·contact_id text REFERENCES contacts(contact_id) ON DELETE SET NULL·contact_name_snapshot text·unit_price numeric·amount numeric·memo text·created_by uuid REFERENCES auth.users·created_at).
  - `created_by`는 슬라이스 2/5a/5b 신원 컬럼 패턴 동일(nullable uuid — 격리 아님). 에코 가드 `updated_by`(clientId) 미도입(Realtime 비범위). `clientId`는 계약 바디에만 포함.
  - 인덱스: `stock_transactions(item_id)`(품목별 이력·현재고 합산)·`stock_transactions(txn_date DESC)`(목록 정렬)·`inventory_items(active)` 부분 인덱스(목록 조회) 선택.
  - **RLS 미도입** — 0002~0006 posture 유지, 신규 두 테이블도 `DISABLE ROW LEVEL SECURITY`. Realtime publication 등록 안 함(절충 0).
  - 기존 행·기존 테이블(`contacts`·`staff`·`work_logs` 포함) 무변경(완전 신설 — 비파괴). `contact_id` FK는 참조만(거래처 소프트 비활성이라 행이 살아 있어 무결).
- API 계약: **신규** — `src/types/api/inventoryItems.ts`·`src/types/api/stockTransactions.ts`.
  - `inventoryItemSchema`·`stockTransactionSchema`·`itemBalanceSchema`(위 엔티티 필드), 목록 응답(`z.array`), `createInventoryItemRequestSchema`/`updateInventoryItemRequestSchema`/`createStockTransactionRequestSchema`/`deleteStockTransactionRequestSchema`(`mutationBodySchema.extend` — `clientId` 포함, 5a·5b 선례). 거래 입력 라인은 `itemId`·`type`·`qty`·`txnDate`·`contactId?`·`unitPrice?`·`amount?`·`memo?`만(`itemNameSnapshot`·`unitSnapshot`·`contactNameSnapshot`은 서버 산출). `type`은 `z.enum(['in','out'])`, `qty`는 `z.number().positive()`, `txnDate`는 `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`, `unitPrice`/`amount`는 `z.number().nonnegative().nullable().optional()`. 401·400은 기존 `errorResponseSchema` 재사용. 프론트 클라이언트와 핸들러가 같은 스키마를 import(`z.infer`).

## 디자인 근거 (Stage 2 ui-designer 인계)

- Pencil 추적 파일 `design/new-design-v3.pen`. 후보 프레임: PC 보드 `m6wBu7` ⑧재고. 5a `rFIAH`·5b `AL2JL` 보드 디자인 언어 따라(PRO 앰버 `--color-pro`).
- **확인 필요(이번 Stage 1에서 Pencil MCP 미접근)**: ui-designer는 위 보드에서 재고 화면이 실제로 존재하는지 확인하고, 없으면 신규 작성·신고한다(5a·5b 보드 디자인 언어 따라). 필요한 프레임: 재고 품목 목록 뷰(품목 행 + 현재고 배지 + "비활성 포함 보기" 토글 + "품목 추가" 진입점 + EmptyState)·품목 작성/수정 시트(이름·단위·분류·메모)·입출고 거래 작성 시트(품목 선택·입고/출고 SegmentedControl·수량·일자·거래처 picker(선택)·단가·금액·메모)·품목별 거래 이력(일자순 거래 카드: 입고/출고 표식·수량·단위·거래처 상호·금액 + 하드삭제 ConfirmInline). 모바일 BottomSheet/와이드 비모달 SidePanel(공통 `Sheet` 컨테이너). NavDrawer 영농 PRO 앰버 섹션에 "재고" 진입점 추가(인력·거래처·업무일지와 나란히).
