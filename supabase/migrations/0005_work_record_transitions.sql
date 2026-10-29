-- 알바생은 DRAFT/REJECTED 기록만 수정할 수 있고 SUBMITTED로 제출할 수 있다.
drop policy if exists "본인은 미승인 기록만 수정" on public.work_records;
create policy "본인은 작성중 기록만 수정"
  on public.work_records for update
  using (public.owns_member(store_member_id) and status in ('DRAFT', 'REJECTED'))
  with check (public.owns_member(store_member_id) and status in ('DRAFT', 'REJECTED', 'SUBMITTED'));

-- RLS만으로는 승인 컬럼과 상태 전이를 완전히 비교할 수 없어 트리거로 보강한다.
create or replace function public.guard_employee_work_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := coalesce(new.store_member_id, old.store_member_id);
begin
  if public.can_manage_member(v_member_id) then
    return new;
  end if;

  if not public.owns_member(v_member_id) then
    raise exception '본인의 근무기록만 변경할 수 있습니다.';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' or new.approved_by is not null or new.approved_at is not null then
      raise exception '새 근무기록은 임시저장 상태로만 등록할 수 있습니다.';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status not in ('DRAFT', 'REJECTED') then
      raise exception '제출 또는 승인된 근무기록은 수정할 수 없습니다.';
    end if;
    if new.status not in ('DRAFT', 'REJECTED', 'SUBMITTED') then
      raise exception '허용되지 않은 상태 변경입니다.';
    end if;
    if new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at then
      raise exception '승인 정보는 변경할 수 없습니다.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_employee_work_record on public.work_records;
create trigger trg_guard_employee_work_record
  before insert or update on public.work_records
  for each row execute function public.guard_employee_work_record();

