-- 최초 시급은 입사일부터 적용되어야 급여 미산정 구간이 생기지 않는다.
create or replace function public.set_wage(
  p_member_id uuid,
  p_wage      integer,
  p_from      date,
  p_memo      text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_joined_at date;
  v_has_wage boolean;
begin
  select joined_at into v_joined_at
  from public.store_members
  where id = p_member_id;

  if v_joined_at is null then
    raise exception '구성원 정보를 찾을 수 없습니다.';
  end if;

  select exists (
    select 1 from public.wage_history where store_member_id = p_member_id
  ) into v_has_wage;

  if not v_has_wage and p_from <> v_joined_at then
    raise exception '최초 시급 적용일은 입사일(%)과 같아야 합니다.', v_joined_at;
  end if;

  if p_from < v_joined_at then
    raise exception '시급 적용일은 입사일보다 빠를 수 없습니다.';
  end if;

  update public.wage_history
     set effective_to = p_from - 1
   where store_member_id = p_member_id
     and effective_to is null
     and effective_from < p_from;

  insert into public.wage_history
    (store_member_id, hourly_wage, effective_from, memo, created_by)
  values (p_member_id, p_wage, p_from, p_memo, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

