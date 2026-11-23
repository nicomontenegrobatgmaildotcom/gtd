-- Run this once in Supabase: SQL Editor > New query > paste > Run

create table if not exists items (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  list text not null default 'inbox'
    check (list in ('inbox','next','waiting','someday','projects','done')),
  context text default '',
  project text default '',
  due date,
  notes text default '',
  source text default 'app',
  created_at timestamptz not null default now()
);

alter table items enable row level security;

drop policy if exists "own items" on items;
create policy "own items" on items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Weekly review checkboxes
create table if not exists reviews (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  checked int[] not null default '{}'
);

alter table reviews enable row level security;

drop policy if exists "own review" on reviews;
create policy "own review" on reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
