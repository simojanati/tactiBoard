alter table if exists public.quizzes
  add column if not exists time_limit_minutes integer;

alter table if exists public.quizzes
  drop constraint if exists quizzes_time_limit_minutes_check;

alter table if exists public.quizzes
  add constraint quizzes_time_limit_minutes_check
  check (time_limit_minutes is null or time_limit_minutes >= 1);
