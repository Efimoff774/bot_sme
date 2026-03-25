-- Supabase schema for SME Digest (weekly per team)

create table if not exists teams (
  id bigserial primary key,
  name text not null unique
);

create table if not exists users (
  id bigserial primary key,
  telegram_id bigint not null unique,
  first_name text not null,
  last_name text not null,
  team_id bigint not null references teams(id),
  avatar_url text
);

-- Safe migration for existing DBs: add avatar_url if missing (existing rows get NULL; app treats NULL as incomplete).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'users' and column_name = 'avatar_url'
  ) then
    alter table users add column avatar_url text;
  end if;
end $$;

-- Weekly digest periods: up to 3 active weeks per month (weeks 1–3), week 4 = no digest
create table if not exists digest_periods (
  id bigserial primary key,
  year_month text not null,           -- YYYY-MM
  week_index int not null check (week_index between 1 and 4),
  team_id bigint not null references teams(id),
  start_date date not null,
  end_date date not null,
  publish_date timestamptz not null,
  status text not null check (status in ('open', 'closed', 'published')),
  unique (year_month, week_index)
);

-- Participation per digest period (replaces monthly_participation)
create table if not exists participation (
  id bigserial primary key,
  user_id bigint not null references users(id),
  digest_period_id bigint not null references digest_periods(id),
  status text not null check (status in ('participated', 'skipped', 'in_progress', 'submitted')),
  submitted_at timestamptz,
  unique (user_id, digest_period_id)
);

create table if not exists lifestyle_media (
  id bigserial primary key,
  user_id bigint not null references users(id),
  digest_period_id bigint not null references digest_periods(id),
  media_url text,
  caption text,
  general_text text,
  created_at timestamptz default now()
);

create table if not exists work_media (
  id bigserial primary key,
  user_id bigint not null references users(id),
  digest_period_id bigint not null references digest_periods(id),
  media_url text,
  caption text,
  general_text text,
  created_at timestamptz default now()
);

create table if not exists csat (
  id bigserial primary key,
  user_id bigint references users(id),
  digest_period_id bigint not null references digest_periods(id),
  rating int not null check (rating between 1 and 10),
  feedback_text text,
  created_at timestamptz default now()
);

-- Bot state persistence
create table if not exists user_states (
  user_id bigint primary key,
  state text not null,
  context jsonb not null default '{}'::jsonb
);

-- Seed initial teams
insert into teams (name)
values ('Team A'), ('Team B'), ('Team C')
on conflict (name) do nothing;
