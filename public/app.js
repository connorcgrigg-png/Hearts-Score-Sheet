// ── Supabase config ───────────────────────────────────────────────────────
// Replace these two values with your project's URL and anon key.
// Both are safe to commit — they're public keys protected by Row Level Security.
// Find them at: supabase.com → your project → Settings → API
const SUPABASE_URL      = 'https://rwfzduvhdudmptqsczuo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3ZnpkdXZoZHVkbXB0cXNjenVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NjQwNzIsImV4cCI6MjA5MjA0MDA3Mn0.3E4lxIIjlHQtQPpDuASTLZjeyqY8RrIbZt79eEFcFdI';
// ─────────────────────────────────────────────────────────────────────────

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── State ── */
let currentUser     = null;
let currentGameId   = null;
let currentGameData = null;
let moonPlayerId    = null;
let jodPlayerId     = null;

/* ── Views ── */
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

/* ── Auth ── */
function initAuth() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      document.getElementById('form-login').classList.toggle('hidden', which !== 'login');
      document.getElementById('form-register').classList.toggle('hidden', which !== 'register');
    });
  });

  document.getElementById('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');
    errEl.classList.add('hidden');
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
  });

  document.getElementById('form-register').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errEl    = document.getElementById('register-error');
    const okEl     = document.getElementById('register-success');
    errEl.classList.add('hidden');
    okEl.classList.add('hidden');
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) {
      errEl.textContent = error.message;
      errEl.classList.remove('hidden');
    } else if (data.user && !data.session) {
      okEl.textContent = 'Check your email to confirm your account, then sign in.';
      okEl.classList.remove('hidden');
    }
  });
}

function initDashboard() {
  document.getElementById('btn-logout').addEventListener('click', () => db.auth.signOut());
  document.getElementById('btn-new-game').addEventListener('click', () => showView('view-new-game'));
}

/* ── Dashboard ── */
async function showDashboard() {
  showView('view-dashboard');
  document.getElementById('dash-username').textContent = currentUser.email.split('@')[0];

  const { data: rawGames } = await db
    .from('games')
    .select(`
      id, name, created_at, completed_at, is_complete,
      game_players(id, name, position),
      rounds(round_scores(player_id, score))
    `)
    .order('created_at', { ascending: false });

  const list = document.getElementById('games-list');
  if (!rawGames || !rawGames.length) {
    list.innerHTML = '<p class="empty-state">No games yet. Start a new one!</p>';
    return;
  }

  list.innerHTML = rawGames.map(g => {
    const date = new Date(g.created_at).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const players = [...g.game_players].sort((a, b) => a.position - b.position);
    const statusBadge = g.is_complete
      ? '<span class="badge complete">Complete</span>'
      : '<span class="badge active">In Progress</span>';

    let scoresHtml = '';
    if (g.is_complete && players.length) {
      const totals = {};
      players.forEach(p => { totals[p.id] = 0; });
      g.rounds.forEach(r => (r.round_scores || []).forEach(s => {
        totals[s.player_id] = (totals[s.player_id] || 0) + s.score;
      }));
      const minScore = Math.min(...players.map(p => totals[p.id] || 0));

      scoresHtml = `<div class="game-card-scores">
        ${players.map(p => {
          const score = totals[p.id] || 0;
          const isWinner = score === minScore;
          return `<div class="game-score-row${isWinner ? ' winner' : ''}">
            <span class="game-score-name">${isWinner ? '♥ ' : ''}${escHtml(p.name)}</span>
            <span class="game-score-pts">${score}</span>
          </div>`;
        }).join('')}
      </div>`;
    }

    return `
      <div class="game-card ${g.is_complete ? 'complete' : ''}" data-id="${g.id}">
        <div class="game-card-title">${escHtml(g.name)}</div>
        <div class="game-card-meta">
          ${statusBadge}
          <span class="badge">${players.length} players</span>
          <span class="badge">${g.rounds.length} rounds</span>
        </div>
        ${scoresHtml}
        <div class="game-card-date">${date}</div>
      </div>`;
  }).join('');

  list.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => openGame(Number(card.dataset.id)));
  });
}

/* ── New Game ── */
function initNewGame() {
  document.getElementById('btn-back-from-new').addEventListener('click', showDashboard);

  document.getElementById('btn-add-player').addEventListener('click', () => {
    const rows = document.querySelectorAll('.player-row');
    if (rows.length >= 6) return;
    const div = document.createElement('div');
    div.className = 'player-row';
    div.innerHTML = `<input type="text" class="player-name" placeholder="Player ${rows.length + 1}" />`;
    document.getElementById('player-inputs').appendChild(div);
    updatePlayerButtons();
  });

  document.getElementById('btn-remove-player').addEventListener('click', () => {
    const rows = document.querySelectorAll('.player-row');
    if (rows.length <= 2) return;
    rows[rows.length - 1].remove();
    updatePlayerButtons();
  });

  document.getElementById('form-new-game').addEventListener('submit', async e => {
    e.preventDefault();
    const name    = document.getElementById('game-name').value.trim();
    const players = Array.from(document.querySelectorAll('.player-name'))
      .map(i => i.value.trim()).filter(Boolean);
    const errEl = document.getElementById('new-game-error');
    errEl.classList.add('hidden');
    try {
      const id = await createGame(name, players);
      resetNewGameForm();
      openGame(id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

function resetNewGameForm() {
  document.getElementById('game-name').value = '';
  document.getElementById('player-inputs').innerHTML = [1,2,3,4].map(n =>
    `<div class="player-row"><input type="text" class="player-name" placeholder="Player ${n}" /></div>`
  ).join('');
}

function updatePlayerButtons() {
  const count = document.querySelectorAll('.player-row').length;
  document.getElementById('btn-add-player').disabled  = count >= 6;
  document.getElementById('btn-remove-player').disabled = count <= 2;
}

/* ── Supabase CRUD ── */
async function createGame(name, players) {
  if (!name) throw new Error('Game name is required');
  if (players.length < 2 || players.length > 6) throw new Error('2–6 players required');

  const { data: game, error } = await db.from('games').insert({ name }).select().single();
  if (error) throw new Error(error.message);

  const { error: pe } = await db.from('game_players').insert(
    players.map((n, i) => ({ game_id: game.id, name: n, position: i }))
  );
  if (pe) throw new Error(pe.message);
  return game.id;
}

async function fetchGame(id) {
  const { data, error } = await db
    .from('games')
    .select('*, game_players(*), rounds(*, round_scores(*))')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return {
    ...data,
    players: [...data.game_players].sort((a, b) => a.position - b.position),
    rounds: [...data.rounds]
      .sort((a, b) => a.round_number - b.round_number)
      .map(r => ({ ...r, scores: r.round_scores })),
  };
}

async function saveRound(gameId, scores) {
  const { data: last } = await db
    .from('rounds').select('round_number').eq('game_id', gameId)
    .order('round_number', { ascending: false }).limit(1).single();

  const roundNumber = ((last?.round_number) || 0) + 1;
  const { data: round, error } = await db
    .from('rounds').insert({ game_id: gameId, round_number: roundNumber }).select().single();
  if (error) throw new Error(error.message);

  const { error: se } = await db.from('round_scores').insert(
    scores.map(({ playerId, score }) => ({ round_id: round.id, player_id: playerId, score }))
  );
  if (se) throw new Error(se.message);
}

async function undoLastRound(gameId) {
  const { data: last, error } = await db
    .from('rounds').select('id').eq('game_id', gameId)
    .order('round_number', { ascending: false }).limit(1).single();
  if (error || !last) throw new Error('No rounds to undo');
  await db.from('rounds').delete().eq('id', last.id);
  await db.from('games').update({ is_complete: false, completed_at: null }).eq('id', gameId);
}

/* ── Game View ── */
async function openGame(id) {
  currentGameId   = id;
  showView('view-game');
  currentGameData = await fetchGame(id);
  renderGame();
}

function renderGame() {
  const g = currentGameData;

  document.getElementById('game-hero-name').textContent = g.name.toUpperCase();

  const banner = document.getElementById('game-complete-banner');
  if (g.is_complete) {
    banner.classList.remove('hidden');
    const winner = getWinner(g);
    document.getElementById('game-winner-text').textContent =
      `${escHtml(winner.name)} wins with ${winner.total} points!`;
  } else {
    banner.classList.add('hidden');
  }

  renderScoreTable(g);
  renderRoundEntry(g);
}

function calcTotals(g) {
  const totals = {};
  g.players.forEach(p => { totals[p.id] = 0; });
  g.rounds.forEach(r => (r.scores || []).forEach(s => {
    totals[s.player_id] = (totals[s.player_id] || 0) + s.score;
  }));
  return totals;
}

function getWinner(g) {
  const totals = calcTotals(g);
  const best = g.players.reduce((a, b) => totals[a.id] <= totals[b.id] ? a : b);
  return { ...best, total: totals[best.id] };
}

function renderScoreTable(g) {
  document.getElementById('score-header').innerHTML =
    '<th class="round-col">#</th>' +
    g.players.map(p => `<th>${escHtml(p.name)}</th>`).join('');

  const body = document.getElementById('score-body');
  if (!g.rounds.length) {
    body.innerHTML = `<tr><td class="empty-cell" colspan="${g.players.length + 1}">No rounds yet — add the first one below</td></tr>`;
  } else {
    body.innerHTML = g.rounds.map(round => {
      const cells = g.players.map(p => {
        const s = (round.scores || []).find(sc => sc.player_id === p.id);
        return `<td>${s != null ? s.score : '—'}</td>`;
      }).join('');
      return `<tr><td class="round-col">${round.round_number}</td>${cells}</tr>`;
    }).join('');
  }

  const totals   = calcTotals(g);
  const vals     = g.players.map(p => totals[p.id] || 0);
  const minTotal = Math.min(...vals);
  const maxTotal = Math.max(...vals);

  document.getElementById('score-totals').innerHTML =
    '<td class="round-col">Total</td>' +
    g.players.map(p => {
      const t = totals[p.id] || 0;
      let cls = '';
      if (g.is_complete && t === minTotal) cls = 'winner-col';
      else if (t === maxTotal && g.players.length > 1) cls = 'danger-col';
      return `<td class="${cls}">${t}</td>`;
    }).join('');
}

function renderRoundEntry(g) {
  const entryEl = document.getElementById('round-entry');
  if (g.is_complete) { entryEl.classList.add('hidden'); return; }
  entryEl.classList.remove('hidden');

  moonPlayerId = null;
  jodPlayerId  = null;

  document.getElementById('next-round-num').textContent = g.rounds.length + 1;
  document.getElementById('round-entry-error').classList.add('hidden');

  const gridCols = `grid-template-columns: repeat(${g.players.length}, 1fr)`;

  const makeBtns = (containerId, onSelect) => {
    const el = document.getElementById(containerId);
    el.setAttribute('style', gridCols);
    el.innerHTML = g.players.map(p =>
      `<button type="button" class="player-select-btn" data-id="${p.id}">${escHtml(p.name)}</button>`
    ).join('');
    el.querySelectorAll('.player-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const already = btn.classList.contains('selected');
        el.querySelectorAll('.player-select-btn').forEach(b => b.classList.remove('selected'));
        onSelect(already ? null : id);
        if (!already) btn.classList.add('selected');
      });
    });
  };

  makeBtns('moon-player-btns', id => {
    moonPlayerId = id;
    if (id !== null) {
      document.querySelectorAll('.score-number-input').forEach(inp => {
        inp.value = Number(inp.dataset.id) === id ? 0 : 26;
      });
    } else {
      document.querySelectorAll('.score-number-input').forEach(inp => { inp.value = 0; });
    }
  });

  makeBtns('jod-player-btns', id => { jodPlayerId = id; });

  const playerCount = g.players.length;
  document.getElementById('score-input-container').innerHTML = `
    <div class="score-grid" style="grid-template-columns: repeat(${playerCount}, 1fr)">
      ${g.players.map(p => `
        <div class="score-col">
          <div class="score-col-label">${escHtml(p.name)}</div>
          <input type="number" class="score-number-input" data-id="${p.id}" min="-10" max="52" value="0" />
        </div>`).join('')}
    </div>`;
}

function initGameView() {
  document.getElementById('btn-back-from-game').addEventListener('click', () => {
    currentGameId = null; currentGameData = null;
    showDashboard();
  });

  document.getElementById('btn-undo-round').addEventListener('click', async () => {
    if (!confirm('Undo the last round?')) return;
    try {
      await undoLastRound(currentGameId);
      currentGameData = await fetchGame(currentGameId);
      renderGame();
    } catch (err) { alert(err.message); }
  });

  document.getElementById('btn-delete-game').addEventListener('click', async () => {
    if (!confirm('Delete this game permanently?')) return;
    await db.from('games').delete().eq('id', currentGameId);
    currentGameId = null; currentGameData = null;
    showDashboard();
  });

  document.getElementById('btn-add-round').addEventListener('click', async () => {
    const errEl = document.getElementById('round-entry-error');
    errEl.classList.add('hidden');

    let scores;
    try { scores = buildRoundScores(); }
    catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      return;
    }

    try {
      await saveRound(currentGameId, scores);
      currentGameData = await fetchGame(currentGameId);

      const totals  = calcTotals(currentGameData);
      const gameOver = currentGameData.rounds.length >= 4;
      if (gameOver) {
        await db.from('games')
          .update({ is_complete: true, completed_at: new Date().toISOString() })
          .eq('id', currentGameId);
        currentGameData = await fetchGame(currentGameId);
      }
      renderGame();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

function buildRoundScores() {
  const g = currentGameData;

  if (moonPlayerId !== null) {
    const scores = g.players.map(p => ({
      playerId: p.id,
      score: p.id === moonPlayerId ? 0 : 26,
    }));
    if (jodPlayerId !== null) {
      const jod = scores.find(s => s.playerId === jodPlayerId);
      if (jod) jod.score -= 10;
    }
    return scores;
  }

  const inputs = Array.from(document.querySelectorAll('.score-number-input'));
  const scores = inputs.map(inp => ({
    playerId: Number(inp.dataset.id),
    score: parseInt(inp.value) || 0,
  }));

  const total = scores.reduce((s, x) => s + x.score, 0);
  if (total !== 26) throw new Error(`Scores must sum to 26 (currently ${total})`);

  if (jodPlayerId !== null) {
    const jod = scores.find(s => s.playerId === jodPlayerId);
    if (jod) jod.score -= 10;
  }
  return scores;
}

/* ── Helpers ── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Boot ── */
async function boot() {
  initAuth();
  initDashboard();
  initNewGame();
  initGameView();

  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      currentUser = session.user;
      showDashboard();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null; currentGameId = null; currentGameData = null;
      showView('view-auth');
    }
  });

  const { data: { session } } = await db.auth.getSession();
  if (session) { currentUser = session.user; showDashboard(); }
  else showView('view-auth');
}

document.addEventListener('DOMContentLoaded', boot);
