alter table matches add column if not exists offense_plan_notes text;
alter table matches add column if not exists defense_plan_notes text;

alter table match_tactics add column if not exists plan_section text default 'standard';
alter table match_tactics add column if not exists importance text default 'normal';
alter table match_tactics add column if not exists notes text;
