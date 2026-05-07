-- Run this in Supabase SQL Editor to create/update the games table
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  player_name text,
  avatar_id text,
  result text not null check (result in ('win', 'loss', 'draw')),
  moves_count int default 0,
  player_score int,
  ai_score int,
  board_history jsonb,
  created_at timestamptz default now()
);

-- Add columns if table already existed without them
alter table public.games add column if not exists player_score int;
alter table public.games add column if not exists ai_score int;

alter table public.games enable row level security;

create policy "Allow all for games" on public.games
  for all using (true) with check (true);

-- Enable Realtime for leaderboard live updates (run in Supabase SQL Editor if using Realtime)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
