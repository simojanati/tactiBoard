alter table if exists public.players add column if not exists captain_role text;
alter table if exists public.players add column if not exists age integer;
alter table if exists public.players add column if not exists height_cm numeric(6,2);
alter table if exists public.players add column if not exists weight_kg numeric(6,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'players_captain_role_check'
  ) then
    alter table public.players
      add constraint players_captain_role_check
      check (captain_role in ('captain_1','captain_2','captain_3') or captain_role is null);
  end if;
end $$;
