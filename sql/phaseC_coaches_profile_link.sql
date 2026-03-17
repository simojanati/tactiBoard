-- Ajoute la liaison entre coaches et profiles
alter table public.coaches
add column if not exists profile_id uuid references public.profiles(id) on delete set null;
