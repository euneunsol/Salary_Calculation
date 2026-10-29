create or replace function public.guard_payroll_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'PAID' and new.status <> 'PAID' then
    raise exception '지급 완료된 급여 상태는 되돌릴 수 없습니다.';
  end if;
  if old.status = 'CONFIRMED' and new.status = 'CALCULATED' then
    raise exception '확정된 급여는 계산 상태로 되돌릴 수 없습니다.';
  end if;
  if old.status = 'CALCULATED' and new.status = 'PAID' then
    raise exception '급여 확정 후 지급 완료로 변경해주세요.';
  end if;
  if new.status in ('CONFIRMED', 'PAID') and not public.owns_member_store(new.store_member_id) then
    raise exception '사장님만 급여 상태를 변경할 수 있습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_payroll_status_transition on public.payrolls;
create trigger trg_guard_payroll_status_transition
before update of status on public.payrolls
for each row execute function public.guard_payroll_status_transition();
