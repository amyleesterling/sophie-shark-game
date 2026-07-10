-- Sophie's Shark & Fish Game — leaderboard setup
-- Run this once in your Supabase project's SQL editor.

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 14),
  score int not null check (score >= 0 and score <= 1000000),
  level int not null check (level >= 1 and level <= 1000),
  created_at timestamptz not null default now()
);

-- Only two things are ever allowed from the game: add a score, read scores.
alter table public.scores enable row level security;

create policy "anyone can add scores"
  on public.scores for insert to anon
  with check (true);

create policy "anyone can read scores"
  on public.scores for select to anon
  using (true);

-- The leaderboard the game shows: each player's best run.
create view public.top_scores
  with (security_invoker = on) as
  select name, max(score) as score, max(level) as level
  from public.scores
  group by name
  order by score desc;
