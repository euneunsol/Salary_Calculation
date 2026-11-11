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
| NFR-1 | 업로드·추출·매칭·승인 이력은 클라이언트가 위변조할 수 없어야 한다 | 서버(definer 함수/Edge Function)만 쓰기 |
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
   │ ⑦ shift_import_rows INSERT, shift_imports.status=PARSED
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
| `shift_import_events` | `id, import_id, actor_id, event(UPLOADED/PARSED/ROW_EDITED/APPLIED/DISCARDED/FAILED), detail jsonb, created_at` — 클라이언트 쓰기 revoke |
| RPC | `create_shift_import`, `update_shift_import_row`, `apply_shift_import`, `discard_shift_import` (모두 `security definer`, 내부에서 `is_store_manager`/`is_store_owner` 확인) |
| RLS | 4개 테이블 모두 `enable row level security`. 조회: 매장 매니저·사장님. `planned_shifts`는 본인 행 조회 허용(선택). INSERT/UPDATE/DELETE는 authenticated에서 revoke 후 RPC로만 |
| Storage | 비공개 버킷 `shift-imports`, 경로 첫 세그먼트 `store_id` 기준 정책 |

기존 헬퍼 `is_store_manager`, `is_store_owner`, `can_review_member`(0002, 0008)를 재사용한다.

### 3.2 Edge Function (신규 `supabase/functions/parse-shift-image/`)

| 파일 | 역할 |
|---|---|
| `index.ts` | JWT 검증, 권한 확인, 상태 전이, 오류 시 `FAILED` 기록 |
| `ocr.ts` | OCR 공급자 어댑터 (`OcrProvider` 인터페이스, 키는 `Deno.env`) |
| `parseGrid.ts` | 셀 좌표 → 표 복원, 머리글(날짜/이름) 탐지 |
| `parseCell.ts` | 셀 문자열 → 시간 범위 (순수 함수, 프론트와 공유 가능) |
| `matchMember.ts` | 이름 정규화·매칭 (순수 함수) |

service_role 키는 사용하지 않는다(사용자 JWT로 RPC 호출 → RLS/권한 함수 그대로 적용).

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

### 3.4 변경하지 않는 모듈

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
| `LOW_CONFIDENCE` | OCR 신뢰도 < 임계값(예: 0.8) | 원문 대조 |
| `DUPLICATE_IN_FILE` | 같은 이미지 내 동일 직원·날짜 2건 이상 | 1건 선택 |
| `DUPLICATE_EXISTING` | `planned_shifts`에 동일 직원·날짜 존재 | **덮어쓰기 여부 명시 선택** (기본: 건너뛰기) |
| `OUTSIDE_STORE_HOURS` | `stores.open_time~close_time`(0011) 밖 | 참고 경고(승인 가능) |
| `NON_SHIFT_CELL` | `휴`, `OFF`, `-`, 빈칸 | 자동 제외(근무 아님), 경고 없음 |

셀 표기 정규화 예: `09:00-18:00`, `9:00~18:00`, `9-18`, `09시~18시`, `0900-1800`. 전각 문자·`ㅡ`/`–`/`~` 구분자 통일. `오픈`/`마감` 같은 비수치 표기는 `TIME_INVALID`로 두고 자동 해석하지 않는다(매장별 의미 상이).

### 4.3 운영 데이터 보호

- 신규 RPC는 `planned_shifts`와 `shift_import*` 테이블에만 쓴다. `work_records`, `payrolls`, `weekly_summaries`, `wage_history`, `store_members`, `stores`에 대한 INSERT/UPDATE/DELETE 문을 포함하지 않는다 — 코드 리뷰 체크 항목 및 테스트(§5.3)로 검증.
- `planned_shifts`는 급여 계산(`calculate_payroll`)의 입력이 아니다. 예정 근무와 실제 근무는 화면에서도 구분 표시한다.
- 적용 RPC는 서버에서 이슈 재계산 후 처리하므로 클라이언트가 이슈를 지운 행을 강제로 보내도 거절된다.
- 원본 이미지와 OCR 원문은 직원 이름을 포함하므로 `shift-imports` 버킷은 비공개, 매장 관리자만 접근, 보존 기간 후 삭제. 로그에 원문 이미지 URL·OCR 키를 남기지 않는다.

---

## 5. 이름 매칭 규칙

1. 정규화: 앞뒤·내부 공백 제거, 전각→반각, 괄호 주석 제거(`김민수(주말)` → `김민수`), 영문은 소문자.
2. 대상: 해당 매장 `store_members` × `profiles.name`, 역할 무관(매니저 본인 근무 포함), 기본은 `ACTIVE`.
3. 정규화 이름 **완전 일치 1명** → `MATCHED`.
4. 완전 일치 2명 이상 → `AMBIGUOUS` (동명이인).
5. 완전 일치 없음 + 편집거리 1 후보 존재 → `AMBIGUOUS` (자동 매칭하지 않음, 후보만 제시).
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

### 6.3 Edge Function / E2E

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
| 이미지 보존 기간 | 30일 제안, 매장 정책 확인 필요 |
