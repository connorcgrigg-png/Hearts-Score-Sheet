const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const games = db.prepare(`
    SELECT g.id, g.name, g.created_at, g.completed_at, g.is_complete,
           COUNT(DISTINCT r.id) AS round_count,
           COUNT(DISTINCT gp.id) AS player_count
    FROM games g
    LEFT JOIN rounds r ON r.game_id = g.id
    LEFT JOIN game_players gp ON gp.game_id = g.id
    WHERE g.created_by = ?
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `).all(req.user.userId);
  res.json(games);
});

router.get('/:id', (req, res) => {
  const game = db.prepare(
    'SELECT * FROM games WHERE id = ? AND created_by = ?'
  ).get(req.params.id, req.user.userId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const players = db.prepare(
    'SELECT * FROM game_players WHERE game_id = ? ORDER BY position'
  ).all(game.id);

  const rounds = db.prepare(
    'SELECT * FROM rounds WHERE game_id = ? ORDER BY round_number'
  ).all(game.id);

  const getScores = db.prepare('SELECT * FROM round_scores WHERE round_id = ?');
  const roundsWithScores = rounds.map(round => ({
    ...round,
    scores: getScores.all(round.id),
  }));

  res.json({ ...game, players, rounds: roundsWithScores });
});

router.post('/', (req, res) => {
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

  const gameResult = db.prepare(
    'INSERT INTO games (name, created_by) VALUES (?, ?)'
  ).run(name.trim(), req.user.userId);
  const gameId = gameResult.lastInsertRowid;

  const insertPlayer = db.prepare(
    'INSERT INTO game_players (game_id, name, position) VALUES (?, ?, ?)'
  );
  trimmed.forEach((playerName, i) => insertPlayer.run(gameId, playerName, i));

  res.json({ id: gameId });
});

router.post('/:id/rounds', (req, res) => {
  const { scores } = req.body || {};

  const game = db.prepare(
    'SELECT * FROM games WHERE id = ? AND created_by = ?'
  ).get(req.params.id, req.user.userId);
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

  const lastRound = db.prepare(
    'SELECT MAX(round_number) AS max FROM rounds WHERE game_id = ?'
  ).get(game.id);
  const roundNumber = (lastRound.max || 0) + 1;

  const roundResult = db.prepare(
    'INSERT INTO rounds (game_id, round_number) VALUES (?, ?)'
  ).run(game.id, roundNumber);
  const roundId = roundResult.lastInsertRowid;

  const insertScore = db.prepare(
    'INSERT INTO round_scores (round_id, player_id, score) VALUES (?, ?, ?)'
  );
  scores.forEach(({ playerId, score }) => insertScore.run(roundId, playerId, score));

  const totals = db.prepare(`
    SELECT SUM(rs.score) AS total
    FROM round_scores rs
    JOIN rounds r ON r.id = rs.round_id
    WHERE r.game_id = ? AND rs.player_id = ?
  `);
  const players = db.prepare(
    'SELECT id FROM game_players WHERE game_id = ?'
  ).all(game.id);

  const gameOver = players.some(p => {
    const row = totals.get(game.id, p.id);
    return row && row.total >= 100;
  });

  if (gameOver) {
    db.prepare(
      'UPDATE games SET is_complete = 1, completed_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(game.id);
  }

  res.json({ roundId, roundNumber, gameOver });
});

router.delete('/:id/rounds/last', (req, res) => {
  const game = db.prepare(
    'SELECT * FROM games WHERE id = ? AND created_by = ?'
  ).get(req.params.id, req.user.userId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const lastRound = db.prepare(
    'SELECT * FROM rounds WHERE game_id = ? ORDER BY round_number DESC LIMIT 1'
  ).get(game.id);
  if (!lastRound) return res.status(400).json({ error: 'No rounds to undo' });

  db.prepare('DELETE FROM round_scores WHERE round_id = ?').run(lastRound.id);
  db.prepare('DELETE FROM rounds WHERE id = ?').run(lastRound.id);

  if (game.is_complete) {
    db.prepare(
      'UPDATE games SET is_complete = 0, completed_at = NULL WHERE id = ?'
    ).run(game.id);
  }

  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const game = db.prepare(
    'SELECT * FROM games WHERE id = ? AND created_by = ?'
  ).get(req.params.id, req.user.userId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  db.prepare('DELETE FROM games WHERE id = ?').run(game.id);
  res.json({ success: true });
});

module.exports = router;
