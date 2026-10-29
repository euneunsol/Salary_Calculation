-- 지급 완료(PAID) 처리를 실수로 눌렀을 때 사장님이 "급여 확정(CONFIRMED)" 상태로
-- 되돌릴 수 있도록 허용한다. PAID -> CALCULATED 로의 역행(계산 단계로 완전히 되돌리기)은
-- 여전히 금지한다 — 그 경우 해당 월 근무기록 잠금까지 함께 풀어야 해서 MVP 범위 밖이다.
create or replace function public.guard_payroll_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'PAID' and new.status = 'CALCULATED' then
    raise exception '지급 완료된 급여는 계산 상태로 되돌릴 수 없습니다.';
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
