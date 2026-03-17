alter table public.tactics
  add column if not exists coach_notes text,
  add column if not exists change_note text,
  add column if not exists updated_at timestamptz default now();

update public.tactics
set updated_at = coalesce(updated_at, created_at, now()),
    change_note = coalesce(change_note, 'Création de la tactique')
where true;
