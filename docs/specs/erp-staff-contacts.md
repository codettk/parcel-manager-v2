# 영농 ERP — 인력·거래처 마스터 (슬라이스 5a)

- 상태: 구현 완료 (게이트 green)
- 매핑: 신규 (필지 전국 전환 로드맵 슬라이스 5 영농 ERP의 첫 sub-슬라이스 5a — `docs/specs/pilji-roadmap.md`. M-1~M-18 매핑표 밖)
- 판정:
  - **인력·거래처 ERP 도메인**: 신규 (v2 코어 M-1~16·슬라이스 1~4 위에 얹는 PRO 콘텐츠. v1에 없던 개념 — 보존 대상 아님).
  - **지도 코어·시트 컨테이너·인증·Realtime(M-1~16, 슬라이스 1~4)**: 보존 (이번 슬라이스는 NavDrawer 진입점·신규 도메인 시트·신규 테이블만 추가, 기존 경로 무변경).

## 배경 / 절충 (반드시 후속 단계가 인지)

이 슬라이스는 영농 ERP(슬라이스 5)의 **기반 엔티티**다. 향후 5b(업무일지·일당계산)·5c(재고)·5d(캘린더)가 인력·거래처를 외래 참조한다. 그러나 **이번 슬라이스는 마스터 CRUD까지만** — 참조하는 하위 기능은 전부 후속이다. 5개 설계 난제를 아래 확정값으로 못박는다(후속 단계는 이 확정값에 1:1 종속).

### 절충 1 — 소유/공유 스코프 → **확정: 전역 공유 (`created_by` 신원만 부착, 격리 없음)**

슬라이스 2(`auth-accounts`)의 데이터 모델은 **작업공간 멤버십(협업 보존)**으로 확정됐다. 현재 "작업공간"은 region 전환과 무관한 **단일 공유 `tabs` 구조**이며, 로그인 사용자는 디폴트로 그 공유 작업공간의 멤버다(슬라이스 2 결정 2). 사용자별 데이터 격리는 폐기됐다.

→ 인력·거래처도 **같은 협업 모델을 따른다**: 전역 공유 마스터(로그인한 모든 멤버가 같은 인력·거래처 목록을 본다) + 행에 신원(`created_by`) 부착. 과설계 회피 차원에서:

- 인력·거래처를 **`tab_id`(작업공간)에도, `region_id`에도, 사용자(`created_by`) 격리에도 매달지 않는다.** 전역 단일 테이블이다. 근거: (a) 영농 ERP는 "한 농장/한 팀"이 함께 쓰는 데이터이고 현재 멤버십 모델이 이미 전역 단일 공유이므로 가장 단순하고 정합적. (b) `tab_id`에 매달면 탭(작업공간) 전환·소프트클로즈 시 인력이 사라지는 부자연스러움 발생. (c) `region_id`에 매달면 일꾼이 지역마다 중복 등록되어야 함. (d) `created_by` 격리는 슬라이스 2에서 이미 폐기된 모델.
- `created_by uuid REFERENCES auth.users` 컬럼만 부착(누가 만들었는지 신원 기록 — 기존 4테이블 패턴 동일). 조회·수정·삭제에 `created_by` **필터를 걸지 않는다**(전역 공유).
- 향후 farm/org 다중 테넌트 개념이 도입되면 nullable `org_id` 컬럼을 비파괴로 추가하는 확장 경로를 남긴다(이번 슬라이스 미도입).

### 절충 2 — PRO 게이팅 비범위 경계 → **확정: 기능·데이터·UI는 만들되 freemium 잠금 강제 안 함**

PRO 권한 게이팅·페이월·구독은 **슬라이스 6**이다. 이 슬라이스는 인력·거래처 CRUD를 완전히 동작시키되 잠금을 강제하지 않는다. 단 슬라이스 6이 얹을 수 있게 **구조만 남긴다**:

- 진입점은 NavDrawer에 **"PRO" 섹션**(또는 PRO 표식이 달린 항목)으로 배치한다 — 무료 코어 항목(지역 관리·히스토리·필지 목록 등)과 시각적으로 구분된 별도 섹션. PRO 강조색은 앰버 `#D69021`(pivot 메모).
- 게이팅 강제(탭 차단·페이월 리다이렉트)는 **하지 않는다.** 현 단계에서는 로그인한 모든 사용자가 PRO 섹션·인력·거래처에 접근 가능하다.
- 슬라이스 6이 진입점·라우트에 권한 가드를 **얹을 자리**(PRO 섹션이라는 식별 가능한 경계)만 만든다.

### 절충 3 — Realtime 필요성 → **확정: 비범위 (단발 fetch + 낙관 업데이트로 시작)**

M-6 Realtime 채널은 지도 협업(필지 색칠 동시 편집)의 즉시성이 핵심이라 도입됐다. 인력·거래처는 마스터 데이터로 동시 편집 충돌·즉시 반영 요구가 낮다. 과설계 회피 차원에서 **이번 슬라이스는 Realtime 채널을 추가하지 않는다**:

- 시트/목록을 열 때 `GET`으로 조회하고, 생성·수정·삭제는 낙관 업데이트(롤백 없음 — v2 보존 패턴)로 반영한다.
- 다른 멤버의 변경은 다음 목록 진입(재조회) 시 반영된다.
- Realtime 동기화는 필요가 입증되면 후속 슬라이스에서 채널을 추가한다(비파괴 — `0001_v2_schema.sql`의 publication 등록 패턴 재사용 가능).

### 절충 4 — 삭제 정책 → **확정: 소프트 비활성 (`active=false`), 하드 삭제 없음**

5b(일당계산이 가리키는 인력)·5c(재고 거래처)가 향후 외래 참조하므로 하드 삭제는 참조 무결성을 깬다. 마스터 데이터의 표준 패턴인 **소프트 비활성**을 채택한다:

- "삭제" UI는 실제로는 `active=false`로 비활성화한다(행 보존). 일꾼이 그만뒀거나 거래를 끊은 거래처를 목록에서 감추되 과거 기록(향후 5b/5c)이 가리키는 참조는 보존.
- 기본 목록 조회는 `active=true`만 반환한다. "비활성 포함 보기" 토글로 비활성 행도 열람·재활성화 가능.
- 하드 삭제(`DELETE`로 행 제거)는 이번 슬라이스 미제공(후속 — 참조 정리 정책이 정해진 뒤).

### 엔티티 필드 (zod 계약으로 확정)

**인력(`staff`)** — 5b 일당계산이 참조할 최소 필드 포함, 과설계 회피:

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `staffId` | string | 서버 생성 ID |
| `name` | string (min 1) | 이름 (필수) |
| `phone` | string \| null | 연락처 |
| `role` | string \| null | 역할/직종 (자유 텍스트 — 예: "트랙터 기사", "일용직") |
| `dailyWage` | number(int ≥0) \| null | 일당 기본값(원). 5b 일당계산 기본값 |
| `memo` | string \| null | 메모 |
| `active` | boolean | 활성 여부 (소프트 비활성, 기본 true) |
| `createdAt` / `updatedAt` | string(ISO) | |

**거래처(`contact`)** — 5c 재고 거래처가 참조할 최소 필드:

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `contactId` | string | 서버 생성 ID |
| `name` | string (min 1) | 상호 (필수) |
| `manager` | string \| null | 담당자 |
| `phone` | string \| null | 연락처 |
| `kind` | `'buy' \| 'sell' \| 'both'` | 구분(매입/매출/둘 다) |
| `memo` | string \| null | 메모 |
| `active` | boolean | 활성 여부 (기본 true) |
| `createdAt` / `updatedAt` | string(ISO) | |

문자열 정규화(trim, 빈 문자열 → null)는 기존 `GroupSheet.handleSave` 선례를 따른다.

## 사용자 스토리

1. 영농 사용자로서, 우리 농장에서 일하는 일꾼들(이름·연락처·직종·일당)을 한 곳에 등록·관리해, 나중에 업무일지·일당계산에서 골라 쓰고 싶다.
2. 영농 사용자로서, 자주 거래하는 매입처·매출처(상호·담당자·연락처·구분)를 등록해 두고, 나중에 재고·정산에서 참조하고 싶다.
3. 영농 사용자로서, 그만둔 일꾼이나 끊긴 거래처를 목록에서 감추되(비활성) 과거 기록은 잃지 않고, 필요하면 다시 활성화하고 싶다.
4. 함께 농장을 운영하는 팀원으로서, 동료가 등록한 같은 인력·거래처 목록을 내 계정으로도 그대로 보며 협업하고 싶다.

## 수용 기준 (AC)

### 인력 CRUD — 핸들러 통합테스트

AC-1. (Given 유효한 세션 토큰) When `POST /api/staff`에 `{ name, phone, role, dailyWage, memo, clientId }`로 인력을 생성한다 Then 201(또는 200)으로 `staffId`가 부여된 `staffSchema` 행이 반환되고 `active`가 `true`, `created_by`가 인증 사용자 user_id로 기록된다.

AC-2. (Given 인력 2건이 존재하고 그중 1건이 `active=false`) When `GET /api/staff`를 호출한다 Then 기본적으로 `active=true` 행만 반환되고, `GET /api/staff?includeInactive=true`를 호출하면 비활성 행도 포함해 반환된다.

AC-3. (Given 기존 인력 1건) When `PATCH /api/staff/:id`로 `name`·`dailyWage`를 변경한다 Then 변경 필드가 반영된 행이 반환되고 `updatedAt`이 갱신된다.

AC-4. (Given `active=true` 인력 1건) When `DELETE /api/staff/:id`를 호출한다 Then 행이 물리적으로 삭제되지 않고 `active=false`로 전환되며(소프트 비활성), 이후 기본 `GET /api/staff`에서 제외되고 `includeInactive=true`에서는 보인다.

AC-5. (Given 세션 토큰 없이) When `POST`·`PATCH`·`DELETE /api/staff*` mutate를 직접 호출한다 Then 핸들러가 401을 반환하고 어떤 행도 생성·변경·비활성되지 않는다(`requireUser` 게이트 — RLS 아님).

### 거래처 CRUD — 핸들러 통합테스트

AC-6. (Given 유효한 세션 토큰) When `POST /api/contacts`에 `{ name, manager, phone, kind, memo, clientId }`로 거래처를 생성한다 Then `contactId`가 부여된 `contactSchema` 행이 반환되고 `kind`가 요청값(`buy|sell|both`), `active=true`, `created_by`가 인증 사용자로 기록된다.

AC-7. (Given `kind`가 잘못된 값(예: `"xyz"`)인 생성 요청) When `POST /api/contacts`를 호출한다 Then zod 검증 실패로 400이 반환되고 행이 생성되지 않는다.

AC-8. (Given 거래처 목록에 `active=true` 1건·`active=false` 1건) When `GET /api/contacts`(기본)와 `GET /api/contacts?includeInactive=true`를 각각 호출한다 Then 기본은 활성만, includeInactive는 둘 다 반환한다.

AC-9. (Given `active=false` 거래처 1건) When `PATCH /api/contacts/:id`로 `active=true`를 전송한다 Then 재활성화되어 기본 목록에 다시 포함된다.

AC-10. (Given 세션 토큰 없이) When 거래처 mutate(`POST`/`PATCH`/`DELETE`)를 직접 호출한다 Then 401을 반환하고 어떤 행도 변경되지 않는다.

### 소유/공유 스코프 — 전역 공유 검증

AC-11. (Given 사용자 A가 세션 토큰으로 인력 1건을 생성한 상태) When 사용자 B가 자기 세션 토큰으로 `GET /api/staff`를 호출한다 Then 사용자 A가 만든 인력이 B의 목록에 그대로 보인다(전역 공유 — `created_by`로 격리하지 않음). 거래처도 동일하게 검증한다.

### 클라이언트 목록·시트·낙관 업데이트 — E2E

AC-12. (Given 로그인 상태에서 인력 0건) When 사용자가 NavDrawer의 PRO 섹션 "인력" 항목을 탭해 인력 시트/뷰를 연다 Then 빈 상태(EmptyState)와 "추가" 진입점이 표시된다.

AC-13. (Given 인력 시트가 열린 상태) When 사용자가 "추가"로 이름·일당을 입력하고 저장한다 Then 시트를 닫지 않거나 재조회 없이도 새 인력이 목록에 즉시 나타난다(낙관 업데이트). 거래처도 동일 패턴으로 검증한다.

AC-14. (Given 활성 인력 1건이 목록에 있는 상태) When 사용자가 그 인력을 "삭제(비활성)" 한다 Then 기본 목록에서 즉시 사라지고(낙관), "비활성 포함 보기"를 켜면 비활성 표식과 함께 다시 보이며 재활성화 진입점이 제공된다.

AC-15. (Given NavDrawer가 열린 상태) When 인력·거래처 진입점이 렌더된다 Then 두 항목이 PRO 표식(앰버 `#D69021`)이 있는 별도 섹션에 배치되되, 탭하면 잠금/페이월 없이 곧바로 해당 시트/뷰가 열린다(게이팅 강제 없음 — 슬라이스 6 자리).

## 비범위

- **PRO 게이팅·freemium 잠금·페이월·구독·결제 (슬라이스 6).** 이번엔 진입점에 PRO 표식만 두고 강제하지 않는다.
- **업무일지·일당계산 (5b)** — 인력 `dailyWage`를 참조하는 계산 로직 일체.
- **재고 (5c)** — 거래처를 참조하는 입출고·재고 트랜잭션.
- **캘린더 (5d).**
- **Realtime 동기화** — 단발 fetch + 낙관으로 시작(절충 3). 채널 추가는 후속.
- **하드 삭제·참조 무결성 정리** — 소프트 비활성만(절충 4). 물리 삭제·캐스케이드 정리는 후속.
- **다중 테넌트(farm/org) 분리·인력↔거래처 간 연결·인력 출근/근태·거래처 거래 내역** — 전부 후속.
- **CSV/엑셀 가져오기·내보내기, 검색·정렬·페이지네이션 고도화** — 이번엔 단순 목록(활성/비활성 토글)만.
- **RLS 재도입** — 0002/0003/0004 posture(OFF) 유지, 신규 테이블도 RLS OFF + 핸들러 `requireUser` 강제.

## 영향 범위

- 프론트: **frontend-dev 슬라이스.**
  - 신규 `src/features/erp/` — `StaffSheet`(또는 `StaffView`)·`ContactSheet`(공통 `Sheet` 래핑 — 뷰포트별 BottomSheet/SidePanel 자동), `StaffRow`·`ContactRow`(공통 `ListRow` 조립), 생성/수정 draft 패턴(로컬 useState → 저장 버튼에서만 커밋, `GroupSheet` 선례), "비활성 포함 보기" 토글·재활성화 진입점, `EmptyState`·`ConfirmInline`(비활성 확인) 공통 UI 재사용. `kind` 선택은 공통 `SegmentedControl` 재사용.
  - `src/stores/` — 신규 `erp.ts`(또는 `workspace.ts`에 슬라이스 추가): `staff[]`·`contacts[]` 상태 + `loadStaff`/`createStaff`/`updateStaff`/`deactivateStaff`(낙관) + 거래처 동형. **시트 내부 편집은 로컬 draft, 저장에서만 스토어 커밋**(CONVENTIONS §3).
  - `src/features/tab/NavDrawer.tsx` — 신규 **PRO 섹션**에 "인력"·"거래처" `DrawerItem` 추가(앰버 표식), ui 스토어 `openStaff`/`openContacts`(또는 `erpOpen` 분기).
  - `src/stores/ui.ts` — 인력/거래처 시트 열림 상태(`staffOpen`·`contactsOpen` 또는 `erpView`).
  - `src/lib/api.ts` — typed client에 `api.staff.{list,create,update,deactivate}`·`api.contacts.*` 추가(mutate 시 `clientId` + `Authorization: Bearer` 자동 주입 — 기존 패턴).
- 백엔드: **backend-dev 슬라이스.**
  - 신규 `server/handlers/staff.ts`·`server/handlers/contacts.ts` — 런타임 비의존 순수 핸들러(req/res 직접 접근 금지). 컬렉션 핸들러(`GET`/`POST`)·아이템 핸들러(`PATCH`/`DELETE`) 분리(`tabs.ts`·`regions.ts` 선례). 모든 mutate에 `requireUser` 게이트 선적용(무인증 401·행 미기록). 생성 시 `created_by = user.id` 주입. `DELETE`는 `active=false` UPDATE로 구현(소프트 비활성). 기본 목록은 `active=true` 필터, `?includeInactive=true`면 전량.
  - `server/routes.ts` — 신규 라우트: `GET`/`POST /api/staff`, `PATCH`/`DELETE /api/staff/:id`, `GET`/`POST /api/contacts`, `PATCH`/`DELETE /api/contacts/:id`(세그먼트 수·메서드로 충돌 없음 — `matchRoute` 규약 준수). Vercel 단일 catch-all이라 추가 함수·`vercel.json` 변경 불요.
  - `tests/integration/` — `staff.test.ts`·`contacts.test.ts`(생성·목록·active 필터·수정·소프트삭제·재활성화·무인증 401·전역 공유 격리없음 — AC-1~11 매핑). 로컬 Supabase 기동 필요.
- DB: **마이그레이션 필요** — 신규 `supabase/migrations/0005_erp_staff_contacts.sql`(비파괴).
  - 신규 테이블 `public.staff`(staff_id·name NOT NULL·phone·role·daily_wage int·memo·active boolean DEFAULT true·created_by uuid REFERENCES auth.users·created_at·updated_at)·`public.contacts`(contact_id·name NOT NULL·manager·phone·kind text CHECK in (buy,sell,both)·memo·active boolean DEFAULT true·created_by·created_at·updated_at).
  - `created_by`는 슬라이스 2 신원 컬럼 패턴 동일(nullable uuid REFERENCES auth.users — 격리 아님, 신원 기록만). **에코 가드 `updated_by`(clientId)는 도입하지 않는다**(Realtime 비범위 — 절충 3). 다만 `clientId`는 계약 바디에 포함(typed client mutate 규약·향후 Realtime 도입 대비).
  - `active=true` 부분 인덱스(목록 조회 최적화) 선택.
  - **RLS 미도입** — 0002~0004 posture 유지, 신규 두 테이블도 `DISABLE ROW LEVEL SECURITY`(정책 0개 + RLS ON이면 anon 차단되므로). Realtime publication 등록 안 함(절충 3).
  - 기존 행·기존 테이블 무변경(완전 신설 — 비파괴).
- API 계약: **신규** — `src/types/api/staff.ts`·`src/types/api/contacts.ts`.
  - `staffSchema`·`contactSchema`(위 엔티티 필드), 목록 응답(`z.array`), `createStaffRequestSchema`/`updateStaffRequestSchema`(`mutationBodySchema.extend` — `clientId` 포함, `tabs.ts` 선례), 거래처 동형. `kind`는 `z.enum(['buy','sell','both'])`. 401은 기존 `errorResponseSchema` 재사용. 프론트 클라이언트와 핸들러가 같은 스키마를 import(`z.infer`).

## 디자인 근거 (Stage 2 ui-designer 인계)

- Pencil 추적 파일 `design/new-design-v3.pen`. 후보 프레임: PC 보드 `m6wBu7` ③인력 ⑦거래처, 모바일 보드 `kcXpg` ⑩더보기(무료/PRO 메뉴)·⑤홈(PRO 업셀).
- **확인 필요(이번 Stage 1에서 Pencil MCP 미접근)**: ui-designer는 위 보드에서 인력·거래처 화면이 실제로 존재하는지 확인하고, 없으면 신규 작성·신고한다. NavDrawer PRO 섹션 진입점(앰버 `#D69021` 표식)과 인력·거래처 시트(공통 `Sheet` 컨테이너, 모바일 BottomSheet/와이드 비모달 SidePanel) 프레임 필요.
