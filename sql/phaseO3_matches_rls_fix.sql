-- Phase O3 - Restore matches CRUD policies after live stats RLS changes

alter table if exists public.matches enable row level security;

drop policy if exists "matches_select_authenticated" on public.matches;
drop policy if exists "matches_live_update_by_coach_team" on public.matches;
drop policy if exists "matches_insert_admin_or_coach_team" on public.matches;
drop policy if exists "matches_update_admin_or_coach_team" on public.matches;
drop policy if exists "matches_delete_admin_or_coach_team" on public.matches;

create policy "matches_select_authenticated"
on public.matches
for select
to authenticated
using (true);

create policy "matches_insert_admin_or_coach_team"
on public.matches
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
  or exists (
    select 1
    from public.coaches c
    where c.profile_id = auth.uid()
      and c.team_id = public.matches.team_id
  )
);

create policy "matches_update_admin_or_coach_team"
on public.matches
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
  or exists (
    select 1
    from public.coaches c
    where c.profile_id = auth.uid()
      and c.team_id = public.matches.team_id
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
  or exists (
    select 1
    from public.coaches c
    where c.profile_id = auth.uid()
      and c.team_id = public.matches.team_id
  )
);

create policy "matches_delete_admin_or_coach_team"
on public.matches
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
  or exists (
    select 1
    from public.coaches c
    where c.profile_id = auth.uid()
      and c.team_id = public.matches.team_id
  )
);
