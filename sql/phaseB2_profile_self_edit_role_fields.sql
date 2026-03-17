-- Allow authenticated users to update their own linked player/coach basic fields from profile page
alter table if exists public.players enable row level security;
alter table if exists public.coaches enable row level security;

drop policy if exists "Players can view own row" on public.players;
create policy "Players can view own row"
on public.players
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "Players can update own row" on public.players;
create policy "Players can update own row"
on public.players
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "Coaches can view own row" on public.coaches;
create policy "Coaches can view own row"
on public.coaches
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "Coaches can update own row" on public.coaches;
create policy "Coaches can update own row"
on public.coaches
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());
