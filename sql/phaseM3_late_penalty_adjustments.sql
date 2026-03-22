alter table if exists public.teams add column if not exists late_penalty_threshold_minutes integer not null default 0;
alter table if exists public.teams add column if not exists late_penalty_points integer not null default 0;

alter table if exists public.players add column if not exists late_adjusted_minutes integer not null default 0;
alter table if exists public.players add column if not exists late_penalty_applied integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_late_penalty_threshold_minutes_check') then
    alter table public.teams add constraint teams_late_penalty_threshold_minutes_check check (late_penalty_threshold_minutes >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_late_penalty_points_check') then
    alter table public.teams add constraint teams_late_penalty_points_check check (late_penalty_points >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'players_late_adjusted_minutes_check') then
    alter table public.players add constraint players_late_adjusted_minutes_check check (late_adjusted_minutes >= 0);
  end if;
end $$;

update public.players set late_adjusted_minutes = coalesce(late_adjusted_minutes, 0), late_penalty_applied = coalesce(late_penalty_applied, 0);
