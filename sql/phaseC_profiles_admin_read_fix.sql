-- Fix pour la page Liaison comptes: permet à un admin de lire tous les profils
-- Important: le rôle admin est lu depuis le JWT/user_metadata

drop policy if exists "Admins can view all profiles" on public.profiles;

create policy "Admins can view all profiles"
on public.profiles
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);
