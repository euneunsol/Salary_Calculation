alter table public.stores
  add column if not exists open_time time not null default '09:00',
  add column if not exists close_time time not null default '18:00';

alter table public.work_records
  drop constraint if exists work_records_break_minutes_check;

alter table public.work_records
  add constraint work_records_break_minutes_check
  check (break_minutes in (0, 30, 60)) not valid;

create or replace function public.set_store_operating_hours(
  p_store_id uuid,
  p_open_time time,
  p_close_time time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_open_time = p_close_time then
    raise exception '오픈 시간과 마감 시간은 달라야 합니다.';
  end if;

  if not exists (
    select 1 from public.stores s
    where s.id = p_store_id
      and (s.owner_id = auth.uid() or exists (
        select 1 from public.store_members sm
        where sm.store_id = s.id and sm.user_id = auth.uid()
          and sm.role = 'MANAGER' and sm.status = 'ACTIVE'
      ))
  ) then
    raise exception '매장 운영시간을 변경할 권한이 없습니다.';
  end if;

  update public.stores
  set open_time = p_open_time, close_time = p_close_time, updated_at = now()
  where id = p_store_id;
end;
$$;

revoke all on function public.set_store_operating_hours(uuid, time, time) from public;
grant execute on function public.set_store_operating_hours(uuid, time, time) to authenticated;
