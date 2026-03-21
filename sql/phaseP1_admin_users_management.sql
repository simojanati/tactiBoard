-- Fixed for instances where auth.users.confirmed_at is generated
-- Phase P1: Admin-managed user creation and inline role/team editing
create extension if not exists pgcrypto with schema extensions;

alter table public.profiles add column if not exists updated_at timestamptz default now();
update public.profiles set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;
alter table public.profiles alter column is_active set default true;

alter table public.players enable row level security;
alter table public.coaches enable row level security;

drop policy if exists "Admins can delete players" on public.players;
create policy "Admins can delete players"
on public.players
for delete
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "Admins can delete coaches" on public.coaches;
create policy "Admins can delete coaches"
on public.coaches
for delete
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create or replace function public.sync_profile_role_records(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  prof public.profiles%rowtype;
  existing_player_id bigint;
  existing_coach_id bigint;
begin
  select * into prof from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'Profile not found';
  end if;

  if prof.role = 'player' then
    delete from public.coaches where profile_id = prof.id;
    if prof.requested_team_id is not null then
      select id into existing_player_id from public.players where profile_id = prof.id order by id desc limit 1;
      if existing_player_id is null then
        insert into public.players (team_id, profile_id, full_name, status)
        values (prof.requested_team_id, prof.id, coalesce(prof.full_name, prof.email, 'Player'), 'active');
      else
        update public.players
        set team_id = prof.requested_team_id,
            full_name = coalesce(prof.full_name, prof.email, 'Player'),
            status = 'active'
        where id = existing_player_id;
      end if;
    end if;
  elsif prof.role = 'coach' then
    delete from public.players where profile_id = prof.id;
    if prof.requested_team_id is not null then
      select id into existing_coach_id from public.coaches where profile_id = prof.id order by id desc limit 1;
      if existing_coach_id is null then
        insert into public.coaches (team_id, profile_id, full_name, email, role)
        values (prof.requested_team_id, prof.id, coalesce(prof.full_name, prof.email, 'Coach'), coalesce(prof.email, ''), 'Coach');
      else
        update public.coaches
        set team_id = prof.requested_team_id,
            full_name = coalesce(prof.full_name, prof.email, 'Coach'),
            email = coalesce(prof.email, ''),
            role = 'Coach'
        where id = existing_coach_id;
      end if;
    end if;
  else
    delete from public.players where profile_id = prof.id;
    delete from public.coaches where profile_id = prof.id;
  end if;
end;
$$;

create or replace function public.admin_update_user_role_team(
  p_profile_id uuid,
  p_role text,
  p_requested_team_id bigint default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_role text;
  updated_row public.profiles;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role <> 'admin' then
    raise exception 'Admin access required';
  end if;

  update public.profiles
  set role = case when p_role in ('admin','coach','player') then p_role else role end,
      requested_team_id = case when p_role = 'admin' then null else p_requested_team_id end,
      updated_at = now()
  where id = p_profile_id
  returning * into updated_row;

  if not found then
    raise exception 'User not found';
  end if;

  perform public.sync_profile_role_records(updated_row.id);

  select * into updated_row from public.profiles where id = p_profile_id;
  return updated_row;
end;
$$;

create or replace function public.admin_create_managed_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text,
  p_requested_team_id bigint default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_role text;
  v_user_id uuid;
  v_email text;
  v_role text;
  created_profile public.profiles;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role <> 'admin' then
    raise exception 'Admin access required';
  end if;

  v_email := lower(trim(coalesce(p_email,'')));
  if v_email = '' then
    raise exception 'Email is required';
  end if;
  if coalesce(length(p_password),0) < 6 then
    raise exception 'Password must contain at least 6 characters';
  end if;
  if exists(select 1 from auth.users where lower(email) = v_email) then
    raise exception 'A user already exists with this email';
  end if;

  v_role := case when p_role in ('admin','coach','player') then p_role else 'player' end;
  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', coalesce(nullif(trim(p_full_name),''), split_part(v_email,'@',1)), 'role', v_role, 'team_id', p_requested_team_id),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email', v_email, now(), now(), now()
  );

  update public.profiles
  set role = v_role,
      requested_team_id = case when v_role = 'admin' then null else p_requested_team_id end,
      is_active = true,
      approved_at = now(),
      approved_by_profile_id = auth.uid(),
      updated_at = now()
  where id = v_user_id
  returning * into created_profile;

  if not found then
    raise exception 'Profile creation failed';
  end if;

  perform public.sync_profile_role_records(v_user_id);

  select * into created_profile from public.profiles where id = v_user_id;
  return created_profile;
end;
$$;

grant execute on function public.admin_update_user_role_team(uuid, text, bigint) to authenticated;
grant execute on function public.admin_create_managed_user(text, text, text, text, bigint) to authenticated;
grant execute on function public.sync_profile_role_records(uuid) to authenticated;
