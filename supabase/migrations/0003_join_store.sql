-- 참여 코드는 매장 행을 직접 공개하지 않고 이 함수 안에서만 확인한다.
create or replace function public.join_store_by_code(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select id into v_store_id
  from public.stores
  where join_code = upper(trim(p_join_code))
    and is_active = true;

  if v_store_id is null then
    raise exception '유효하지 않은 참여 코드입니다.';
  end if;

  insert into public.store_members (store_id, user_id, role, status, joined_at, left_at)
  values (v_store_id, auth.uid(), 'EMPLOYEE', 'ACTIVE', current_date, null)
  on conflict (store_id, user_id, role)
  do update set status = 'ACTIVE', joined_at = current_date, left_at = null
  returning id into v_member_id;

  return v_member_id;
end;
$$;

revoke all on function public.join_store_by_code(text) from public;
grant execute on function public.join_store_by_code(text) to authenticated;

