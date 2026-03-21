-- Phase O2 - Final scores for match completion

alter table if exists public.matches
  add column if not exists team_final_score integer null,
  add column if not exists opponent_final_score integer null;
