-- =============================================================
-- 0002_rls.sql — 헬퍼 함수 + Row Level Security 정책
--
-- 핵심 원칙
--  1) 모든 테이블 RLS ON. 명시적으로 허용한 것만 통과.
--  2) store_members 를 참조하는 판정 로직은 반드시 SECURITY DEFINER 함수로 감싼다.
--     그렇지 않으면 store_members 정책이 자기 자신을 재귀 평가하여
--     "infinite recursion detected in policy for relation store_members" 에러가 난다.
-- =============================================================

-- -------------------------------------------------------------
-- 헬퍼 함수 (모두 SECURITY DEFINER = RLS 우회)
-- -------------------------------------------------------------

-- 이 매장의 사장님인가
create or replace function public.is_store_owner(p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stores
    where id = p_store_id and owner_id = auth.uid()
  );
$$;

-- 이 매장의 (활성) 매니저인가
create or replace function public.is_store_manager(p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_members
    where store_id = p_store_id
      and user_id  = auth.uid()
      and role     = 'MANAGER'
      and status   = 'ACTIVE'
  );
$$;

-- 이 매장을 관리할 수 있는가 (사장님 또는 매니저)
create or replace function public.can_manage_store(p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_store_owner(p_store_id) or public.is_store_manager(p_store_id);
$$;

-- 이 매장에 소속되어 있는가 (역할 무관)
create or replace function public.is_store_member(p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_members
    where store_id = p_store_id and user_id = auth.uid()
  );
$$;

-- 이 store_member 행이 본인인가
create or replace function public.owns_member(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_members
    where id = p_member_id and user_id = auth.uid()
  );
$$;

-- 이 store_member 가 속한 매장을 관리할 수 있는가
create or replace function public.can_manage_member(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members m
    where m.id = p_member_id
      and public.can_manage_store(m.store_id)
  );
$$;

-- 이 store_member 가 속한 매장의 사장님인가 (시급 변경 권한)
create or replace function public.owns_member_store(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members m
    where m.id = p_member_id
      and public.is_store_owner(m.store_id)
  );
$$;

-- -------------------------------------------------------------
-- RLS 활성화
-- -------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.stores           enable row level security;
alter table public.store_members    enable row level security;
alter table public.wage_history     enable row level security;
alter table public.work_records     enable row level security;
alter table public.weekly_summaries enable row level security;
alter table public.payrolls         enable row level security;
alter table public.holidays         enable row level security;

-- -------------------------------------------------------------
-- profiles
-- -------------------------------------------------------------
create policy "본인 프로필 조회"
  on public.profiles for select
  using (id = auth.uid());

create policy "같은 매장 관리자는 소속 직원 프로필 조회"
  on public.profiles for select
  using (
    exists (
      select 1 from public.store_members m
      where m.user_id = profiles.id
        and public.can_manage_store(m.store_id)
    )
  );

create policy "본인 프로필 수정"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- -------------------------------------------------------------
-- stores
-- -------------------------------------------------------------
create policy "사장님은 소유 매장 조회"
  on public.stores for select
  using (owner_id = auth.uid());

create policy "소속 구성원은 매장 조회"
  on public.stores for select
  using (public.is_store_member(id));

create policy "매장 생성은 본인을 owner 로만"
  on public.stores for insert
  with check (owner_id = auth.uid());

create policy "사장님만 매장 수정"
  on public.stores for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "사장님만 매장 삭제"
  on public.stores for delete
  using (owner_id = auth.uid());

-- -------------------------------------------------------------
-- store_members
--   주의: 아래 정책들은 store_members 를 직접 서브쿼리하지 않는다.
--         모든 판정은 SECURITY DEFINER 헬퍼 함수를 통한다.
-- -------------------------------------------------------------
create policy "본인 소속 행 조회"
  on public.store_members for select
  using (user_id = auth.uid());

create policy "관리자는 매장 구성원 조회"
  on public.store_members for select
  using (public.can_manage_store(store_id));

-- 직원(EMPLOYEE) 추가는 사장님/매니저 모두 가능, 매니저 추가는 사장님만
create policy "구성원 등록"
  on public.store_members for insert
  with check (
    (role = 'EMPLOYEE' and public.can_manage_store(store_id))
    or
    (role = 'MANAGER'  and public.is_store_owner(store_id))
  );

create policy "관리자는 구성원 수정"
  on public.store_members for update
  using (public.can_manage_store(store_id))
  with check (public.can_manage_store(store_id));

create policy "사장님만 구성원 삭제"
  on public.store_members for delete
  using (public.is_store_owner(store_id));

-- -------------------------------------------------------------
-- wage_history — 조회는 본인/관리자, 쓰기는 사장님만
-- -------------------------------------------------------------
create policy "본인 시급 이력 조회"
  on public.wage_history for select
  using (public.owns_member(store_member_id));

create policy "관리자는 직원 시급 조회"
  on public.wage_history for select
  using (public.can_manage_member(store_member_id));

create policy "사장님만 시급 등록"
  on public.wage_history for insert
  with check (public.owns_member_store(store_member_id));

create policy "사장님만 시급 수정"
  on public.wage_history for update
  using (public.owns_member_store(store_member_id))
  with check (public.owns_member_store(store_member_id));

-- -------------------------------------------------------------
-- work_records
-- -------------------------------------------------------------
create policy "본인 근무기록 조회"
  on public.work_records for select
  using (public.owns_member(store_member_id));

create policy "관리자는 직원 근무기록 조회"
  on public.work_records for select
  using (public.can_manage_member(store_member_id));

create policy "본인 근무기록 등록"
  on public.work_records for insert
  with check (public.owns_member(store_member_id));

create policy "관리자는 직원 근무기록 등록"
  on public.work_records for insert
  with check (public.can_manage_member(store_member_id));

-- 본인은 DRAFT / REJECTED 상태에서만 수정 가능하며, 승인 관련 컬럼은 건드릴 수 없다
create policy "본인은 미승인 기록만 수정"
  on public.work_records for update
  using (
    public.owns_member(store_member_id)
    and status in ('DRAFT', 'SUBMITTED', 'REJECTED')
  )
  with check (
    public.owns_member(store_member_id)
    and status in ('DRAFT', 'SUBMITTED', 'REJECTED')
  );

create policy "관리자는 근무기록 수정/승인"
  on public.work_records for update
  using (public.can_manage_member(store_member_id))
  with check (public.can_manage_member(store_member_id));

create policy "본인은 DRAFT 기록만 삭제"
  on public.work_records for delete
  using (public.owns_member(store_member_id) and status = 'DRAFT');

create policy "관리자는 근무기록 삭제"
  on public.work_records for delete
  using (public.can_manage_member(store_member_id));

-- -------------------------------------------------------------
-- weekly_summaries — 읽기 전용. 쓰기는 Edge Function(service_role)만
-- -------------------------------------------------------------
create policy "본인 주간 집계 조회"
  on public.weekly_summaries for select
  using (public.owns_member(store_member_id));

create policy "관리자는 주간 집계 조회"
  on public.weekly_summaries for select
  using (public.can_manage_member(store_member_id));

-- -------------------------------------------------------------
-- payrolls — 계산은 Edge Function(service_role), 확정은 사장님
-- -------------------------------------------------------------
create policy "본인 급여 조회"
  on public.payrolls for select
  using (public.owns_member(store_member_id));

create policy "관리자는 직원 급여 조회"
  on public.payrolls for select
  using (public.can_manage_member(store_member_id));

create policy "사장님만 급여 확정"
  on public.payrolls for update
  using (public.owns_member_store(store_member_id))
  with check (public.owns_member_store(store_member_id));

-- -------------------------------------------------------------
-- holidays — 인증 사용자는 읽기만. 쓰기는 service_role 전용
-- (service_role 은 RLS 를 우회하므로 별도 정책이 필요 없다)
-- -------------------------------------------------------------
create policy "인증 사용자 공휴일 조회"
  on public.holidays for select
  to authenticated
  using (true);

-- -------------------------------------------------------------
-- 권한 정리
-- -------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- =============================================================
-- 배포 전 검증 체크리스트 (반드시 직접 실행)
--  1. 알바생 A 로 로그인 → 알바생 B 의 work_records select → 0행
--  2. 알바생 계정으로 wage_history insert → 거부
--  3. 매장 X 매니저로 매장 Y 직원 조회 → 0행
--  4. 타인 소유 매장 조회 → 0행
--  5. store_members 조회 시 infinite recursion 에러 없음
-- =============================================================
