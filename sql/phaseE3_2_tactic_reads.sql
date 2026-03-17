create table if not exists tactic_reads (
  id bigint generated always as identity primary key,
  tactic_id bigint not null references tactics(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  version_seen integer not null default 1,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tactic_id, profile_id)
);

create index if not exists idx_tactic_reads_tactic_id on tactic_reads(tactic_id);
create index if not exists idx_tactic_reads_profile_id on tactic_reads(profile_id);
