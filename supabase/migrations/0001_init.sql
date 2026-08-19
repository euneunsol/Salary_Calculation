-- =============================================================
-- 0001_init.sql — 타입 / 테이블 / 인덱스 / 트리거
-- 아르바이트 근무·급여 관리 서비스
-- 적용: Supabase Dashboard > SQL Editor 에 붙여넣고 실행
--       또는 supabase db push
-- =============================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "btree_gist"; -- 시급 이력 기간 중첩 방지

-- -------------------------------------------------------------
-- ENUM 타입
-- -------------------------------------------------------------
create type member_role   as enum ('MANAGER', 'EMPLOYEE');
create type member_status as enum ('ACTIVE', 'INACTIVE');
create type work_status   as enum ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
create type payroll_status as enum ('CALCULATED', 'CONFIRMED', 'PAID');
create type holiday_type  as enum ('PUBLIC', 'SUBSTITUTE', 'TEMPORARY');

-- -------------------------------------------------------------
-- 공통 트리거 함수: updated_at 자동 갱신
-- -------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------
-- profiles — 사용자 기본 정보 (auth.users 1:1)
-- -------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  email      text not null unique,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 회원가입 시 profiles 행 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------
-- stores — 매장
-- -------------------------------------------------------------
create table public.stores (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  owner_id       uuid not null references public.profiles(id) on delete restrict,
  address        text,
  -- 주휴수당 계산의 "주" 시작 요일. ISO 기준 1=월 ... 7=일
  week_start_day smallint not null default 1 check (week_start_day between 1 and 7),
  -- 알바생이 매장에 참여할 때 입력하는 코드
  join_code      text unique default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_stores_owner on public.stores(owner_id);

create trigger trg_stores_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- store_members — 매장-사용자 소속 관계
-- 모든 근무/급여 데이터의 기준 단위
-- -------------------------------------------------------------
create table public.store_members (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       member_role   not null,
  status     member_status not null default 'ACTIVE',
  joined_at  date not null default current_date,
  left_at    date,
  created_at timestamptz not null default now(),
  constraint uq_store_member unique (store_id, user_id, role),
  constraint chk_left_after_joined check (left_at is null or left_at >= joined_at)
);

create index idx_members_user  on public.store_members(user_id);
create index idx_members_store on public.store_members(store_id, status);

-- -------------------------------------------------------------
-- wage_history — 시급 변경 이력
-- 금액은 원 단위 integer. 기간 중첩은 GIST 제약으로 차단
-- -------------------------------------------------------------
create table public.wage_history (
  id              uuid primary key default gen_random_uuid(),
  store_member_id uuid not null references public.store_members(id) on delete cascade,
  -- 2026년 최저시급 10,030원. 매년 갱신 필요
  hourly_wage     integer not null check (hourly_wage >= 10030),
  effective_from  date not null,
  effective_to    date,
  memo            text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  constraint chk_wage_period check (effective_to is null or effective_to >= effective_from),
  -- 같은 멤버의 시급 적용 기간이 겹치면 INSERT 거부
  constraint excl_wage_overlap exclude using gist (
    store_member_id with =,
    daterange(effective_from, effective_to, '[]') with &&
  )
);

create index idx_wage_member on public.wage_history(store_member_id, effective_from desc);

-- 특정 날짜의 유효 시급 조회
create or replace function public.wage_at(p_member_id uuid, p_date date)
returns integer
language sql
stable
as $$
  select hourly_wage
  from public.wage_history
  where store_member_id = p_member_id
    and effective_from <= p_date
    and (effective_to is null or effective_to >= p_date)
  limit 1;
$$;

-- 시급 변경: 이전 이력 마감 + 신규 삽입을 원자적으로 처리
create or replace function public.set_wage(
  p_member_id uuid,
  p_wage      integer,
  p_from      date,
  p_memo      text default null
)
returns uuid
language plpgsql
security invoker          -- RLS 그대로 적용 (사장님만 통과)
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.wage_history
     set effective_to = p_from - 1
   where store_member_id = p_member_id
     and effective_to is null
     and effective_from < p_from;

  insert into public.wage_history
    (store_member_id, hourly_wage, effective_from, memo, created_by)
  values (p_member_id, p_wage, p_from, p_memo, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- -------------------------------------------------------------
-- work_records — 일별 근무기록
-- -------------------------------------------------------------
create table public.work_records (
  id               uuid primary key default gen_random_uuid(),
  store_member_id  uuid not null references public.store_members(id) on delete cascade,
  work_date        date not null,                 -- 출근일 기준
  start_time       time not null,
  end_time         time not null,
  crosses_midnight boolean not null default false, -- 익일 퇴근 여부
  break_minutes    integer not null default 0 check (break_minutes >= 0),
  work_minutes     integer not null default 0 check (work_minutes >= 0),
  status           work_status not null default 'DRAFT',
  memo             text,
  reject_reason    text,
  submitted_at     timestamptz,
  approved_by      uuid references public.profiles(id),
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint uq_work_per_day unique (store_member_id, work_date)
);

create index idx_work_member_date on public.work_records(store_member_id, work_date desc);
create index idx_work_pending on public.work_records(status) where status = 'SUBMITTED';

-- work_minutes 서버 계산 (클라이언트 값 무시)
create or replace function public.calc_work_minutes()
returns trigger
language plpgsql
as $$
declare
  v_total integer;
begin
  v_total := (extract(epoch from new.end_time) - extract(epoch from new.start_time))::integer / 60;

  if new.crosses_midnight then
    v_total := v_total + 1440;         -- 자정을 넘긴 경우 24시간 보정
  end if;

  if v_total <= 0 then
    raise exception '퇴근 시각이 출근 시각보다 빠릅니다. 자정을 넘긴 근무라면 crosses_midnight를 true로 설정하세요.';
  end if;

  new.work_minutes := v_total - new.break_minutes;

  if new.work_minutes <= 0 then
    raise exception '휴게시간이 총 근무시간보다 깁니다.';
  end if;

  if new.work_minutes > 1080 then      -- 하루 18시간 초과는 입력 오류로 간주
    raise exception '하루 근무시간이 18시간을 초과할 수 없습니다.';
  end if;

  return new;
end;
$$;

create trigger trg_work_minutes
  before insert or update of start_time, end_time, break_minutes, crosses_midnight
  on public.work_records
  for each row execute function public.calc_work_minutes();

create trigger trg_work_updated_at
  before update on public.work_records
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- weekly_summaries — 주간 집계 (주휴수당 계산 근거)
-- -------------------------------------------------------------
create table public.weekly_summaries (
  id                uuid primary key default gen_random_uuid(),
  store_member_id   uuid not null references public.store_members(id) on delete cascade,
  week_start        date not null,
  week_end          date not null,
  work_minutes      integer not null default 0,
  is_eligible       boolean not null default false,   -- 주 900분(15시간) 이상
  allowance_minutes integer not null default 0,       -- 주휴 환산 분, 최대 480
  calculated_at     timestamptz not null default now(),
  constraint uq_weekly unique (store_member_id, week_start),
  constraint chk_allowance_cap check (allowance_minutes between 0 and 480)
);

-- -------------------------------------------------------------
-- payrolls — 월별 급여 결과
-- -------------------------------------------------------------
create table public.payrolls (
  id                uuid primary key default gen_random_uuid(),
  store_member_id   uuid not null references public.store_members(id) on delete cascade,
  year              integer not null check (year between 2020 and 2100),
  month             integer not null check (month between 1 and 12),
  work_minutes      integer not null default 0,
  allowance_minutes integer not null default 0,
  base_pay          integer not null default 0,
  allowance_pay     integer not null default 0,
  total_pay         integer not null default 0,
  -- [{"from":"2026-08-01","to":"2026-08-14","wage":10030,"minutes":2400,"pay":401200}, ...]
  wage_breakdown    jsonb not null default '[]'::jsonb,
  status            payroll_status not null default 'CALCULATED',
  calculated_at     timestamptz not null default now(),
  confirmed_by      uuid references public.profiles(id),
  confirmed_at      timestamptz,
  constraint uq_payroll unique (store_member_id, year, month)
);

create index idx_payroll_member on public.payrolls(store_member_id, year desc, month desc);

-- 급여가 확정(CONFIRMED/PAID)된 월의 근무기록 변경 차단
create or replace function public.guard_confirmed_payroll()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(new.work_date, old.work_date);
  v_member uuid := coalesce(new.store_member_id, old.store_member_id);
begin
  if exists (
    select 1 from public.payrolls
    where store_member_id = v_member
      and year  = extract(year  from v_date)::int
      and month = extract(month from v_date)::int
      and status in ('CONFIRMED', 'PAID')
  ) then
    raise exception '급여가 확정된 월(%-%)의 근무기록은 수정할 수 없습니다.',
      extract(year from v_date), extract(month from v_date);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_guard_payroll
  before insert or update or delete on public.work_records
  for each row execute function public.guard_confirmed_payroll();

-- -------------------------------------------------------------
-- holidays — 공휴일 (전역 공용)
-- -------------------------------------------------------------
create table public.holidays (
  id                uuid primary key default gen_random_uuid(),
  holiday_date      date not null unique,
  name              text not null,
  type              holiday_type not null default 'PUBLIC',
  is_public_holiday boolean not null default true,
  source            text default 'data.go.kr',
  synced_at         timestamptz not null default now()
);

create index idx_holidays_date on public.holidays(holiday_date);
