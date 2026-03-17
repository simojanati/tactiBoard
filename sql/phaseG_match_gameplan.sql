alter table matches add column if not exists game_plan_notes text;

create table if not exists match_tactic_diagrams (
  id bigint generated always as identity primary key,
  match_id bigint not null references matches(id) on delete cascade,
  tactic_id bigint not null references tactics(id) on delete cascade,
  diagram_id bigint references tactic_diagrams(id) on delete set null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_match_tactic_diagrams_unique on match_tactic_diagrams(match_id, tactic_id);
create index if not exists idx_match_tactic_diagrams_match on match_tactic_diagrams(match_id);
