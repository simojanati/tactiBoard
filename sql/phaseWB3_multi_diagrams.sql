create table if not exists tactic_diagrams (
  id bigint generated always as identity primary key,
  tactic_id bigint not null references tactics(id) on delete cascade,
  title text not null default 'Diagram',
  notes text,
  diagram_json text,
  image_url text,
  is_primary boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tactic_diagrams_tactic_id on tactic_diagrams(tactic_id);
create unique index if not exists idx_tactic_diagrams_primary_per_tactic on tactic_diagrams(tactic_id) where is_primary = true;
