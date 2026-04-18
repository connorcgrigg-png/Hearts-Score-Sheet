-- Run this entire file in the Supabase SQL Editor (supabase.com → your project → SQL Editor)

CREATE TABLE IF NOT EXISTS games (
  id        BIGSERIAL PRIMARY KEY,
  name      TEXT        NOT NULL,
  created_by UUID       NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  is_complete BOOLEAN   DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS game_players (
  id       BIGSERIAL PRIMARY KEY,
  game_id  BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name     TEXT   NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rounds (
  id           BIGSERIAL PRIMARY KEY,
  game_id      BIGINT  NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS round_scores (
  id        BIGSERIAL PRIMARY KEY,
  round_id  BIGINT  NOT NULL REFERENCES rounds(id)       ON DELETE CASCADE,
  player_id BIGINT  NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  score     INTEGER NOT NULL DEFAULT 0
);

-- Enable Row Level Security
ALTER TABLE games        ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds       ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_scores ENABLE ROW LEVEL SECURITY;

-- Policies: users can only see and modify their own data
CREATE POLICY "users manage own games"
  ON games FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "users manage own game_players"
  ON game_players FOR ALL
  USING (game_id IN (SELECT id FROM games WHERE created_by = auth.uid()));

CREATE POLICY "users manage own rounds"
  ON rounds FOR ALL
  USING (game_id IN (SELECT id FROM games WHERE created_by = auth.uid()));

CREATE POLICY "users manage own round_scores"
  ON round_scores FOR ALL
  USING (
    round_id IN (
      SELECT r.id FROM rounds r
      JOIN games g ON g.id = r.game_id
      WHERE g.created_by = auth.uid()
    )
  );
