-- Restore full list visibility for players and coaches while keeping self-edit policies.
-- This fixes pages like Mon équipe / Joueuses / Coaches showing only the connected user.

alter table if exists public.players enable row level security;
alter table if exists public.coaches enable row level security;

-- Keep old self policies if they exist, but add broader read access for authenticated users.
drop policy if exists "Authenticated can view all players" on public.players;
create policy "Authenticated can view all players"
on public.players
for select
to authenticated
using (true);

drop policy if exists "Authenticated can view all coaches" on public.coaches;
create policy "Authenticated can view all coaches"
on public.coaches
for select
to authenticated
using (true);

-- Optional: if you want to remove the restrictive view-own-only policies entirely,
-- uncomment the lines below. Not required, because permissive select policies are OR-ed in Postgres RLS.
-- drop policy if exists "Players can view own row" on public.players;
-- drop policy if exists "Coaches can view own row" on public.coaches;
