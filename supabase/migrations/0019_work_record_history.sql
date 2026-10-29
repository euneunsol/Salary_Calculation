-- 승인 이후 수정 표시는 급여 집계 상태(APPROVED)와 별도로 관리한다.
alter table public.work_records add column manager_modified_at timestamptz;

create table public.work_record_history (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  store_member_id uuid not null references public.store_members(id),
  work_record_id uuid not null,
  work_date date not null,
  action text not null check (action in ('MODIFIED', 'DELETED')),
  actor_id uuid not null references public.profiles(id),
  actor_name text not null,
  member_name text not null,
  before_record jsonb not null,
  after_record jsonb,
  created_at timestamptz not null default now()
);
create index idx_work_record_history_store_date on public.work_record_history(store_id, work_date, created_at desc);
alter table public.work_record_history enable row level security;
create policy "사장님과 매니저는 근무 변경이력 조회" on public.work_record_history
  for select to authenticated using (public.is_store_owner(store_id) or public.is_store_manager(store_id));
grant select on public.work_record_history to authenticated;
revoke insert, update, delete on public.work_record_history from authenticated, anon;

create or replace function public.record_manager_work_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_store_id uuid;
  v_member_name text;
  v_actor_name text;
begin
  if tg_op = 'INSERT' then
    new.manager_modified_at := null;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.manager_modified_at := old.manager_modified_at;
    if old.status <> 'APPROVED' or
      row(old.work_date, old.start_time, old.end_time, old.crosses_midnight, old.break_minutes, old.memo)
      is not distinct from
      row(new.work_date, new.start_time, new.end_time, new.crosses_midnight, new.break_minutes, new.memo) then
      return new;
    end if;
  elsif old.status <> 'APPROVED' then
    return old;
  end if;
  if not public.can_review_member(old.store_member_id) then
    raise exception '담당 매니저만 승인 근무를 변경할 수 있습니다.';
  end if;
  select m.store_id, p.name into v_store_id, v_member_name
    from public.store_members m join public.profiles p on p.id = m.user_id
    where m.id = old.store_member_id;
  select name into v_actor_name from public.profiles where id = auth.uid();
  if tg_op = 'UPDATE' then new.manager_modified_at := now(); end if;
  insert into public.work_record_history
    (store_id, store_member_id, work_record_id, work_date, action, actor_id, actor_name, member_name, before_record, after_record)
    values (v_store_id, old.store_member_id, old.id, old.work_date,
      case when tg_op = 'DELETE' then 'DELETED' else 'MODIFIED' end,
      auth.uid(), coalesce(v_actor_name, '매니저'), coalesce(v_member_name, '구성원'), to_jsonb(old),
      case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger trg_z_record_manager_work_change before insert or update or delete on public.work_records
  for each row execute function public.record_manager_work_change();

-- 승인된 근무 삭제과 급여 재계산을 한 트랜잭션으로 처리한다.
create or replace function public.manager_delete_approved_work(
  p_record_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.work_records%rowtype;
  v_payroll public.payrolls%rowtype;
  v_week_end date;
  v_week_start integer;
  v_left_at date;

  v_ids uuid[] := '{}';
begin
  select * into v_record from public.work_records where id = p_record_id for update;
  if not found or not public.can_review_member(v_record.store_member_id) then
    raise exception '담당 매장의 매니저만 근무기록을 삭제할 수 있습니다.';
  end if;
  if v_record.status <> 'APPROVED' then
    raise exception '승인 완료된 근무기록만 삭제할 수 있습니다.';
  end if;
  if p_expected_updated_at is null or v_record.updated_at is distinct from p_expected_updated_at then
    raise exception '근무기록이 변경되었습니다. 새로고침 후 다시 시도해주세요.';
  end if;
  select s.week_start_day, m.left_at into v_week_start, v_left_at
    from public.store_members m join public.stores s on s.id = m.store_id
    where m.id = v_record.store_member_id;
  v_week_end := v_record.work_date
    - ((extract(isodow from v_record.work_date)::integer - v_week_start + 7) % 7) + 6;
  v_week_end := least(v_week_end, coalesce(v_left_at, v_week_end));

  -- 월말 근무는 다음 달 주휴수당에도 영향을 줄 수 있다.
  -- 지급 처리와 같은 행 잠금을 사용해 지급/삭제 동시 실행을 직렬화한다.
  for v_payroll in
    select * from public.payrolls
    where store_member_id = v_record.store_member_id
      and make_date(year, month, 1) in (
        date_trunc('month', v_record.work_date)::date,
        date_trunc('month', v_week_end)::date
      )
    order by year, month for update
  loop
    if v_payroll.status = 'PAID' then
      raise exception '이미 지급 완료된 급여에 영향을 주는 근무기록은 삭제할 수 없습니다.';
    end if;
    v_ids := array_append(v_ids, v_payroll.id);
    if v_payroll.status = 'CONFIRMED' then
      update public.payrolls set status = 'CALCULATED', confirmed_by = null, confirmed_at = null
        where id = v_payroll.id;
    end if;
  end loop;

  delete from public.work_records where id = p_record_id;

  for v_payroll in select * from public.payrolls where id = any(v_ids)
  loop
    perform public.calculate_payroll(v_payroll.store_member_id, v_payroll.year, v_payroll.month);
  end loop;
end;
$$;

revoke all on function public.manager_delete_approved_work(uuid, timestamptz) from public;
grant execute on function public.manager_delete_approved_work(uuid, timestamptz) to authenticated;
