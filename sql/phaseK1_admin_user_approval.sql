
alter table public.profiles add column if not exists is_active boolean not null default false;
alter table public.profiles alter column is_active set default false;
alter table public.profiles add column if not exists approved_at timestamptz;
alter table public.profiles add column if not exists approved_by_profile_id uuid references public.profiles(id) on delete set null;

-- preserve existing already-used accounts
update public.profiles
set is_active = true
where created_at < now() - interval '5 minutes'
  and is_active is distinct from true;

create index if not exists profiles_is_active_idx on public.profiles(is_active);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  signup_role text;
begin
  signup_role := coalesce(new.raw_user_meta_data ->> 'role', 'player');
  insert into public.profiles (id, full_name, email, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when signup_role = 'admin' then 'player' else signup_role end,
    false
  )
  on conflict (id) do update
  set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = coalesce(excluded.email, public.profiles.email),
    role = coalesce(excluded.role, public.profiles.role),
    is_active = coalesce(public.profiles.is_active, false);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();


alter table public.profiles enable row level security;

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles"
on public.profiles
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);


alter table public.profiles add column if not exists requested_team_id bigint references public.teams(id) on delete set null;

create index if not exists profiles_requested_team_idx on public.profiles(requested_team_id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  signup_role text;
  signup_team_id bigint;
begin
  signup_role := coalesce(new.raw_user_meta_data ->> 'role', 'player');
  signup_team_id := nullif(new.raw_user_meta_data ->> 'team_id', '')::bigint;
  insert into public.profiles (id, full_name, email, role, is_active, requested_team_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when signup_role = 'admin' then 'player' else signup_role end,
    false,
    signup_team_id
  )
  on conflict (id) do update
  set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = coalesce(excluded.email, public.profiles.email),
    role = coalesce(excluded.role, public.profiles.role),
    requested_team_id = coalesce(excluded.requested_team_id, public.profiles.requested_team_id),
    is_active = coalesce(public.profiles.is_active, false);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();


-- Allow admins to create/update linked player and coach records during activation
alter table public.players enable row level security;
alter table public.coaches enable row level security;

drop policy if exists "Admins can insert players" on public.players;
create policy "Admins can insert players"
on public.players
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "Admins can update players" on public.players;
create policy "Admins can update players"
on public.players
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "Admins can insert coaches" on public.coaches;
create policy "Admins can insert coaches"
on public.coaches
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "Admins can update coaches" on public.coaches;
create policy "Admins can update coaches"
on public.coaches
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
