alter table if exists public.teams enable row level security;

drop policy if exists "Authenticated can read teams" on public.teams;
create policy "Authenticated can read teams"
on public.teams
for select
to authenticated
using (true);

drop policy if exists "Admins can insert teams" on public.teams;
create policy "Admins can insert teams"
on public.teams
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
);

drop policy if exists "Admins can update teams" on public.teams;
create policy "Admins can update teams"
on public.teams
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
);

drop policy if exists "Admins can delete teams" on public.teams;
create policy "Admins can delete teams"
on public.teams
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
);

drop policy if exists "Coaches can update own team roles pdf" on public.teams;
create policy "Coaches can update own team roles pdf"
on public.teams
for update
to authenticated
using (
  exists (
    select 1
    from public.coaches c
    where c.profile_id = auth.uid()
      and c.team_id = public.teams.id
  )
)
with check (
  exists (
    select 1
    from public.coaches c
    where c.profile_id = auth.uid()
      and c.team_id = public.teams.id
  )
);
