create table if not exists notifications (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text not null,
  link_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_profile_id on notifications(profile_id);
create index if not exists idx_notifications_is_read on notifications(is_read);
