create or replace function public.calculate_payroll(
  p_member_id uuid,
  p_year integer,
  p_month integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.store_members%rowtype;
  v_week_start_day integer;
  v_month_start date;
  v_month_end date;
  v_first_week date;
  v_last_week date;
  v_week date;
  v_range_from date;
  v_range_to date;
  v_week_minutes integer;
  v_allowance_minutes integer;
  v_work_minutes integer;
  v_base_pay integer;
  v_allowance_total integer := 0;
  v_allowance_pay integer := 0;
  v_last_work_date date;
  v_week_wage integer;
  v_breakdown jsonb;
  v_payroll_id uuid;
begin
  if p_year not between 2020 and 2100 or p_month not between 1 and 12 then
    raise exception '계산 연월이 올바르지 않습니다.';
  end if;

  select * into v_member from public.store_members where id = p_member_id;
  if not found then raise exception '구성원을 찾을 수 없습니다.'; end if;
  if not (public.owns_member(p_member_id) or public.can_manage_member(p_member_id)) then
    raise exception '급여를 계산할 권한이 없습니다.';
  end if;
  if exists (select 1 from public.payrolls where store_member_id = p_member_id and year = p_year and month = p_month and status in ('CONFIRMED', 'PAID')) then
    raise exception '이미 확정된 급여는 다시 계산할 수 없습니다.';
  end if;

  select week_start_day into v_week_start_day from public.stores where id = v_member.store_id;
  v_month_start := make_date(p_year, p_month, 1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_first_week := v_month_start - ((extract(isodow from v_month_start)::integer - v_week_start_day + 7) % 7);
  v_last_week := v_month_end - ((extract(isodow from v_month_end)::integer - v_week_start_day + 7) % 7);

  -- 이전 계산 규칙으로 저장된 월 경계 주간 집계까지 제거한 뒤 새 기준으로 다시 만든다.
  delete from public.weekly_summaries
  where store_member_id = p_member_id
    and week_start <= v_month_end
    and week_end >= v_month_start;

  v_week := v_first_week;
  while v_week <= v_last_week loop
    -- 월 경계에서 주를 자른다. 이전·다음 달 근무는 이번 달 주휴 계산에 합치지 않는다.
    v_range_from := greatest(v_week, v_month_start, v_member.joined_at);
    v_range_to := least(v_week + 6, v_month_end, coalesce(v_member.left_at, v_week + 6));
    if v_range_from <= v_range_to then
      select coalesce(sum(work_minutes), 0)::integer into v_week_minutes
      from public.work_records
      where store_member_id = p_member_id and status = 'APPROVED'
        and work_date between v_range_from and v_range_to;
      -- 주휴시간 = 주간 실근무시간 ÷ 5. 예: 26.5시간(1,590분) → 318분(5.3시간)
      v_allowance_minutes := case when v_week_minutes >= 900 then least(floor(v_week_minutes / 5.0)::integer, 480) else 0 end;

      insert into public.weekly_summaries (store_member_id, week_start, week_end, work_minutes, is_eligible, allowance_minutes, calculated_at)
      values (p_member_id, greatest(v_week, v_month_start), least(v_week + 6, v_month_end), v_week_minutes, v_week_minutes >= 900, v_allowance_minutes, now())
      on conflict (store_member_id, week_start) do update set
        week_end = excluded.week_end, work_minutes = excluded.work_minutes,
        is_eligible = excluded.is_eligible, allowance_minutes = excluded.allowance_minutes,
        calculated_at = excluded.calculated_at;

      v_allowance_total := v_allowance_total + v_allowance_minutes;
        select max(work_date) into v_last_work_date from public.work_records
        where store_member_id = p_member_id and status = 'APPROVED' and work_minutes > 0
          and work_date between v_range_from and v_range_to;
        if v_last_work_date is not null then
          v_week_wage := public.wage_at(p_member_id, v_last_work_date);
          if v_week_wage is not null then
            v_allowance_pay := v_allowance_pay + floor(v_allowance_minutes * v_week_wage / 60.0)::integer;
          end if;
        end if;
    end if;
    v_week := v_week + 7;
  end loop;

  select coalesce(sum(work_minutes), 0)::integer into v_work_minutes
  from public.work_records where store_member_id = p_member_id and status = 'APPROVED'
    and work_date between greatest(v_month_start, v_member.joined_at) and least(v_month_end, coalesce(v_member.left_at, v_month_end));

  with wage_rows as (
    select wh.effective_from as from_date,
      least(coalesce(wh.effective_to, v_month_end), v_month_end, coalesce(v_member.left_at, v_month_end)) as to_date,
      wh.hourly_wage,
      coalesce(sum(wr.work_minutes), 0)::integer as minutes
    from public.wage_history wh
    left join public.work_records wr on wr.store_member_id = wh.store_member_id and wr.status = 'APPROVED'
      and wr.work_date between greatest(wh.effective_from, v_month_start, v_member.joined_at)
                           and least(coalesce(wh.effective_to, v_month_end), v_month_end, coalesce(v_member.left_at, v_month_end))
    where wh.store_member_id = p_member_id
      and wh.effective_from <= v_month_end and coalesce(wh.effective_to, v_month_end) >= v_month_start
    group by wh.id, wh.effective_from, wh.effective_to, wh.hourly_wage
  ), priced as (
    select *, floor(minutes * hourly_wage / 60.0)::integer as pay from wage_rows where minutes > 0
  )
  select coalesce(sum(pay), 0)::integer,
    coalesce(jsonb_agg(jsonb_build_object('from', greatest(from_date, v_month_start, v_member.joined_at), 'to', to_date, 'wage', hourly_wage, 'minutes', minutes, 'pay', pay) order by from_date), '[]'::jsonb)
  into v_base_pay, v_breakdown from priced;

  insert into public.payrolls (store_member_id, year, month, work_minutes, allowance_minutes, base_pay, allowance_pay, total_pay, wage_breakdown, status, calculated_at)
  values (p_member_id, p_year, p_month, v_work_minutes, v_allowance_total, v_base_pay, v_allowance_pay, v_base_pay + v_allowance_pay, v_breakdown, 'CALCULATED', now())
  on conflict (store_member_id, year, month) do update set
    work_minutes = excluded.work_minutes, allowance_minutes = excluded.allowance_minutes,
    base_pay = excluded.base_pay, allowance_pay = excluded.allowance_pay,
    total_pay = excluded.total_pay, wage_breakdown = excluded.wage_breakdown,
    calculated_at = excluded.calculated_at
  returning id into v_payroll_id;
  return v_payroll_id;
end;
$$;

revoke all on function public.calculate_payroll(uuid, integer, integer) from public;
grant execute on function public.calculate_payroll(uuid, integer, integer) to authenticated;
