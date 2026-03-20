-- Allow authenticated coaches to update players that belong to their own team.
alter table if exists public.players enable row level security;

drop policy if exists "Coaches can update players in own team" on public.players;
create policy "Coaches can update players in own team"
on public.players
for update
to authenticated
using (
  exists (
    select 1
    from public.coaches c
    where c.profile_id = auth.uid()
      and c.team_id = public.players.team_id
  )
)
with check (
  exists (
    select 1
    from public.coaches c
    where c.profile_id = auth.uid()
      and c.team_id = public.players.team_id
  )
);
