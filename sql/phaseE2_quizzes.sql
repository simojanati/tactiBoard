create table if not exists public.quizzes (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  tactic_id bigint references public.tactics(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id bigint generated always as identity primary key,
  quiz_id bigint not null references public.quizzes(id) on delete cascade,
  question_text text not null,
  option_1 text not null,
  option_2 text not null,
  option_3 text not null,
  option_4 text not null,
  correct_option integer not null check (correct_option between 1 and 4),
  order_index integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id bigint generated always as identity primary key,
  quiz_id bigint not null references public.quizzes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null default 0,
  total_questions integer not null default 0,
  submitted_at timestamptz not null default now()
);

create table if not exists public.quiz_attempt_answers (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references public.quiz_attempts(id) on delete cascade,
  question_id bigint not null references public.quiz_questions(id) on delete cascade,
  selected_option integer,
  is_correct boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_quizzes_team_id on public.quizzes(team_id);
create index if not exists idx_quiz_questions_quiz_id on public.quiz_questions(quiz_id);
create index if not exists idx_quiz_attempts_quiz_id on public.quiz_attempts(quiz_id);
create index if not exists idx_quiz_attempts_profile_id on public.quiz_attempts(profile_id);
