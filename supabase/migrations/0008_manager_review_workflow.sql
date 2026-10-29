create type change_request_status as enum ('PENDING', 'APPLIED', 'REJECTED');

create table public.work_record_change_requests (
  id               uuid primary key default gen_random_uuid(),
  work_record_id   uuid not null references public.work_records(id) on delete cascade,
  requester_id     uuid not null references public.profiles(id) on delete cascade,
  reason           text not null check (length(trim(reason)) > 0),
  start_time       time not null,
  end_time         time not null,
  crosses_midnight boolean not null default false,
  break_minutes    integer not null default 0 check (break_minutes >= 0),
  memo             text,
  status           change_request_status not null default 'PENDING',
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create unique index uq_pending_work_change_request
  on public.work_record_change_requests(work_record_id)
  where status = 'PENDING';

create index idx_work_change_request_record
  on public.work_record_change_requests(work_record_id, created_at desc);

alter table public.work_record_change_requests enable row level security;

-- store_member가 속한 매장의 활성 매니저만 검토할 수 있다.
create or replace function public.can_review_member(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_members m
    where m.id = p_member_id
      and public.is_store_manager(m.store_id)
  );
$$;

-- 기존 can_manage_member에는 사장님도 포함되므로 근무 검토 정책을 분리한다.
drop policy if exists "관리자는 직원 근무기록 조회" on public.work_records;
drop policy if exists "관리자는 직원 근무기록 수정/승인" on public.work_records;

create policy "매니저는 매장 근무기록 조회"
  on public.work_records for select
  using (public.can_review_member(store_member_id));

create policy "사장님은 승인 완료 근무기록 조회"
  on public.work_records for select
  using (status = 'APPROVED' and public.owns_member_store(store_member_id));

create policy "매니저는 제출 근무기록 수정 승인"
  on public.work_records for update
  using (public.can_review_member(store_member_id))
  with check (public.can_review_member(store_member_id));

-- 구성원 역할 변경은 사장님만 가능하다. 매니저는 알바생의 재직 상태만 관리한다.
drop policy if exists "관리자는 구성원 수정" on public.store_members;
create policy "사장님은 구성원 수정"
  on public.store_members for update
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy "매니저는 알바생 상태 수정"
  on public.store_members for update
  using (role = 'EMPLOYEE' and public.is_store_manager(store_id))
  with check (role = 'EMPLOYEE' and public.is_store_manager(store_id));

create policy "본인 수정요청 조회"
  on public.work_record_change_requests for select
  using (requester_id = auth.uid());

create policy "본인 수정요청 등록"
  on public.work_record_change_requests for insert
  with check (
    requester_id = auth.uid()
    and exists (
      select 1 from public.work_records w
      where w.id = work_record_id
        and w.status = 'SUBMITTED'
        and public.owns_member(w.store_member_id)
    )
  );

create policy "매니저 수정요청 조회"
  on public.work_record_change_requests for select
  using (
    exists (
      select 1 from public.work_records w
      where w.id = work_record_id
        and public.can_review_member(w.store_member_id)
    )
  );

create policy "매니저 수정요청 처리"
  on public.work_record_change_requests for update
  using (
    exists (
      select 1 from public.work_records w
      where w.id = work_record_id
        and public.can_review_member(w.store_member_id)
    )
  )
  with check (
    exists (
      select 1 from public.work_records w
      where w.id = work_record_id
        and public.can_review_member(w.store_member_id)
    )
  );

-- 매니저가 수정요청을 승인하면 제안 내용을 근무기록에 반영한다.
create or replace function public.review_work_change_request(
  p_request_id uuid,
  p_apply boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.work_record_change_requests%rowtype;
  v_member_id uuid;
begin
  select * into v_request
  from public.work_record_change_requests
  where id = p_request_id and status = 'PENDING'
  for update;

  if v_request.id is null then
    raise exception '처리할 수정요청을 찾을 수 없습니다.';
  end if;

  select store_member_id into v_member_id
  from public.work_records
  where id = v_request.work_record_id and status = 'SUBMITTED';

  if v_member_id is null or not public.can_review_member(v_member_id) then
    raise exception '수정요청을 처리할 권한이 없습니다.';
  end if;

  if p_apply then
    update public.work_records
       set start_time = v_request.start_time,
           end_time = v_request.end_time,
           crosses_midnight = v_request.crosses_midnight,
           break_minutes = v_request.break_minutes,
           memo = v_request.memo
     where id = v_request.work_record_id;
  end if;

  update public.work_record_change_requests
     set status = case when p_apply then 'APPLIED' else 'REJECTED' end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_request_id;
end;
$$;

grant select, insert, update on public.work_record_change_requests to authenticated;
grant execute on function public.can_review_member(uuid) to authenticated;
grant execute on function public.review_work_change_request(uuid, boolean) to authenticated;
