alter table profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('user-avatars', 'user-avatars', true)
on conflict (id) do nothing;

create policy "Public read user avatars"
on storage.objects for select to public
using (bucket_id = 'user-avatars');

create policy "Public upload user avatars"
on storage.objects for insert to public
with check (bucket_id = 'user-avatars');

create policy "Public update user avatars"
on storage.objects for update to public
using (bucket_id = 'user-avatars')
with check (bucket_id = 'user-avatars');

create policy "Public delete user avatars"
on storage.objects for delete to public
using (bucket_id = 'user-avatars');
