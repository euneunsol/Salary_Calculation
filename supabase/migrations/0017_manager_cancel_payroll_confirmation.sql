-- 확정(CONFIRMED)된 급여를 다시 계산(CALCULATED) 상태로 되돌리는 "확정취소"를 허용한다.
-- 사장님은 이미 급여 UPDATE 권한이 있으므로 트리거만 풀어주면 되고,
-- 매니저는 이 전이(CONFIRMED -> CALCULATED)에 한해서만 새 RLS 정책으로 허용한다.
-- 확정취소되면(work_records 잠금은 payrolls.status를 참조하는 기존 트리거가
-- 자동으로 다시 풀어준다 — 별도 수정 불필요) 해당 월 근무기록을 다시 승인/반려할 수 있다.

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
  if old.status = 'CALCULATED' and new.status = 'PAID' then
    raise exception '급여 확정 후 지급 완료로 변경해주세요.';
  end if;
  if new.status in ('CONFIRMED', 'PAID') and not public.owns_member_store(new.store_member_id) then
    raise exception '사장님만 급여를 확정하거나 지급 완료로 처리할 수 있습니다.';
  end if;
  return new;
end;
$$;

-- 매니저: 담당 매장의 "확정된" 급여를 "계산 완료" 상태로 되돌리는 것만 허용한다.
-- (확정 자체나 지급 완료 처리는 여전히 사장님만 가능 — 위 트리거가 막는다.)
create policy "매니저는 담당 매장 급여 확정취소만 가능"
  on public.payrolls for update
  using (public.can_manage_member(store_member_id) and status = 'CONFIRMED')
  with check (public.can_manage_member(store_member_id) and status = 'CALCULATED');
