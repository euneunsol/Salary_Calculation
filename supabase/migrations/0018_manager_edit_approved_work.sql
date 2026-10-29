-- 승인된 근무 수정과 급여 재계산을 한 트랜잭션으로 처리한다.
create or replace function public.manager_edit_approved_work(
  p_record_id uuid,
  p_start_time time,
  p_end_time time,
  p_crosses_midnight boolean,
  p_break_minutes integer,
  p_memo text,
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
  v_minutes integer;
  v_ids uuid[] := '{}';
begin
  select * into v_record from public.work_records where id = p_record_id for update;
  if not found or not public.can_review_member(v_record.store_member_id) then
    raise exception '담당 매장의 매니저만 근무기록을 수정할 수 있습니다.';
  end if;
  if v_record.status <> 'APPROVED' then
    raise exception '승인 완료된 근무기록만 수정할 수 있습니다.';
  end if;
  if p_expected_updated_at is null or v_record.updated_at is distinct from p_expected_updated_at then
    raise exception '근무기록이 변경되었습니다. 새로고침 후 다시 시도해주세요.';
  end if;
  v_minutes := extract(epoch from (p_end_time - p_start_time))::integer / 60
    + case when p_crosses_midnight then 1440 else 0 end - p_break_minutes;
  if p_start_time is null or p_end_time is null or p_crosses_midnight is null
     or p_break_minutes is null or p_break_minutes not in (0, 30, 60)
     or v_minutes <= 0 or v_minutes > 1080 then
    raise exception '근무시간과 휴게시간을 확인해주세요. 실 근무시간은 18시간 이하여야 합니다.';
  end if;

  select s.week_start_day, m.left_at into v_week_start, v_left_at
    from public.store_members m join public.stores s on s.id = m.store_id
    where m.id = v_record.store_member_id;
  v_week_end := v_record.work_date
    - ((extract(isodow from v_record.work_date)::integer - v_week_start + 7) % 7) + 6;
  v_week_end := least(v_week_end, coalesce(v_left_at, v_week_end));

  -- 월말 근무는 다음 달 주휴수당에도 영향을 줄 수 있다.
  -- 지급 처리와 같은 행 잠금을 사용해 지급/수정 동시 실행을 직렬화한다.
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
      raise exception '이미 지급 완료된 급여에 영향을 주는 근무기록은 수정할 수 없습니다.';
    end if;
    v_ids := array_append(v_ids, v_payroll.id);
    if v_payroll.status = 'CONFIRMED' then
      update public.payrolls set status = 'CALCULATED', confirmed_by = null, confirmed_at = null
        where id = v_payroll.id;
    end if;
  end loop;

  update public.work_records set start_time = p_start_time, end_time = p_end_time,
    crosses_midnight = p_crosses_midnight, break_minutes = p_break_minutes,
    memo = nullif(trim(p_memo), ''), approved_by = auth.uid(), approved_at = now()
    where id = p_record_id;

  for v_payroll in select * from public.payrolls where id = any(v_ids)
  loop
    perform public.calculate_payroll(v_payroll.store_member_id, v_payroll.year, v_payroll.month);
  end loop;
end;
$$;

revoke all on function public.manager_edit_approved_work(uuid, time, time, boolean, integer, text, timestamptz) from public;
grant execute on function public.manager_edit_approved_work(uuid, time, time, boolean, integer, text, timestamptz) to authenticated;
