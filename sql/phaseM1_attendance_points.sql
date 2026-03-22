alter table if exists public.teams add column if not exists default_player_points integer not null default 0;
alter table if exists public.teams add column if not exists practice_presence_points integer not null default 2;
alter table if exists public.teams add column if not exists practice_absence_penalty integer not null default 2;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_practice_presence_points_even_check') then
    alter table public.teams add constraint teams_practice_presence_points_even_check check (practice_presence_points >= 0 and practice_presence_points % 2 = 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_practice_absence_penalty_even_check') then
    alter table public.teams add constraint teams_practice_absence_penalty_even_check check (practice_absence_penalty >= 0 and practice_absence_penalty % 2 = 0);
  end if;
end $$;

alter table if exists public.sessions add column if not exists session_type text not null default 'practice';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_session_type_check') then
    alter table public.sessions add constraint sessions_session_type_check check (session_type in ('practice','theory'));
  end if;
end $$;

alter table if exists public.players add column if not exists current_points integer not null default 0;

create table if not exists public.session_attendance (
  id bigserial primary key,
  session_id bigint not null references public.sessions(id) on delete cascade,
  team_id bigint not null references public.teams(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete cascade,
  attendance_status text not null,
  late_minutes integer not null default 0,
  points_delta integer not null default 0,
  points_reason text,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, player_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'session_attendance_status_check') then
    alter table public.session_attendance add constraint session_attendance_status_check check (attendance_status in ('present','absent_excused','absent_unexcused'));
  end if;
end $$;

create table if not exists public.player_points_history (
  id bigserial primary key,
  player_id bigint not null references public.players(id) on delete cascade,
  session_id bigint references public.sessions(id) on delete cascade,
  delta integer not null default 0,
  label text not null,
  source_type text not null default 'attendance',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

update public.players p
set current_points = coalesce(t.default_player_points, 0)
from public.teams t
where p.team_id = t.id
  and coalesce(p.current_points, 0) = 0;
