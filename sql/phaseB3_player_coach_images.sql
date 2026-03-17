-- Add direct image columns to players and coaches
alter table if exists public.players add column if not exists image_url text;
alter table if exists public.coaches add column if not exists image_url text;

-- Backfill from profiles avatar when linked
update public.players p
set image_url = pr.avatar_url
from public.profiles pr
where p.profile_id = pr.id
  and (p.image_url is null or p.image_url = '')
  and pr.avatar_url is not null
  and pr.avatar_url <> '';

update public.coaches c
set image_url = pr.avatar_url
from public.profiles pr
where c.profile_id = pr.id
  and (c.image_url is null or c.image_url = '')
  and pr.avatar_url is not null
  and pr.avatar_url <> '';

-- Optional self-edit policies for own image fields if RLS is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'players' AND policyname = 'players_self_update_image'
  ) THEN
    CREATE POLICY players_self_update_image ON public.players
      FOR UPDATE USING (auth.uid() = profile_id)
      WITH CHECK (auth.uid() = profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coaches' AND policyname = 'coaches_self_update_image'
  ) THEN
    CREATE POLICY coaches_self_update_image ON public.coaches
      FOR UPDATE USING (auth.uid() = profile_id)
      WITH CHECK (auth.uid() = profile_id);
  END IF;
END $$;
