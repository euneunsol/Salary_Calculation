create table public.store_manager_invites (
  store_id   uuid primary key references public.stores(id) on delete cascade,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8)),
  created_at timestamptz not null default now()
);

insert into public.store_manager_invites (store_id)
select id from public.stores
on conflict (store_id) do nothing;

create or replace function public.create_store_manager_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.store_manager_invites (store_id) values (new.id);
  return new;
end;
$$;

create trigger trg_create_store_manager_invite
  after insert on public.stores
  for each row execute function public.create_store_manager_invite();

alter table public.store_manager_invites enable row level security;
create policy "사장님은 매니저 초대코드 조회"
  on public.store_manager_invites for select
  using (public.is_store_owner(store_id));

create policy "사장님은 매니저 초대코드 변경"
  on public.store_manager_invites for update
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create or replace function public.join_store_as_manager(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_member_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;

  select i.store_id into v_store_id
  from public.store_manager_invites i
  join public.stores s on s.id = i.store_id
  where i.invite_code = upper(trim(p_invite_code)) and s.is_active = true;

  if v_store_id is null then raise exception '유효하지 않은 매니저 초대 코드입니다.'; end if;

  insert into public.store_members (store_id, user_id, role, status, joined_at, left_at)
  values (v_store_id, auth.uid(), 'MANAGER', 'ACTIVE', current_date, null)
  on conflict (store_id, user_id, role)
  do update set status = 'ACTIVE', joined_at = current_date, left_at = null
  returning id into v_member_id;

  return v_member_id;
end;
$$;

revoke all on function public.join_store_as_manager(text) from public;
grant select, update on public.store_manager_invites to authenticated;
grant execute on function public.join_store_as_manager(text) to authenticated;

