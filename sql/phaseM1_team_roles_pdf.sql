
alter table public.teams
add column if not exists roles_pdf_url text,
add column if not exists roles_pdf_path text,
add column if not exists roles_pdf_filename text,
add column if not exists roles_updated_at timestamptz;

insert into storage.buckets (id, name, public)
values ('team-roles', 'team-roles', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public read team roles') then
    create policy "Public read team roles" on storage.objects for select to public using (bucket_id = 'team-roles');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public upload team roles') then
    create policy "Public upload team roles" on storage.objects for insert to authenticated with check (bucket_id = 'team-roles');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public update team roles') then
    create policy "Public update team roles" on storage.objects for update to authenticated using (bucket_id = 'team-roles') with check (bucket_id = 'team-roles');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public delete team roles') then
    create policy "Public delete team roles" on storage.objects for delete to authenticated using (bucket_id = 'team-roles');
  end if;
end $$;

alter table if exists public.teams enable row level security;

drop policy if exists "Coaches can update own team roles pdf" on public.teams;
create policy "Coaches can update own team roles pdf"
on public.teams
for update
to authenticated
using (
  exists (
    select 1
    from public.coaches c
    where c.profile_id = auth.uid()
      and c.team_id = public.teams.id
  )
)
with check (
  exists (
    select 1
    from public.coaches c
    where c.profile_id = auth.uid()
      and c.team_id = public.teams.id
  )
);


drop policy if exists "Authenticated can read teams" on public.teams;
create policy "Authenticated can read teams"
on public.teams
for select
to authenticated
using (true);

drop policy if exists "Admins can insert teams" on public.teams;
create policy "Admins can insert teams"
on public.teams
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
);

drop policy if exists "Admins can update teams" on public.teams;
create policy "Admins can update teams"
on public.teams
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
)
;

drop policy if exists "Admins can delete teams" on public.teams;
create policy "Admins can delete teams"
on public.teams
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
);
