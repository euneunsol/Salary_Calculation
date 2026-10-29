# 아르바이트 근무·급여 관리 웹 서비스

아르바이트 근무시간 기록과 주휴수당 포함 급여 계산을 자동화하고,
매장 단위 인력 관리를 함께 제공하는 웹 서비스.

## 구조

```
SalaryCalculation/
├─ docs/
│  ├─ 설계문서.md          요구사항 · 권한 · 스키마 · 급여 규칙 · 개발 순서
│  └─ erd.mermaid          테이블 관계도
├─ supabase/
│  └─ migrations/
│     ├─ 0001_init.sql     타입 · 테이블 · 인덱스 · 트리거
│     └─ 0002_rls.sql      헬퍼 함수 · RLS 정책
└─ web/                    React + TypeScript + Vite 프론트엔드
```

## 시작하기

### 1. 의존성 설치

```bash
cd web
npm install
```

### 2. Supabase 프로젝트 준비

1. https://supabase.com 에서 새 프로젝트를 만든다.
2. Dashboard → **SQL Editor** 에서 `supabase/migrations/0001_init.sql`부터 번호 순서대로 최신 마이그레이션까지 실행한다.
3. Dashboard → **Settings → API** 에서 Project URL 과 `anon` public key 를 복사한다.

### 3. 환경변수

```bash
cd web
cp .env.example .env
```

`.env` 를 열어 값을 채운다.

> `service_role` 키는 절대 `.env` 에 넣지 않는다.
> `VITE_` 로 시작하는 값은 빌드 결과물에 그대로 노출된다.
> service_role 키는 Edge Function 환경변수로만 사용한다.

### 4. 실행

```bash
npm run dev        # 개발 서버 (http://localhost:5173)
npm test           # 급여 계산 단위 테스트
npm run typecheck  # 타입 검사
npm run build      # 프로덕션 빌드
```

### 5. Cloudflare Pages 배포

1. GitHub 저장소를 Cloudflare Pages에 연결한다.
2. Framework preset은 `Vite`, Root directory는 `web`으로 설정한다.
3. Build command는 `npm run build`, Build output directory는 `dist`로 설정한다.
4. Environment variables에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 등록한다.
5. Supabase Dashboard의 Authentication → URL Configuration에서 Site URL을 배포 주소로 변경하고 Redirect URLs에 `https://배포주소/**`를 추가한다.

`web/public/_redirects`가 React Router 경로를 `index.html`로 연결하므로 새로고침 시 404가 발생하지 않는다.

## 지금까지 된 것

- [x] 설계 문서 · ERD
- [x] DB 스키마 + RLS 정책 (PostgreSQL 16에서 동작 검증 완료)
- [x] 프로젝트 스캐폴딩 (Vite · React 19 · TS · Tailwind v4 · Router v7 · TanStack Query v5)
- [x] 회원가입 / 로그인 화면
- [x] 역할 기반 라우팅 뼈대
- [x] **급여 계산 코어 로직 + 단위 테스트 36개**

## 다음 할 일

설계문서 §9 개발 순서 기준.

- [x] 6단계 — 사장님: 매장 생성·목록
- [x] 7단계 — 참여 코드로 직원 등록
- [x] 8단계 — 시급 설정 (`set_wage()` 사용)
- [x] 9단계 — 공휴일 데이터 저장·달력 표시
- [x] 10~11단계 — 근무 달력, 근무기록 입력
- [x] 12단계 — 근무 승인/반려
- [x] 13단계 — 급여 계산 RPC + 계산 규칙 테스트
- [x] 14~15단계 — 급여 화면, 역할별 대시보드, 확정·지급 처리
- [x] 16단계 — Cloudflare Pages 배포 설정
- [ ] 운영 전 — 전체 마이그레이션 적용 및 역할별 RLS 시나리오 직접 검증

## 급여 계산 규칙 요약

| 항목 | 규칙 |
|---|---|
| 주휴 발생 조건 | 주 근무 900분(15시간) 이상 |
| 주휴 환산 | 주 근무시간 ÷ 5, **최대 8시간** |
| 법정 계산식 | 시급 × (주 소정근로시간 ÷ 40) × 8 (= 주시간 ÷ 5와 동일) |
| 월 귀속 | 주가 끝나는 날짜가 속한 달 (퇴사자는 퇴사일 기준) |
| 퇴사 주 | 퇴사 당일까지만 합산해 판정 |
| 적용 시급 | 기본급은 근무일 시급, 주휴는 그 주 마지막 근무일 시급 |
| 반올림 | 계산 단위마다 원 미만 절사 |

자세한 내용은 `docs/설계문서.md` §5 참고.
