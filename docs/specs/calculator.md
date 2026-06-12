# 자동 계산기 (설정·결과·개별/그룹 전환)

- 상태: 검토 대기
- 매핑: M-10 (`CalculatorSettingsSheet.jsx` + `CalculatorResultSheet.jsx` + `app.jsx` calcRecipes/calculator_active → `src/features/calculator/`)
- 판정: 재설계 (계산 의미론·문자열 draft·개별/그룹 전환은 v1 보존, **저장소는 localStorage+서버 이중 소스 → 서버 단일 소스로 재설계** — Phase 3 `api.calcRecipes` 계약 활용, `z.unknown()` 계약을 구체 스키마로 확정)

## 판정 상세 (선별적 포팅)

| 구분   | 항목                                                                                                                                                         | 근거                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 보존   | 레시피 의미론: "기준 면적(baseArea+baseUnit)당 투입량(amount+amountUnit)" — 예) 300㎡당 석회 300L                                                            | v1 `CalculatorSettingsSheet` 데이터 모델                                                                                                                  |
| 보존   | 계산식: `결과 = (면적㎡을 baseUnit으로 환산 ÷ baseArea) × amount`, `baseArea ≤ 0`이면 0                                                                      | v1 `CalculatorResultSheet` `areaInUnit`·결과식 전수 확인                                                                                                  |
| 보존   | 문자열 draft 패턴: 숫자 필드를 문자열로 보관해 trailing dot(`"1."`) 입력 중간 상태 허용, 입력 시 `[^0-9.]` 제거, 저장 시 `parseFloat ∥ 0`                    | 명세서 M-10 "문자열 draft(소수점 입력) 패턴 유지"                                                                                                         |
| 보존   | 추가 기본값 `{ baseArea: '300', baseUnit: '㎡', amount: '0', amountUnit: 'L' }`, 자재명 12자·투입 단위 6자 제한, 단위 추천 목록(kg·g·L·mL·포대·주·개·t)      | v1 `addRecipe`·input 제약                                                                                                                                 |
| 보존   | 결과 포맷: 정수면 `toLocaleString('ko')`, 소수면 최대 2자리. 이름 빈 레시피는 `(이름 없음)` 표기                                                             | v1 결과 행 포맷                                                                                                                                           |
| 보존   | 계산기 모드 중 필지 탭은 **그룹 소속이어도 개별 필지로 취급** → 결과 시트 직행 (그룹 시트 분기 비경유)                                                       | v1 `app.jsx:244` `viewRef.current !== 'calculator_active'` 가드                                                                                           |
| 보존   | 개별/그룹 전환: 그룹 소속 필지면 토글 표시 + **기본 '그룹 전체'**, 그룹 면적 = 면적 known 멤버 합산(전원 null이면 null). 비소속이면 토글 미표시              | v1 `calcMode` 초기값·`calcGroupAreaM2` 산출                                                                                                               |
| 보존   | 그룹 모드 전환 시 지도에서 그룹 강조(selectedGroupId 설정), 개별 전환 시 해제                                                                                | v1 `onCalcModeChange`                                                                                                                                     |
| 보존   | 면적 null 안내: "면적 정보가 없습니다. V-World에서 토지 정보를 먼저 조회해주세요." / 레시피 0개 안내: "설정된 계산 항목이 없습니다."                         | v1 `calcNoAreaMsg`·`calcEmptyMsg` — 로컬 DB는 `lndpcl_ar` 전부 null이므로 V-World 적재(M-13) 전까지 이 경로가 기본 동작                                   |
| 보존   | 표시 단위(`ui.areaUnit`) 토글은 **면적 표기에만** 영향 — 계산은 항상 ㎡ 원본을 레시피별 baseUnit으로 환산해 수행, 결과값 불변                                | v1 동작 (계산은 `r.baseUnit` 기준, 표시만 `areaUnit`)                                                                                                     |
| 보존   | 설정 시트 "저장" = 저장 후 닫기, "계산 시작" = 저장 + 계산기 모드 진입. X/backdrop 닫기 = draft 폐기(저장 안 함)                                             | v1 `handleSave`/`handleStart` + draft 패턴 (CONVENTIONS §3)                                                                                               |
| 보존   | `baseUnit` 저장 값은 단위 **라벨**(`'㎡'│'평'│'a'│'ha'`)                                                                                                     | v1 데이터 호환 — §8.1 시드가 `app_config.calc_recipes`를 무변환 복사하므로 v1 저장 형식을 스키마로 수용                                                   |
| 재설계 | **저장소**: localStorage `bogugot_calc_recipes` 캐시 + 서버 이중 소스 → `api.calcRecipes` get/put **서버 단일 소스**                                         | v1도 이미 `app_config` 공유 저장이 권위 소스(전 사용자 공유가 v1 의도) — localStorage는 서버 도입 이전 잔재이자 "서버 비면 로컬 유지" 가드 등 이중화 부채 |
| 재설계 | **스키마**: `calcRecipesValueSchema = z.unknown()` → 구체 배열 스키마 (아래) — PUT 본문 검증이 실질화됨                                                      | Phase 3에 예고된 확정 시점이 본 건 (calcRecipes.ts 주석의 "M-14"는 M-10 오기)                                                                             |
| 재설계 | 레시피 id 생성: `'r_' + Date.now()` → `crypto.randomUUID()`                                                                                                  | 동일 ms 연속 추가 시 충돌 가능 — id는 불투명 문자열이라 스키마·시드 영향 없음                                                                             |
| 재설계 | 진입점: v1 NavDrawer "자동 계산기" → **임시 진입 IconButton** (지도 우상단, 릴리즈 노트·목록 선례). 계산기 모드 표시: v1 TopBar 배지 → 플로팅 배지+종료 버튼 | v2에 NavDrawer·TopBar 없음 — 드로어 도입 시 이전 (주석 명시)                                                                                              |
| 재설계 | 인라인 스타일 → `Sheet`·`Input`(decimal)·`SegmentedControl`(모드·단위 토글)·`Badge`·`Button`·`IconButton`·`AreaText` + 토큰                                  | Phase 1 공통 UI 재조립                                                                                                                                    |
| 재설계 | 전역 `view` 문자열(`'calculator_settings'│'calculator_active'`) → `ui` 스토어 boolean/시트 상태                                                              | v1 단일 view 문자열 구조의 산물                                                                                                                           |
| 폐기   | localStorage 캐시·복원·"서버 응답이 비면 로컬 유지" 가드 (`recipes.length > 0` 조건 동기화)                                                                  | 단일 소스화로 원인 소멸 — GET null = 빈 배열                                                                                                              |
| 폐기   | 앱 부팅 시 무조건 `/api/calc-recipes` GET                                                                                                                    | 계산기 모드는 설정 시트의 "계산 시작"으로만 진입 → 설정 시트 열 때 GET이면 충분                                                                           |

## 사용자 스토리

1. 농지 작업자는 자재별 레시피("300㎡당 석회 300L")를 한 번 설정해 두고, 지도에서 필지를 탭하면 그 필지 면적에 필요한 투입량을 즉시 확인한다.
2. 그룹으로 묶인 농지를 작업할 때는 그룹 전체 면적 기준 총량과 개별 필지 기준 양을 토글로 오가며 확인한다.
3. 레시피는 서버에 저장되어 공동체 전원이 같은 계산 기준을 공유한다.

## 동작 명세

### 레시피 zod 스키마 (`src/types/api/calcRecipes.ts` 갱신 — 계약 확정)

```ts
/** v1 app_config.calc_recipes 저장 형식 호환 — baseUnit은 단위 라벨로 저장 (§8.1 시드 무변환) */
export const calcRecipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(12), // 빈 문자열 허용 — 결과에서 '(이름 없음)'
  baseArea: z.number().nonnegative(),
  baseUnit: z.enum(['㎡', '평', 'a', 'ha']),
  amount: z.number().nonnegative(),
  amountUnit: z.string().max(6),
})
export type CalcRecipe = z.infer<typeof calcRecipeSchema>

export const calcRecipesValueSchema = z.array(calcRecipeSchema)
// GET 응답: recipes: calcRecipesValueSchema.nullable()  (미설정 시 null — 기존 계약 유지)
// PUT 요청: recipes: calcRecipesValueSchema  (mutationBodySchema.extend — clientId 포함 기존 유지)
```

- `z.unknown()` → 구체화는 하위 호환 (기존 핸들러는 value 통과 저장 — **코드 무변경**, PUT 검증만 강화됨).
- 프론트 보관: `stores/workspace.ts`에 `calcRecipes: CalcRecipe[]` + 로드/저장 액션 (전 탭 공유 설정 — `colorLabels` 선례). Realtime 채널 없음 — 설정 시트 열 때마다 GET으로 최신화 (v1 보존).

### 계산 순수 함수 (`src/features/calculator/calc.ts` — React 비의존)

- `sanitizeDecimalInput(s)`: `[^0-9.]` 제거 (v1 입력 필터).
- `toRecipeNumber(s)`: `parseFloat(s) || 0`.
- `areaInUnit(m2, baseUnit)`: 라벨 기준 환산 — 평 `×0.3025`, a `÷100`, ha `÷10000`, ㎡ 그대로 (v1 `areaInUnit` 보존 — `formatArea.ts`의 convert와 같은 계수, 라벨 키 입력이라 별도 함수).
- `computeRecipeAmount(recipe, areaM2)`: `baseArea > 0 ? (areaInUnit(areaM2, baseUnit) / baseArea) * amount : 0`.
- `formatRecipeAmount(n)`: 정수면 `toLocaleString('ko')`, 아니면 `maximumFractionDigits: 2`.

### 설정 시트 (`CalculatorSettingsSheet.tsx`)

- 진입: 지도 우상단 임시 IconButton(계산기 아이콘) 탭 → 시트 열림 + `api.calcRecipes.get()` 호출, 응답(null이면 `[]`)으로 스토어 갱신 후 draft 초기화 (`baseArea`/`amount`는 `String()` 변환 — 문자열 draft).
- 행 구성: 자재명 `Input`(maxLength 12) · 기준면적 숫자 `Input`(`inputMode="decimal"`, focus 시 전체 선택, 입력마다 sanitize) · baseUnit 셀렉트(㎡/평/a/ha) · "당" · 투입량 숫자 `Input`(동일 패턴) · 투입 단위 `Input`(maxLength 6, datalist 추천) · 행 삭제 버튼.
- "+ 항목 추가": 기본값 행 추가 (`id: crypto.randomUUID()`).
- "저장": draft → 숫자 변환 → `api.calcRecipes.put({ recipes })` + 스토어 반영 + 시트 닫기. "계산 시작": 저장 동작 + 계산기 모드 진입. X/backdrop: draft 폐기.

### 계산기 모드 (`ui` 스토어)

- `calculatorActive: boolean` + 진입/종료 액션. 진입 시 멀티선택·추가모드 해제, pending 그룹 드래프트 원복, 열린 시트·선택 해제 (`openListView` 선례 — 모드 충돌 차단).
- 모드 중 플로팅 배지 "계산기" + "종료" 버튼 상시 표시 (v1 TopBar 배지 대체). 종료 = 모드 해제 + 선택·결과 시트 해제.
- `tapParcel` 분기 추가: `calculatorActive`이면 멀티선택·추가모드·그룹 분기를 모두 건너뛰고 — ① 필지 탭(그룹 소속 포함) → `selectedParcelId` 설정 + 결과 시트 열림, ② 빈 곳 탭 → 결과 시트 닫힘(선택 해제), **모드는 유지**.

### 결과 시트 (`CalculatorResultSheet.tsx`)

- 면적 출처: 개별 = `api.parcels.get(parcelId).lndpclAr` (ParcelSheet 선례), 그룹 = 멤버 병렬 조회 후 known 합산, 전원 null이면 null (GroupSheet 선례 — v1 `calcGroupAreaM2` 동형).
- 그룹 소속 필지면: 상단에 `SegmentedControl` "개별 지번 / 그룹 전체 (N필지)", 초기값 '그룹 전체'. 그룹 모드 = `selectedGroupId` 설정(지도 강조) + 헤더에 그룹명(없으면 `그룹 (N필지)`), 개별 모드 = `selectedGroupId` 해제 + 헤더에 지번. 비소속이면 토글 없이 지번 헤더.
- 면적 행: 유효 면적이 null이 아니면 `AreaText`(ui.areaUnit) + 단위 `SegmentedControl`(전역 즉시 반영, M-7 공유) 표시.
- 본문: ① 유효 면적 null → 안내 문구(개별/그룹 문안 구분, v1 보존) ② 레시피 0개 → 빈 안내 ③ 그 외 → 레시피별 `이름 — formatRecipeAmount(computeRecipeAmount(...)) + amountUnit` 행 목록. 모드·단위 전환 시 즉시 재계산/재표기.

## 수용 기준 (AC)

단위 테스트 (Vitest, `tests/unit/` — `calc.ts`·zod):

AC-1. Given 문자열 draft 입력, When `sanitizeDecimalInput`/`toRecipeNumber`를 적용하면, Then `"12.a3"` → `"12.3"`, `"1."`은 `"1."` 그대로 보존되고, `toRecipeNumber("1.")` = 1, `toRecipeNumber("")` = 0, `toRecipeNumber("0.5")` = 0.5다.

AC-2. When `computeRecipeAmount`를 호출하면, Then ① 면적 600㎡ × 레시피 {baseArea 300, baseUnit '㎡', amount 300} = 600, ② baseUnit '평' 환산 적용 — 600㎡ × {baseArea 181.5(평), amount 100} = 100, ③ baseArea 0이면 결과 0이다.

AC-3. When `formatRecipeAmount`를 호출하면, Then 정수는 천 단위 구분(`1200` → `"1,200"`), 소수는 최대 2자리(`90.756` → `"90.76"`)로 포맷된다.

AC-4. Given v1 저장 형식 레시피 배열(`{id, name, baseArea, baseUnit: '㎡', amount, amountUnit}`), When `calcRecipesValueSchema`로 파싱하면 통과하고, GET 응답 스키마는 `recipes: null`을 통과시키며, baseUnit 비허용 값(`'m2'`)·음수 baseArea·13자 name은 PUT 요청 스키마에서 거부된다.

컴포넌트 테스트 (RTL, `tests/unit/`):

AC-5. Given 저장된 레시피 2개로 설정 시트를 렌더하면, Then 행별 자재명·기준면적·기준단위·투입량·투입단위가 표시된다. When "+ 항목 추가"를 탭하면, Then 기본값(300, ㎡, 0, L) 행이 추가되고, When 행 삭제 버튼을 탭하면, Then 해당 행만 제거된다.

AC-6. Given 설정 시트의 숫자 필드, When `"12.a3"`을 타이핑하면 `"12.3"`이 표시되고 `"1."` 입력 중간 상태가 유지된다. When "저장"을 탭하면, Then `api.calcRecipes.put`이 숫자 변환된 레시피 배열로 1회 호출되고 시트가 닫히며, When X로 닫으면, Then put이 호출되지 않는다 (draft 폐기).

AC-7. Given 면적 600㎡인 비그룹 필지의 결과 시트(레시피 2개), Then 지번 헤더·환산 면적·레시피별 계산값+단위 행이 표시되고 개별/그룹 토글은 없다. When 단위를 '평'으로 토글하면, Then 면적 표기만 바뀌고 계산 결과 행 값은 불변이다.

AC-8. Given 그룹 소속 필지의 결과 시트(멤버 면적 일부 known), Then 토글이 표시되고 기본 '그룹 전체 (N필지)' + known 합산 면적 기준 결과 + `selectedGroupId` 설정 상태다. When '개별 지번'으로 전환하면, Then 해당 필지 면적 기준으로 재계산되고 `selectedGroupId`가 해제된다.

AC-9. Given 유효 면적이 null인 결과 시트, Then "면적 정보가 없습니다…" 안내가 표시되고 계산 행이 없다. Given 면적은 있으나 레시피 0개, Then "설정된 계산 항목이 없습니다…" 안내가 표시된다.

핸들러 테스트 (`server/handlers/calcRecipes.ts` — 코드 무변경, 스키마 구체화 회귀 확인):

AC-10. Given 구체화된 스키마, When 유효 레시피 배열을 PUT 후 GET하면, Then 동일 배열이 반환되고, When baseUnit `'invalid'`인 본문을 PUT하면, Then 400이 반환된다.

E2E (Playwright + mockApi, `tests/e2e/calculator.spec.ts` — mockApi에 필지 면적·calc-recipes 응답 추가):

AC-11. Given 지도 화면, When 계산기 진입 버튼 → 설정 시트에서 항목 추가·값 입력 → "계산 시작"을 탭하면, Then 계산기 배지가 표시되고, When 비그룹 필지를 탭하면, Then 결과 시트에 면적과 레시피 계산값이 표시되며, When "종료"를 탭한 뒤 같은 필지를 탭하면, Then 일반 필지 시트가 열린다.

AC-12. Given 계산기 모드, When 그룹 소속 필지를 탭하면, Then 결과 시트가 '그룹 전체' 기본으로 그룹 합산 면적 결과를 표시하고, When '개별 지번'으로 전환하면, Then 개별 면적 기준 결과로 바뀐다 (테스트 전략 §E2E 핵심 여정 ⑥).

## 비범위

- 동적 색상 팔레트 (M-11)
- V-World 면적 적재·`fetch-land-info` (M-13) — 면적 null이면 안내 문구가 본 기능의 정상 동작
- 레시피 Realtime 동기화 (v1에도 없음 — 설정 시트 열 때 GET으로 충분)
- NavDrawer 정식 진입점 (드로어 도입 시 임시 버튼 이전)
- 목록 뷰(M-9)에서의 계산기 연동 (v1에도 없음 — 지도 탭 전용)
- v1 데이터 시드 자체 (§8.1, Phase 5) — 본 건은 시드 호환 스키마만 보장

## 영향 범위

- 프론트: `src/features/calculator/` 신규 — `CalculatorSettingsSheet.tsx`, `CalculatorResultSheet.tsx`, `calc.ts`(순수 함수). `src/stores/ui.ts` — `calculatorActive` + 진입/종료 액션 + `tapParcel` 계산기 분기. `src/stores/workspace.ts` — `calcRecipes` 상태 + 로드/저장 액션. `src/App.tsx` — 임시 진입 버튼·모드 배지·시트 마운트.
- 백엔드: **코드 무변경** — `server/handlers/calcRecipes.ts`는 value 통과 저장이므로 스키마 구체화만으로 PUT 검증이 강화됨 (구현 단계에서 무변경 확인 필수).
- DB: 마이그레이션 불필요 (`app_config['calc_recipes']` 기존 키).
- API 계약: 신규 엔드포인트 없음. `src/types/api/calcRecipes.ts` — `calcRecipeSchema` 신설, `calcRecipesValueSchema`를 `z.unknown()` → `z.array(calcRecipeSchema)`로 구체화(GET은 `.nullable()`), 주석의 "M-14" 오기를 M-10으로 정정. `src/lib/api.ts`는 기존 `api.calcRecipes.get/put` 그대로.
- 테스트 인프라: `tests/e2e` mockApi에 `/api/calc-recipes` GET/PUT 및 필지 면적(`lndpclAr`) 응답 추가.
- 디자인: **ui-designer 필요** — `design/bogugot.pen`에 설정 시트·결과 시트(토글 포함)·모드 배지 프레임 추가 (Stage 2). 신규 공통 UI 컴포넌트 없음 — `Sheet`·`Input`(decimal)·`SegmentedControl`·`Badge`·`Button`·`IconButton`·`AreaText` 재조립.
