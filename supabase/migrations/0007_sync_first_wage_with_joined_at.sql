-- 입사일이 변경되면 최초 시급 적용일도 같은 날짜로 맞춘다.
create or replace function public.sync_first_wage_with_joined_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_wage_id uuid;
  v_first_wage_to date;
begin
  select id, effective_to
    into v_first_wage_id, v_first_wage_to
  from public.wage_history
  where store_member_id = new.id
  order by effective_from asc
  limit 1;

  if v_first_wage_id is not null then
    if v_first_wage_to is not null and new.joined_at > v_first_wage_to then
      raise exception '입사일은 최초 시급 적용 종료일보다 늦을 수 없습니다.';
    end if;

    update public.wage_history
       set effective_from = new.joined_at
     where id = v_first_wage_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_first_wage_with_joined_at on public.store_members;
create trigger trg_sync_first_wage_with_joined_at
  after update of joined_at on public.store_members
  for each row
  when (old.joined_at is distinct from new.joined_at)
  execute function public.sync_first_wage_with_joined_at();

-- 이 마이그레이션 적용 전에 입사일만 앞당긴 기존 구성원도 즉시 보정한다.
with first_wages as (
  select distinct on (w.store_member_id)
    w.id,
    w.store_member_id,
    w.effective_from,
    w.effective_to
  from public.wage_history w
  order by w.store_member_id, w.effective_from asc
)
update public.wage_history w
   set effective_from = m.joined_at
  from first_wages f
  join public.store_members m on m.id = f.store_member_id
 where w.id = f.id
   and f.effective_from <> m.joined_at
   and (f.effective_to is null or m.joined_at <= f.effective_to);

