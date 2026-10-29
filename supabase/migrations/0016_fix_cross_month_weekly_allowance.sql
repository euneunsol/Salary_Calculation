-- 버그 수정: 주휴수당(weekly paid holiday allowance) 계산이 월 경계에서 근무시간을
-- 잘라버리던 문제를 고친다.
--
-- 기존(0012/0013) 동작: 한 주가 두 달에 걸치면(예: 7/27~8/2), 7월 계산과 8월 계산이
-- 각자 자기 달에 속한 날짜만 따로 합산해 각자 주휴 자격/시간을 판정했다.
-- 예: 7월분 20시간(단독 자격 충족) + 8월분 16시간(단독 자격 충족) → 두 조각 모두
-- 15시간 문턱을 우연히 넘기면 실제보다 시간이 부풀거나, 반대로 어느 한쪽도 15시간을
-- 못 채우면(예: 7월 10시간 + 8월 16시간 중 8월만 계산됨) 실제로는 총 26시간으로
-- 자격이 있는데도 그 사실이 왜곡되는 문제가 있었다. 즉 "주" 단위 규칙(15시간 이상 시
-- 발생, 40시간까지 ÷5, 최대 8시간)을 주 전체가 아니라 반쪽 시간에 적용하는 게 근본 원인.
--
-- 수정: 재직 기간(입사일/퇴사일)으로만 자른 "전체 달력 주"의 실근무시간으로 자격·시간을
-- 계산한다(더 이상 월 경계로 자르지 않는다). 그렇게 계산된 주휴수당은 "그 주가 끝나는
-- 날짜가 속한 달"에만 전액 귀속시켜, 한 주가 두 달에 걸쳐 중복 지급되지 않게 한다.
-- 기본급(실 근무시간·시급 구간)은 이 변경과 무관하게 항상 해당 월 범위로만 계산한다 —
-- 전월/익월 근무시간이 기본급에 다시 더해지는 일은 없다.
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

  -- 이 달에 귀속되는(=재직기간으로 자른 주가 "끝나는" 날짜가 이 달인) 주간 집계만 지운다.
  -- 주의 시작일이 전월/익월로 걸쳐 있어도 그 주는 "끝나는 달"에만 저장되므로,
  -- 예전(월 경계로 자른) 방식으로 저장된 행까지 이 조건으로 함께 정리된다.
  delete from public.weekly_summaries
  where store_member_id = p_member_id
    and week_end between v_month_start and v_month_end;

  v_week := v_first_week;
  while v_week <= v_last_week loop
    -- 주휴수당은 달력상 한 주 전체를 기준으로 계산한다 — 더 이상 월 경계로 시간을 자르지 않는다.
    -- 재직 기간(입사일/퇴사일)으로만 자른다.
    v_range_from := greatest(v_week, v_member.joined_at);
    v_range_to := least(v_week + 6, coalesce(v_member.left_at, v_week + 6));
    if v_range_from <= v_range_to then
      -- 귀속 규칙 — 이 주(재직기간으로 자른 뒤)가 끝나는 날짜가 이번 달에 속할 때만
      -- 이번 달 급여로 계산한다. 다음 달에서 끝나는 주는 그 달의 계산이 맡는다
      -- (한 주가 두 달에 걸쳐 중복 지급되지 않는다).
      if v_range_to between v_month_start and v_month_end then
        select coalesce(sum(work_minutes), 0)::integer into v_week_minutes
        from public.work_records
        where store_member_id = p_member_id and status = 'APPROVED'
          and work_date between v_range_from and v_range_to;
        -- 주휴시간 = 주간 실근무시간 ÷ 5. 예: 26.5시간(1,590분) → 318분(5.3시간)
        v_allowance_minutes := case when v_week_minutes >= 900 then least(floor(v_week_minutes / 5.0)::integer, 480) else 0 end;

        insert into public.weekly_summaries (store_member_id, week_start, week_end, work_minutes, is_eligible, allowance_minutes, calculated_at)
        values (p_member_id, v_range_from, v_range_to, v_week_minutes, v_week_minutes >= 900, v_allowance_minutes, now())
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
    end if;
    v_week := v_week + 7;
  end loop;

  -- 기본급(실 근무시간)은 이 수정과 무관하게 항상 해당 월 범위로만 계산한다 —
  -- 위 주휴 계산에서 참조한 전월/익월 근무시간이 여기에 다시 더해지지 않는다.
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
