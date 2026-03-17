
alter table public.teams
add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('team-logos', 'team-logos', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public read team logos') then
    create policy "Public read team logos" on storage.objects for select to public using (bucket_id = 'team-logos');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public upload team logos') then
    create policy "Public upload team logos" on storage.objects for insert to public with check (bucket_id = 'team-logos');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public update team logos') then
    create policy "Public update team logos" on storage.objects for update to public using (bucket_id = 'team-logos') with check (bucket_id = 'team-logos');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public delete team logos') then
    create policy "Public delete team logos" on storage.objects for delete to public using (bucket_id = 'team-logos');
  end if;
end $$;
