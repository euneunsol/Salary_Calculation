# CrossDev AI 설계 노트 — 근무표 이미지 업로드 및 예정 근무표 자동 매핑

> 상태: **설계 초안 (구현 전)**. 이 문서 외의 코드·마이그레이션·운영 데이터는 변경하지 않았다.
> 입력: GPT 개발 명세(CrossDev AI 트리거) + 저장소 실제 구조 분석 결과.

---

## 0. 명세와 저장소 불일치 (먼저 읽을 것)

GPT 명세는 일반적인 Java/Spring 백엔드를 가정했으나, 실제 저장소는 다르다. 아래 표의 "본 설계 채택안"을 기준으로 이후 절을 작성했다.

| # | GPT 명세 | 실제 저장소 | 본 설계 채택안 |
|---|---|---|---|
| M1 | `src/main/java/com/company/salary/api/ShiftImageController.java`, `src/main/resources/...` | Java 코드 없음. **Supabase(PostgreSQL + RLS + RPC) + React 19 / TS / Vite** (`web/`, `supabase/migrations/`) | Controller/Service 계층 → **Supabase Edge Function + `security definer` RPC + React 페이지**로 대응 |
| M2 | `POST /manager/upload-shift-image` REST 엔드포인트 | 자체 API 서버 없음. 클라이언트가 `supabase-js`로 테이블/RPC 직접 호출 | Storage 업로드 → `functions.invoke('parse-shift-image')` → RPC 호출 |
| M3 | `Employees` 테이블 | 없음. 직원 = `store_members`(role, status, joined_at, left_at) + `profiles.name` | 매칭 대상: 해당 매장 `store_members` 중 `ACTIVE`이고 근무일이 `joined_at~left_at` 범위인 구성원 |
| M4 | `PlannedShifts` (예정 근무표) 테이블이 이미 있는 것처럼 기술 | **예정 근무표 개념 자체가 없음.** 실제 근무는 `work_records`(DRAFT→SUBMITTED→APPROVED/REJECTED)뿐 | **신규 테이블 `planned_shifts`** 를 추가 설계. `work_records`와 완전히 분리 |
| M5 | 임시 레코드를 "PlannedShifts 임시 테이블"에 저장 후 승인 시 이동 | 해당 없음 | 임시 영역 = **`shift_import_rows`** (업로드 배치별 후보 행). 승인 시에만 `planned_shifts`로 INSERT |
| M6 | `audit_log` 공용 테이블 | 공용 감사 테이블 없음. 근무 변경 이력은 `work_record_history`(0019, 클라이언트 쓰기 차단) | 별도 공용 테이블 대신 **`shift_imports`(배치 메타 + 파일 해시) + `shift_import_events`(이벤트 로그)** 로 기존 이력 패턴(서버만 쓰기)을 따름 |
| M7 | `Payroll`, `Attendance`를 INSERT/UPDATE 트리거로 차단 | `Attendance` 없음. 급여는 `payrolls`/`weekly_summaries`, 확정 월 보호는 이미 `guard_confirmed_payroll`(0001)·`guard_payroll_status_transition`(0014~0017)이 담당 | 새 트리거 추가 불필요. **기능 자체가 `work_records`·`payrolls`·`weekly_summaries`·`wage_history`에 쓰기 경로를 갖지 않도록** 설계 (§4.3) |
| M8 | 날짜 포맷 `YYYY-MM-DD`, `YY/MM/DD` | Excel 근무표는 보통 **행=직원, 열=날짜(일자만)**의 격자형이며, 셀 값이 `09:00-18:00`, `9-18`, `오픈`, `마감` 등 | 대상 연·월은 매니저가 업로드 시 **명시 입력**, 열 머리글 `1`~`31`/`11/3(월)` 등은 해당 월 날짜로 정규화. 행 단위 목록형도 지원 |
| M9 | 퍼지 매칭 Levenshtein ≤ 2 | 한글 이름은 2~3음절이 대부분이라 거리 2는 사실상 다른 사람과도 매칭됨 | **완전 일치(공백 제거)만 자동 매칭**. 거리 1 또는 동명이인은 "후보 제시 + 관리자 선택" (§5) |
| M10 | Tesseract / Google Vision | 외부 OCR 연동 없음. 비밀키는 Edge Function 환경변수에만 둔다는 규칙(README) 존재 | OCR 공급자는 Edge Function 내부 어댑터로 추상화, 키는 Edge Function secret에만 저장 |
| M11 | 시간 필드 `start`, `end`만 | `work_records`는 `crosses_midnight`, `break_minutes ∈ {0,30,60}`, 일 18시간 제한 | 예정 근무에도 `crosses_midnight` 포함. 휴게는 예정 단계에서 선택 입력(기본 0) |
| M12 | "중복 근무 = 동일 직원·날짜·시간" | `work_records`는 `(store_member_id, work_date)` 유일 — 하루 1건 | 예정 근무도 **직원·날짜당 1건**을 기본 정책으로 하고, 시간이 다른 같은 날 두 건도 "중복"으로 판정 |

---

## 1. 요구사항

| ID | 요구사항 | 비고 |
|---|---|---|
| FR-1 | 매장 매니저(및 사장님)가 엑셀 근무표 **캡처 이미지(PNG/JPEG/WebP, ≤ 5MB, 1장)** 와 대상 연·월을 업로드한다 | 권한: `is_store_manager(store_id)` 또는 `is_store_owner(store_id)` |
| FR-2 | 이미지에서 **직원 이름 / 날짜 / 시작 / 종료 시각**을 추출한다 | OCR 원문과 셀별 신뢰도 보존 |
| FR-3 | 추출 이름을 해당 매장 구성원과 매칭한다 | 자동 매칭은 확실한 경우만 |
| FR-4 | 매칭된 행을 직원별 **예정 근무표(`planned_shifts`)** 로 매핑한다 | 관리자 승인 후에만 반영 |
| FR-5 | 이름 불일치·인식 오류·중복 근무는 **관리자 확인 없이는 반영되지 않는다** | 행 단위 승인/수정/제외 |
| FR-6 | 확정된 근무 기록, 급여 내역, 운영 데이터(`work_records`, `payrolls`, `weekly_summaries`, `wage_history`, `store_members`, `stores`)는 **수정하지 않는다** | 쓰기 경로 자체를 두지 않음 |
| NFR-1 | 업로드·추출·매칭·승인 이력은 클라이언트가 위변조할 수 없어야 한다 | `security definer` RPC만 쓰기 (Edge Function도 RPC 경유, §3.5) |
| NFR-2 | 원본 이미지는 직원 개인정보를 포함하므로 매장 관리자만 접근하고 보존 기간을 둔다 | 비공개 버킷, 예: 30일 후 삭제 |

범위 밖: 예정 근무 → 실제 `work_records` 자동 생성, 급여 예상액 계산, 알바생 알림.

---

## 2. 처리 흐름

```
[매니저 화면 /manage/:storeId/schedule-import]
   │ ① 이미지 + 대상 연·월 선택 (클라이언트에서 MIME·크기 1차 검증)
   ▼
[Supabase Storage: shift-imports/{store_id}/{import_id}.png]  (비공개 버킷)
   │ ② RPC create_shift_import(store_id, year, month, path, sha256)
   │      → shift_imports(status=UPLOADED) 생성, 동일 해시 재업로드 경고
   ▼
[Edge Function parse-shift-image]  (사용자 JWT로 호출, OCR 키는 secret)
   │ ③ 권한 재확인 → 이미지 다운로드 → OCR(셀 좌표+텍스트+신뢰도)
   │ ④ 표 구조 복원 → 셀 파싱 → 후보 행 {raw_name, date, start, end, crosses_midnight, confidence}
   │ ⑤ 이름 매칭 → 매칭 상태/후보 member id
   │ ⑥ 검증 → issue 코드 부여 (§4)
   │ ⑦ RPC save_shift_import_parse_result(import_id, rows) → shift_import_rows INSERT,
   │      shift_imports.status=PARSED (테이블 직접 INSERT 아님, §3.5.3)
   ▼
[검토 화면]
   │ ⑧ 이슈 있는 행을 상단에 표시. 관리자는 행별로 직원 지정 / 시간 수정 / 제외 / 승인
   │    (수정은 RPC update_shift_import_row — 원본 OCR 값은 보존)
   ▼
[RPC apply_shift_import(import_id, row_ids[])]  (security definer, 단일 트랜잭션)
   │ ⑨ 서버에서 재검증 (이슈 미해결 행·권한·중복 재확인)
   │ ⑩ planned_shifts INSERT (source_import_row_id 기록)
   │ ⑪ shift_import_events 기록, shift_imports.status=APPLIED / PARTIALLY_APPLIED
   ▼
[예정 근무표 조회] — 매니저/사장님: 매장 전체, 알바생: 본인 것만 (선택 사항)
```

상태 전이

- `shift_imports.status`: `UPLOADED → PARSING → PARSED → (APPLIED | PARTIALLY_APPLIED | DISCARDED)`, 실패 시 `FAILED`
- `shift_import_rows.review_status`: `NEEDS_REVIEW | READY → APPROVED | EXCLUDED`. `issues`가 비어 있지 않은 행은 관리자가 명시 승인해야 `APPROVED` 가능.

---

## 3. 수정 예상 모듈

> 모두 **향후 구현 시** 대상이며, 이번 작업에서는 변경하지 않았다.

### 3.1 DB (`supabase/migrations/`, 신규 `0020_shift_image_import.sql` 예상)

| 객체 | 내용 |
|---|---|
| `planned_shifts` | `id, store_id, store_member_id, shift_date, start_time, end_time, crosses_midnight, break_minutes(0/30/60), source_import_row_id, created_by, created_at, updated_at`; `unique(store_member_id, shift_date)` |
| `shift_imports` | `id, store_id, uploaded_by, target_year, target_month, storage_path, file_sha256, status, ocr_provider, error_message, created_at, applied_at` |
| `shift_import_rows` | `id, import_id, row_index, raw_name, raw_cell_text, parsed_date, parsed_start, parsed_end, crosses_midnight, ocr_confidence, match_status(MATCHED/AMBIGUOUS/UNMATCHED), store_member_id, candidate_member_ids uuid[], issues text[], review_status, edited_by, edited_at` |
| `shift_import_events` | `id, import_id, actor_id, event(UPLOADED/PARSED/ROW_EDITED/ROW_EXCLUDED/APPLIED/DISCARDED/FAILED), detail jsonb, created_at` — 클라이언트 쓰기 revoke. `detail` 필수 키는 §3.1.2 |
| RPC | `create_shift_import`, `start_shift_import_parse`, `save_shift_import_parse_result`, `fail_shift_import_parse`, `update_shift_import_row`, `apply_shift_import`, `discard_shift_import` (모두 `security definer`, 내부에서 `can_manage_store` 확인 — 이유는 §3.1.1, 작성 규칙은 §3.5.2) |
| RLS | 4개 테이블 모두 `enable row level security`. 정책·GRANT 명세는 §3.5.1 |
| Storage | 비공개 버킷 `shift-imports`, 경로 첫 세그먼트 `store_id` 기준 정책. 명세는 §3.5.4 |

기존 헬퍼 `is_store_manager`, `is_store_owner`, `can_review_member`(0002, 0008)를 재사용한다.

`planned_shifts`의 `unique(store_member_id, shift_date)`는 `planned_shifts` 테이블 안에서만 적용된다. `work_records`의 `uq_work_per_day`(0001)와는 별개 테이블·별개 제약이라, 같은 직원·같은 날짜에 예정 근무와 실제 근무가 함께 있어도 어느 쪽 INSERT도 막히지 않는다. 두 테이블 사이에는 FK나 트리거도 두지 않는다.

#### 3.1.1 권한 검증 위치

- **RPC 내부 검증이 최종 권한 판단이다.** `security definer` 함수는 소유자 권한으로 실행되어 RLS를 우회하므로, 함수 안에서 `is_store_manager`/`is_store_owner`를 확인하지 않으면 누구나 다른 매장 데이터를 쓸 수 있다. 기존 `manager_edit_approved_work`(0018)도 같은 이유로 함수 안에서 `can_review_member`를 확인한다. RLS만으로는 대신할 수 없다.
- Edge Function의 권한 확인은 OCR 호출 비용과 이미지 다운로드를 줄이기 위한 **빠른 실패용**이다. 별도 규칙을 만들지 않고 같은 SQL 헬퍼를 RPC로 호출해 판단하므로 권한 규칙은 DB 한 곳에만 있다.

#### 3.1.2 `shift_import_events.detail` 스키마

| event | `detail` 필수 키 |
|---|---|
| `UPLOADED` | `storage_path`, `file_sha256`, `target_year`, `target_month`, `duplicate_of_import_id`(없으면 null) |
| `PARSED` | `ocr_provider`, `row_count`, `issue_counts`(이슈 코드별 건수) |
| `ROW_EDITED` | `row_id`, `before`, `after` — 바뀐 필드(`store_member_id`, `parsed_date`, `parsed_start`, `parsed_end`, `crosses_midnight`, `break_minutes`, `on_conflict`)만 담는다. `work_record_history`(0019)의 `before_record`/`after_record` 방식과 같다 |
| `ROW_EXCLUDED` | `row_id`, `reason`(선택 입력) |
| `APPLIED` | `inserted_row_ids`, `overwritten`(`[{row_id, planned_shift_id, before}]`), `skipped_row_ids`, `rejected`(`[{row_id, issues}]`) |
| `DISCARDED` | `reason`(선택 입력) |
| `FAILED` | `stage`(`DOWNLOAD`/`OCR`/`PARSE`/`SAVE`), `error_code`. OCR 원문, 이미지 URL, 키는 넣지 않는다 |

이벤트 행은 RPC가 같은 트랜잭션에서 INSERT한다. 클라이언트는 INSERT/UPDATE/DELETE 권한이 없다.

### 3.2 Edge Function (신규 `supabase/functions/parse-shift-image/`)

| 파일 | 역할 |
|---|---|
| `index.ts` | JWT 검증, 권한 확인, 상태 전이, 오류 시 `FAILED` 기록 |
| `ocr.ts` | OCR 공급자 어댑터 (`OcrProvider` 인터페이스, 키는 `Deno.env`) |
| `parseGrid.ts` | 셀 좌표 → 표 복원, 머리글(날짜/이름) 탐지 |
| `parseCell.ts` | 셀 문자열 → 시간 범위 (순수 함수, 프론트와 공유 가능) |
| `matchMember.ts` | 이름 정규화·매칭 (순수 함수) |

service_role 키는 사용하지 않는다(사용자 JWT로 RPC 호출 → RLS/권한 함수 그대로 적용). Edge Function도 테이블에 직접 INSERT/UPDATE하지 않고 §3.5.3의 RPC만 호출한다. 사용자 JWT로 실행되므로 테이블 쓰기 권한을 revoke하면 직접 쓰기는 어차피 실패한다.

### 3.3 프론트엔드 (`web/src/`)

| 위치 | 내용 |
|---|---|
| `features/shiftImport/parseShiftCell.ts` (+ `.test.ts`) | 시간 문자열 파싱, `validateWorkTime`(workRecordForm.ts)과 동일 규칙 재사용 |
| `features/shiftImport/matchMember.ts` (+ `.test.ts`) | 이름 정규화·매칭 |
| `features/shiftImport/validateImportRows.ts` (+ `.test.ts`) | 이슈 코드 산출 |
| `pages/manager/ManagerShiftImport.tsx` | 업로드 + 검토 + 적용 화면 |
| `pages/manager/ManagerPlannedSchedule.tsx` | 예정 근무표 달력 (선택) |
| `App.tsx` | `manage/:storeId/schedule-import` 라우트 추가 |
| `components/AppLayout.tsx` / `ManagerDashboard.tsx` | 진입 링크 |
| `types/database.types.ts` | 신규 테이블·RPC 타입 재생성 |
| `package.json` | `test` 스크립트에 신규 테스트 파일 추가 |
| `lib/date.ts` | 날짜 유틸 재사용 (`isISODate`, `startOfMonth` 등), 수정 불필요 예상 |

### 3.5 보안 설계 (2차 보안 리뷰 반영)

저장소에서 확인한 사실을 기준으로 썼다. 검증하지 못한 가정은 §3.5.6에 따로 적었다.

- `0002_rls.sql` 끝의 `grant select, insert, update, delete on all tables in schema public to authenticated`는 **그 시점에 있던 테이블에만** 적용된다. 그런데 Supabase는 보통 public 스키마의 새 테이블·함수에 `anon`, `authenticated` 권한을 기본으로 준다(default privileges). 그래서 신규 테이블은 **명시적으로 revoke하지 않으면 클라이언트가 직접 쓸 수 있다고 가정**한다.
- 기존에 서버만 쓰는 테이블은 `work_record_history`(0019) 한 곳이다. 이 테이블은 `revoke insert, update, delete ... from authenticated, anon`과 `security definer` 트리거로 보호한다. 신규 테이블도 같은 방식을 따른다.
- 권한 헬퍼는 모두 `auth.uid()`를 안에서 읽고 `store_id`만 인자로 받는다: `is_store_owner(store_id)`, `is_store_manager(store_id)`, `can_manage_store(store_id)`, `can_manage_member(member_id)`, `owns_member(member_id)`(0002). 사용자 id를 인자로 받는 시그니처는 없다.

#### 3.5.1 RLS 정책과 GRANT

| 테이블 | SELECT (RLS `using`) | 클라이언트 INSERT/UPDATE/DELETE |
|---|---|---|
| `shift_imports` | `can_manage_store(store_id)` | revoke. 쓰기는 RPC만 |
| `shift_import_rows` | `can_manage_import(import_id)` (신규 헬퍼, 아래 참고) | revoke. 쓰기는 RPC만 |
| `shift_import_events` | `can_manage_import(import_id)` | revoke. 쓰기는 RPC만 |
| `planned_shifts` | `can_manage_store(store_id)`, (선택) `owns_member(store_member_id)` | revoke. 쓰기는 `apply_shift_import`만 |

- 마이그레이션에서 테이블마다 `grant select ... to authenticated`와 `revoke insert, update, delete ... from authenticated, anon`을 둘 다 적는다. INSERT/UPDATE/DELETE 정책은 만들지 않는다. 권한(GRANT)과 정책(RLS) 두 겹으로 막는 것이다.
- `can_manage_import(p_import_id)`는 `can_manage_member`(0002)와 같은 형태의 `stable security definer` 헬퍼로 만든다. `shift_imports`에서 `store_id`를 찾아 `can_manage_store`를 호출한다. `shift_import_rows` 정책에서 `shift_imports`를 직접 서브쿼리해도 동작하지만, 0002의 원칙(판정 로직은 헬퍼 함수로 감싼다)을 따른다.
- `anon`에는 SELECT도 주지 않는다.

#### 3.5.2 `security definer` RPC 작성 규칙

쓰기 권한을 revoke했으므로 쓰기는 `security definer` RPC로만 가능하다. 이것은 기존 패턴(0011, 0018, 0019)을 따른 것이고, 모든 함수를 definer로 만들라는 뜻은 아니다. 조회는 definer 함수 없이 RLS로 처리한다.

1. `set search_path = public`을 지정한다(기존 함수와 같다).
2. 함수 첫 부분에서 `auth.uid() is null`이면 거절하고, 대상 import/store를 `for update`로 잠근 뒤 `can_manage_store`로 권한을 확인한다. definer 함수는 RLS를 우회하므로 이 확인이 빠지면 다른 매장 데이터를 쓸 수 있다(§3.1.1).
3. `revoke all on function ... from public, anon` 후 `grant execute ... to authenticated`. 기존 마이그레이션은 `from public`만 revoke한다. Supabase default privileges가 `anon`에 직접 EXECUTE를 주는 경우 `from public`만으로는 회수되지 않으므로 `anon`을 함께 적는다.
4. 행 id를 인자로 받는 RPC(`update_shift_import_row` 등)는 그 행의 `import_id`가 인자로 받은 import와 같은지, 그 import의 `store_id`에 권한이 있는지 함께 확인한다.
5. `store_member_id`를 지정·수정할 때는 그 구성원이 같은 매장 소속인지 확인한다(`store_members.store_id = shift_imports.store_id`). 다른 매장 직원 id를 넣어 `planned_shifts`를 만드는 것을 막는다.
6. 함수 소유자는 기존 함수처럼 마이그레이션 실행 역할이다. 별도 소유자 역할은 만들지 않는다.

#### 3.5.3 Edge Function의 쓰기 경로

이전 초안은 ⑦에서 Edge Function이 `shift_import_rows`에 직접 INSERT하는 것처럼 썼다. 그런데 §3.5.1에서 클라이언트 쓰기를 revoke하므로, 사용자 JWT로 실행하는 Edge Function은 직접 INSERT할 수 없다. 그래서 다음 RPC로 바꾼다.

| RPC | 허용 상태 전이 | 비고 |
|---|---|---|
| `start_shift_import_parse(import_id)` | `UPLOADED → PARSING` (재시도면 `FAILED → PARSING`) | 동시에 두 번 파싱하는 것을 막는다 |
| `save_shift_import_parse_result(import_id, rows jsonb, ocr_provider, file_sha256)` | `PARSING → PARSED` | 한 번만 허용. 행 수 상한(예: 31일 × 100명). `PARSED` 이벤트를 같은 트랜잭션에서 기록 |
| `fail_shift_import_parse(import_id, stage, error_code)` | `PARSING → FAILED` | `FAILED` 이벤트 기록 |

**남는 위험:** 이 RPC는 사용자 JWT로 호출되므로, 그 매장의 매니저는 Edge Function을 거치지 않고 직접 호출해 OCR 결과(`raw_cell_text`, `ocr_confidence`)를 임의 값으로 넣을 수 있다. 다만 매니저는 원래 검토 단계에서 모든 행을 수정할 수 있고, 적용 RPC가 서버에서 다시 검증한다(§4.4). 따라서 추가로 얻는 권한은 없고, 영향은 "OCR 원문 기록이 실제 OCR 결과라는 보장이 없다"는 감사 측면에 한정된다. 다른 매장이나 다른 사용자로 확대되지는 않는다. 이를 막으려면 service_role로만 실행 가능한 RPC가 필요하다. 하지만 README는 service_role을 Edge Function 환경변수로만 쓰라고 하고, 사용 시 RLS가 전부 우회되므로 기본안으로 채택하지 않는다. §7 미결 사항으로 둔다.

#### 3.5.4 Storage 정책 (`storage.objects`, 버킷 `shift-imports`)

현재 저장소의 마이그레이션에는 Storage 버킷과 정책이 없다. 새로 정의해야 한다.

- 버킷: `public = false`, `file_size_limit` 5MB, `allowed_mime_types`는 png/jpeg/webp. 서버의 매직 바이트 확인(§4.1)은 그대로 둔다. 버킷의 MIME 제한은 클라이언트가 보낸 Content-Type만 보기 때문이다.
- 경로: `{store_id}/{import_id}.{ext}`. 정책 조건은 `bucket_id = 'shift-imports' and can_manage_store(((storage.foldername(name))[1])::uuid)`.
  - SELECT, INSERT: 위 조건.
  - UPDATE: 정책 없음(덮어쓰기 금지). 다시 올리려면 새 import를 만든다.
  - DELETE: 정책 없음. 보존 기간이 지난 파일 삭제 방식은 §7에서 정한다.
- 첫 세그먼트가 uuid가 아니면 캐스트에서 오류가 나 요청이 거절된다. 구현 시 거절(오류)로 끝나는지 테스트한다(§6.2).
- `create_shift_import`는 `storage_path`가 `{p_store_id}/` 로 시작하는지 확인한다. 다른 매장 경로를 자기 import에 연결하는 것을 막는다.
- 클라이언트가 보낸 `file_sha256`은 신뢰하지 않는다. Edge Function이 내려받은 바이트로 다시 계산해 `save_shift_import_parse_result`에 넘기고, 중복 판정(§4.1)은 서버가 계산한 값으로 한다.
- 이미지는 Storage 정책상 해당 매장 관리자만 읽을 수 있다. 화면에는 짧은 만료의 signed URL로만 보여 주고, URL을 로그나 `shift_import_events.detail`에 남기지 않는다(§3.1.2).

#### 3.5.5 리뷰 항목별 판정

| # | 2차 리뷰 주장 | 판정 | 근거 |
|---|---|---|---|
| 1 | 설계상 클라이언트가 `shift_import_rows`에 직접 쓸 수 있다 | **일부 타당.** 설계에 그런 문구는 없었다(§3.1은 revoke라고 썼다). 그러나 ⑦의 Edge Function 직접 INSERT와 revoke가 서로 맞지 않았다 | §3.5.3에서 RPC 경로로 고침 |
| 2 | JWT를 탈취하면 임의 매장에 쓸 수 있다 | **기각.** RPC가 `auth.uid()` 기준으로 매장 권한을 확인하므로, 탈취한 JWT로는 그 사용자 권한까지만 쓸 수 있다. 토큰 탈취 자체는 앱 전체의 공통 위험이다 | §3.5.2-2 |
| 3 | `shift_import_events` revoke 설정이 문서에 없다 | **타당.** GRANT/REVOKE를 구체적으로 명시함 | §3.5.1 |
| 4 | RLS `using`/`with check` 조건이 없다 | **타당.** 정책을 표로 명시함. 리뷰의 예시(`auth.role`, `session.store_id`, `is_store_manager(user_id, store_id)`)는 저장소에 없는 이름·시그니처라 쓰지 않았다 | §3.5.1 |
| 5 | Storage 버킷 정책이 없다 | **타당.** 저장소에 Storage 정의가 없다는 것도 확인함 | §3.5.4 |
| 6 | `is_store_manager`/`is_store_owner`가 없다 | **기각.** 0002에 이미 있다 | 0002_rls.sql |
| 7 | `shift_import_rows`를 거쳐 급여·근무 기록이 바뀔 수 있다 | **기각(이미 반영).** FK·트리거를 두지 않고, 신규 RPC에 해당 테이블 쓰기 문을 넣지 않는다 | §3.1, §4.3, §6.2-4 |
| — | 모든 RPC를 `SECURITY DEFINER` + 별도 특권 역할(`api_owner`) 소유로 | **부분 채택.** 쓰기 RPC만 definer로 하고, 조회는 RLS로 한다. 별도 소유자 역할은 기존 마이그레이션과 다르고 이점이 확인되지 않아 채택하지 않음 | §3.5.2 |

#### 3.5.6 검증하지 못한 가정

- 운영·스테이징 프로젝트의 default privileges 설정(신규 테이블·함수에 `anon`/`authenticated` 권한이 자동으로 붙는지). 이 설계는 "자동으로 붙는다"는 보수적 가정으로 썼다. 구현 시 로컬 DB에서 `has_table_privilege`·`has_function_privilege`로 확인한다(§6.2-7).
- 기존 RPC들이 `anon`에서 실행 가능한지 여부. 이번 범위에서 기존 함수는 바꾸지 않는다. 기존 함수는 내부에서 `auth.uid()` 기반 권한을 확인하므로 `anon` 호출은 권한 확인에서 거절될 것으로 보이지만, 실제로 확인하지 않았다.
- Edge Function 배포 설정(`verify_jwt`), CORS, 호출 빈도 제한. 저장소에 Edge Function이 아직 없어 확인할 수 없다.

### 3.6 변경하지 않는 모듈

`work_records` 관련 마이그레이션·트리거·RPC(0001, 0005, 0008, 0018, 0019), 급여 계산(`calculate_payroll`, `payrollCalc.ts`), 시급(`wage_history`, `set_wage`), 구성원(`store_members`), 급여 화면 전부.

---

## 4. 데이터 검증

### 4.1 업로드

| 항목 | 규칙 | 실패 시 |
|---|---|---|
| 형식 | `image/png`, `image/jpeg`, `image/webp`; 확장자와 매직 바이트 모두 확인(서버) | 거절 |
| 크기 | ≤ 5MB, 해상도 하한(예: 짧은 변 ≥ 600px) | 거절 / 저해상도 경고 |
| 대상 월 | 필수. 연 2020~2100, 월 1~12 | 거절 |
| 중복 파일 | 같은 매장·같은 `file_sha256`이 이미 `APPLIED` | 경고 후 계속 여부 확인 |
| 권한 | 해당 매장 활성 매니저 또는 사장님 | 거절 |

### 4.2 행 단위 이슈 코드 (하나라도 있으면 `NEEDS_REVIEW`)

| 코드 | 조건 | 관리자 조치 |
|---|---|---|
| `NAME_UNMATCHED` | 정규화 후 일치 구성원 없음 | 직원 선택 또는 제외 |
| `NAME_AMBIGUOUS` | 동명이인, 또는 편집거리 1 후보만 존재 | 후보 중 선택 |
| `MEMBER_INACTIVE` | 매칭 구성원이 `INACTIVE` 또는 근무일이 `joined_at` 이전/`left_at` 이후 | 확인 후 제외 권장 |
| `DATE_INVALID` | 날짜 파싱 실패, 대상 월 밖, 존재하지 않는 날짜(2/30) | 날짜 수정 |
| `TIME_INVALID` | 시각 파싱 실패, 분 단위 이상(예: `9:7`), 시작=종료 | 시간 수정 |
| `TIME_OVERNIGHT` | 종료 < 시작 → `crosses_midnight=true`로 추정 | 추정 확인 |
| `DURATION_EXCEEDED` | 휴게 제외 근무 > 18시간(`calc_work_minutes`와 동일) | 시간 수정 |
| `LOW_CONFIDENCE` | 정규화 신뢰도 < 공급자별 임계값 (아래 참고) | 원문 대조 |
| `DUPLICATE_IN_FILE` | 같은 이미지 내 동일 직원·날짜 2건 이상 | 1건 선택 |
| `DUPLICATE_EXISTING` | `planned_shifts`에 동일 직원·날짜 존재 | 행별 `on_conflict`를 `SKIP`(기본) 또는 `OVERWRITE`로 명시 선택. 적용 방식은 §4.4 |
| `OUTSIDE_STORE_HOURS` | `stores.open_time~close_time`(0011) 밖 | 참고 경고(승인 가능) |
| `NON_SHIFT_CELL` | `휴`, `OFF`, `-`, 빈칸 | 자동 제외(근무 아님), 경고 없음 |

OCR 신뢰도 정규화: 공급자마다 신뢰도 범위가 다르다(예: Google Vision 0~1, Tesseract 0~100). `ocr.ts` 어댑터가 값을 **0~1로 정규화**해 `ocr_confidence`에 저장한다. 공급자가 신뢰도를 주지 않으면 `null`로 저장하고 `LOW_CONFIDENCE`로 취급한다. 임계값은 코드에 고정하지 않고 공급자별 설정(Edge Function 환경변수, 예: `OCR_MIN_CONFIDENCE`)으로 둔다. 초기값 0.8은 합성 픽스처(§6.3)로 측정한 뒤 정한다. 행 신뢰도는 그 행의 이름 셀과 시간 셀 중 **낮은 값**으로 한다.

셀 표기 정규화 예: `09:00-18:00`, `9:00~18:00`, `9-18`, `09시~18시`, `0900-1800`. 전각 문자·`ㅡ`/`–`/`~` 구분자 통일. `오픈`/`마감` 같은 비수치 표기는 `TIME_INVALID`로 두고 자동 해석하지 않는다(매장별 의미 상이).

### 4.3 운영 데이터 보호

- 신규 RPC는 `planned_shifts`와 `shift_import*` 테이블에만 쓴다. `work_records`, `payrolls`, `weekly_summaries`, `wage_history`, `store_members`, `stores`에 대한 INSERT/UPDATE/DELETE 문을 포함하지 않는다 — 코드 리뷰 체크 항목 및 테스트(§6.2)로 검증.
- `planned_shifts`는 급여 계산(`calculate_payroll`)의 입력이 아니다. 예정 근무와 실제 근무는 화면에서도 구분 표시한다.
- 적용 RPC는 서버에서 이슈 재계산 후 처리하므로 클라이언트가 이슈를 지운 행을 강제로 보내도 거절된다.
- 원본 이미지와 OCR 원문은 직원 이름을 포함하므로 `shift-imports` 버킷은 비공개, 매장 관리자만 접근, 보존 기간 후 삭제. 로그에 원문 이미지 URL·OCR 키를 남기지 않는다.

---

### 4.4 `apply_shift_import` 처리 규칙

입력: `import_id`, `rows: [{row_id, on_conflict}]`. `on_conflict`는 `SKIP` 또는 `OVERWRITE`이고, 값이 없으면 `SKIP`이다.

1. `shift_imports` 행을 `for update`로 잠근 뒤 권한과 상태(`PARSED`인지)를 확인한다. 이렇게 하면 같은 업로드를 두 번 동시에 적용할 수 없다.
2. 요청된 각 행의 이슈를 서버에서 다시 계산한다. `DUPLICATE_EXISTING`과 `OUTSIDE_STORE_HOURS`를 뺀 이슈가 남은 행, `APPROVED`가 아닌 행은 `rejected`로 분류하고 쓰지 않는다.
3. 같은 `(store_member_id, shift_date)`의 기존 `planned_shifts` 행을 `for update`로 잠근 뒤 처리한다.
   - 기존 행 없음: INSERT.
   - 기존 행 있음 + `SKIP`: 쓰지 않고 `skipped`로 기록.
   - 기존 행 있음 + `OVERWRITE`: 기존 행의 시간 필드와 `source_import_row_id`, `updated_at`을 UPDATE하고, 이전 값을 `overwritten[].before`에 남긴다. 기존 행을 삭제하지 않는다.
   - 1~3단계 사이에 다른 트랜잭션이 같은 키를 INSERT한 경우: `insert ... on conflict (store_member_id, shift_date) do nothing`으로 처리하고, 실제로 들어가지 않은 행은 `SKIP`과 같이 `skipped`로 기록한다. 덮어쓰기는 관리자가 명시한 경우에만 일어난다.
4. 3단계를 모두 마친 뒤 `APPLIED` 이벤트(§3.1.2)를 1건 기록한다. 상태는 rejected/skipped가 없으면 `APPLIED`, 있으면 `PARTIALLY_APPLIED`로 바꾼다.
5. 함수 전체가 하나의 트랜잭션이다. 중간에 예외가 나면 `planned_shifts`와 이벤트가 모두 롤백된다. rejected 행이 있을 때 전체를 거절할지는 §7 "부분 적용 정책"에서 정하며, 위 규칙은 "승인 행만 적용" 안을 기준으로 썼다.

검토 화면은 `DUPLICATE_EXISTING` 행에 기존 예정 근무와 새 값을 나란히 보여 주고, `SKIP`/`OVERWRITE` 중 하나를 고르게 한다. 화면의 기본 선택도 서버 기본값과 같은 `SKIP`이다.

---

## 5. 이름 매칭 규칙

1. 정규화: 앞뒤·내부 공백 제거, 전각→반각, 괄호 주석 제거(`김민수(주말)` → `김민수`), 영문은 소문자.
2. 대상: 해당 매장 `store_members` × `profiles.name`, 역할 무관(매니저 본인 근무 포함), 기본은 `ACTIVE`.
3. 정규화 이름 **완전 일치 1명** → `MATCHED`.
4. 완전 일치 2명 이상 → `AMBIGUOUS` (동명이인).
5. 완전 일치 없음 + 편집거리 1 후보 존재 → `AMBIGUOUS` (자동 매칭하지 않음, 후보만 제시). 편집거리는 정규화 이름의 음절 단위 Levenshtein이다. **편집거리 2 이상은 후보로도 제시하지 않는다**(§0 M9). 프론트와 Edge Function의 `matchMember`는 같은 규칙을 쓴다.
6. 그 외 → `UNMATCHED`.
7. (선택) 관리자가 선택한 "이미지 표기 → 구성원" 연결을 매장별 별칭으로 저장해 다음 업로드에서 완전 일치로 취급. 별칭 저장도 관리자 승인 시에만.

---

## 6. 테스트 기준

### 6.1 단위 테스트 (`tsx --test`, 기존 테스트 방식과 동일)

| 대상 | 케이스 |
|---|---|
| `parseShiftCell` | 위 표기 5종 정상 파싱 / `22-06` → 자정 넘김 / `휴`·빈칸 → 근무 아님 / `25:00`, `9:7`, `9-9` → 오류 / 18시간 초과 → 오류 |
| 날짜 정규화 | 열 머리글 `1`~`31`, `11/3`, `11/3(월)` → 대상 월 ISO 날짜 / 2월 30일·대상 월 밖 → `DATE_INVALID` |
| `matchMember` | 완전 일치 / 공백·괄호 차이 / 동명이인 → AMBIGUOUS / 편집거리 1 → AMBIGUOUS(자동 매칭 안 됨) / 무관 이름 → UNMATCHED / 퇴사자 → `MEMBER_INACTIVE` |
| `validateImportRows` | 파일 내 중복 / 기존 예정 근무 중복 / 이슈 없는 행만 `READY` |

### 6.2 DB/RLS 시나리오 (로컬 또는 스테이징 DB에서만, 운영 DB 금지)

1. 다른 매장 매니저·알바생이 `create_shift_import`/`apply_shift_import` 호출 → 거절.
2. authenticated 역할로 `shift_import_events`·`planned_shifts` 직접 INSERT/UPDATE → 거절.
3. 이슈가 남은 행을 `apply_shift_import`에 포함 → 해당 행 거절, 다른 행은 정책에 따라 처리(전체 롤백 또는 부분 적용 — 구현 시 확정).
4. 적용 전후 `work_records`, `payrolls`, `weekly_summaries`, `wage_history` 행 수와 체크섬(`md5(string_agg(...))`)이 **동일**.
5. 급여 `CONFIRMED`/`PAID` 월을 대상으로 업로드·적용해도 위 테이블 변화 없음.
6. 같은 이미지 재업로드 → 중복 경고, `DUPLICATE_EXISTING` 행은 기본 건너뛰기.
7. 권한 확인: 신규 4개 테이블에 대해 `has_table_privilege('authenticated'/'anon', ..., 'INSERT'/'UPDATE'/'DELETE')`가 모두 false, 신규 RPC에 대해 `has_function_privilege('anon', ..., 'EXECUTE')`가 false.
8. 매장 A 매니저가 매장 B의 `import_id`·`row_id`·`store_member_id`를 넣어 각 RPC 호출 → 거절. `save_shift_import_parse_result`를 `PARSED` 상태에서 다시 호출 → 거절.
9. Storage: 매장 A 매니저가 `{매장 B id}/...` 경로로 업로드·조회, 기존 객체 덮어쓰기·삭제, 첫 세그먼트가 uuid가 아닌 경로 업로드 → 모두 거절. 알바생 계정은 같은 매장 경로도 조회 불가.

### 6.3 Edge Function / E2E

- Edge Function의 순수 모듈(`parseGrid`, `parseCell`, `matchMember`)은 `deno test`로 실행한다. `index.ts`는 `OcrProvider` mock(고정 OCR JSON 반환, 실패·타임아웃·신뢰도 누락 모드)을 주입해 상태 전이(`PARSED`/`FAILED`)와 `FAILED` 이벤트의 `detail`을 확인한다. 외부 OCR API는 자동 테스트에서 호출하지 않는다.
- RPC/RLS(§6.2)는 로컬 Supabase(`supabase start` + `supabase db reset`)에서 실행하는 SQL 테스트 스크립트로 자동화한다(예: `supabase/tests/shift_import.sql`, 구현 시 위치 확정). §4.4의 `SKIP`/`OVERWRITE`/동시 INSERT 경합, `ROW_EDITED` 이벤트의 before/after 기록도 이 스크립트에 넣는다. 이 기능은 새 DB 트리거를 추가하지 않으므로, 트리거 테스트는 기존 급여 보호 트리거가 그대로 동작하는지(§6.2-5)만 확인한다.
- OCR 어댑터는 고정 픽스처(가상 이름으로 만든 합성 근무표 이미지 + 기대 OCR JSON)로 대체해 테스트. **실제 직원 근무표 이미지는 테스트 데이터로 사용하지 않는다.**
- 5MB 초과, 비이미지 파일(확장자만 png), OCR 실패/타임아웃 → `FAILED` 상태와 사용자 메시지.
- 업로드 → 검토 → 일부 제외 → 적용 → 예정 근무표에 승인 행만 표시.

### 6.4 완료 기준

- `npm test`, `npm run typecheck`, `npm run build` 통과.
- §6.2 시나리오 전부 통과 기록을 `docs/`에 남김(기존 `work-review-flow.md`의 "DB 적용 후 확인 항목" 형식).

---

## 7. 미결 사항

| 항목 | 선택지 |
|---|---|
| OCR 공급자 | 외부 Vision API(정확도↑, 개인정보 외부 전송 → 동의/약관 검토 필요) vs 자체 Tesseract(정확도↓, Edge Function 런타임 제약) vs 멀티모달 LLM 표 추출 |
| 부분 적용 정책 | 이슈 행이 있으면 전체 거절 vs 승인된 행만 적용 |
| 알바생 노출 | 예정 근무를 알바생 달력에 표시할지, 표시 시 `work_records` 임시저장 생성 보조로 쓸지 (현재 범위 밖) |
| 이미지 보존 기간 | 30일 제안, 매장 정책 확인 필요. 삭제 주체(Storage 삭제 권한이 필요하므로 service_role을 쓰는 예약 작업 vs 매니저 화면에서 수동 삭제)도 함께 정한다 |
| OCR 원문 위조 방지 | §3.5.3의 남는 위험을 받아들일지, OCR 결과 저장 RPC만 service_role 전용으로 분리할지. 분리하면 service_role 키 관리와 Edge Function 내부 권한 확인이 새로 필요하다 |
