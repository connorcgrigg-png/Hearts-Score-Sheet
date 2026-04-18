const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const games = await db.all(`
    SELECT g.id, g.name, g.created_at, g.completed_at, g.is_complete,
           COUNT(DISTINCT r.id)::integer  AS round_count,
           COUNT(DISTINCT gp.id)::integer AS player_count
    FROM games g
    LEFT JOIN rounds r ON r.game_id = g.id
    LEFT JOIN game_players gp ON gp.game_id = g.id
    WHERE g.created_by = $1
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `, [req.user.userId]);
  res.json(games);
});

router.get('/:id', async (req, res) => {
  const game = await db.get(
    'SELECT * FROM games WHERE id = $1 AND created_by = $2',
    [req.params.id, req.user.userId]
  );
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const players = await db.all(
    'SELECT * FROM game_players WHERE game_id = $1 ORDER BY position',
    [game.id]
  );
  const rounds = await db.all(
    'SELECT * FROM rounds WHERE game_id = $1 ORDER BY round_number',
    [game.id]
  );
  const roundsWithScores = await Promise.all(
    rounds.map(async round => ({
      ...round,
      scores: await db.all('SELECT * FROM round_scores WHERE round_id = $1', [round.id]),
    }))
  );

  res.json({ ...game, players, rounds: roundsWithScores });
});

router.post('/', async (req, res) => {
  const { name, players } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Game name is required' });
  }
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) {
    return res.status(400).json({ error: '2–6 players are required' });
  }
  const trimmed = players.map(p => (p || '').trim()).filter(Boolean);
  if (trimmed.length !== players.length) {
    return res.status(400).json({ error: 'All player names must be non-empty' });
  }

  const game = await db.get(
    'INSERT INTO games (name, created_by) VALUES ($1, $2) RETURNING id',
    [name.trim(), req.user.userId]
  );
  for (let i = 0; i < trimmed.length; i++) {
    await db.query(
      'INSERT INTO game_players (game_id, name, position) VALUES ($1, $2, $3)',
      [game.id, trimmed[i], i]
    );
  }

  res.json({ id: game.id });
});

router.post('/:id/rounds', async (req, res) => {
  const { scores } = req.body || {};

  const game = await db.get(
    'SELECT * FROM games WHERE id = $1 AND created_by = $2',
    [req.params.id, req.user.userId]
  );
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.is_complete) return res.status(400).json({ error: 'Game is already complete' });

  if (!Array.isArray(scores) || scores.length === 0) {
    return res.status(400).json({ error: 'Scores are required' });
  }
  for (const s of scores) {
    if (typeof s.playerId !== 'number' || typeof s.score !== 'number' || s.score < 0) {
      return res.status(400).json({ error: 'Invalid score data' });
    }
  }

  const lastRound = await db.get(
    'SELECT MAX(round_number) AS max FROM rounds WHERE game_id = $1',
    [game.id]
  );
  const roundNumber = (lastRound.max || 0) + 1;

  const round = await db.get(
    'INSERT INTO rounds (game_id, round_number) VALUES ($1, $2) RETURNING id',
    [game.id, roundNumber]
  );
  for (const { playerId, score } of scores) {
    await db.query(
      'INSERT INTO round_scores (round_id, player_id, score) VALUES ($1, $2, $3)',
      [round.id, playerId, score]
    );
  }

  const players = await db.all(
    'SELECT id FROM game_players WHERE game_id = $1',
    [game.id]
  );
  const totals = await Promise.all(
    players.map(p => db.get(`
      SELECT COALESCE(SUM(rs.score), 0)::integer AS total
      FROM round_scores rs
      JOIN rounds r ON r.id = rs.round_id
      WHERE r.game_id = $1 AND rs.player_id = $2
    `, [game.id, p.id]))
  );
  const gameOver = totals.some(row => row && row.total >= 100);

  if (gameOver) {
    await db.query(
      'UPDATE games SET is_complete = TRUE, completed_at = CURRENT_TIMESTAMP WHERE id = $1',
      [game.id]
    );
  }

  res.json({ roundId: round.id, roundNumber, gameOver });
});

router.delete('/:id/rounds/last', async (req, res) => {
  const game = await db.get(
    'SELECT * FROM games WHERE id = $1 AND created_by = $2',
    [req.params.id, req.user.userId]
  );
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const lastRound = await db.get(
    'SELECT * FROM rounds WHERE game_id = $1 ORDER BY round_number DESC LIMIT 1',
    [game.id]
  );
  if (!lastRound) return res.status(400).json({ error: 'No rounds to undo' });

  await db.query('DELETE FROM round_scores WHERE round_id = $1', [lastRound.id]);
  await db.query('DELETE FROM rounds WHERE id = $1', [lastRound.id]);

  if (game.is_complete) {
    await db.query(
      'UPDATE games SET is_complete = FALSE, completed_at = NULL WHERE id = $1',
      [game.id]
    );
  }

  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  const game = await db.get(
    'SELECT * FROM games WHERE id = $1 AND created_by = $2',
    [req.params.id, req.user.userId]
  );
  if (!game) return res.status(404).json({ error: 'Game not found' });

  await db.query('DELETE FROM games WHERE id = $1', [game.id]);
  res.json({ success: true });
});

module.exports = router;
