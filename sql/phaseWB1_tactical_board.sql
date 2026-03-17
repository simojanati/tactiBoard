alter table tactics
add column if not exists diagram_json text;

alter table tactics
add column if not exists diagram_updated_at timestamptz;
