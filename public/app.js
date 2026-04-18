// ── Supabase config ───────────────────────────────────────────────────────
// Replace these two values with your project's URL and anon key.
// Both are safe to commit — they're public keys protected by Row Level Security.
// Find them at: supabase.com → your project → Settings → API
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
// ─────────────────────────────────────────────────────────────────────────

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── State ── */
let currentUser     = null;
let currentGameId   = null;
let currentGameData = null;

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
    if (error) {
      errEl.textContent = error.message;
      errEl.classList.remove('hidden');
    }
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

async function logout() {
  await db.auth.signOut();
}

/* ── Dashboard ── */
async function showDashboard() {
  showView('view-dashboard');
  document.getElementById('dash-username').textContent = currentUser.email.split('@')[0];

  const { data: rawGames, error } = await db
    .from('games')
    .select('id, name, created_at, completed_at, is_complete, game_players(id), rounds(id)')
    .order('created_at', { ascending: false });

  if (error) return;

  const games = (rawGames || []).map(g => ({
    ...g,
    player_count: g.game_players.length,
    round_count:  g.rounds.length,
  }));

  const list = document.getElementById('games-list');
  if (games.length === 0) {
    list.innerHTML = '<p class="empty-state">No games yet. Start a new one!</p>';
    return;
  }

  list.innerHTML = games.map(g => {
    const date = new Date(g.created_at).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const statusBadge = g.is_complete
      ? '<span class="badge complete">Complete</span>'
      : '<span class="badge active">In Progress</span>';
    return `
      <div class="game-card ${g.is_complete ? 'complete' : ''}" data-id="${g.id}">
        <div class="game-card-title">${escHtml(g.name)}</div>
        <div class="game-card-meta">
          ${statusBadge}
          <span class="badge">${g.player_count} players</span>
          <span class="badge">${g.round_count} rounds</span>
        </div>
        <div class="game-card-date">${date}</div>
      </div>`;
  }).join('');

  list.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => openGame(Number(card.dataset.id)));
  });
}

function initDashboard() {
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-new-game').addEventListener('click', () => showView('view-new-game'));
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

/* ── Game CRUD (Supabase) ── */
async function createGame(name, players) {
  if (!name) throw new Error('Game name is required');
  if (players.length < 2 || players.length > 6) throw new Error('2–6 players required');

  const { data: game, error } = await db
    .from('games')
    .insert({ name })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { error: playerErr } = await db.from('game_players').insert(
    players.map((playerName, i) => ({ game_id: game.id, name: playerName, position: i }))
  );
  if (playerErr) throw new Error(playerErr.message);

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
  const { data: lastRound } = await db
    .from('rounds')
    .select('round_number')
    .eq('game_id', gameId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();

  const roundNumber = ((lastRound?.round_number) || 0) + 1;

  const { data: round, error } = await db
    .from('rounds')
    .insert({ game_id: gameId, round_number: roundNumber })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { error: scoreErr } = await db.from('round_scores').insert(
    scores.map(({ playerId, score }) => ({ round_id: round.id, player_id: playerId, score }))
  );
  if (scoreErr) throw new Error(scoreErr.message);
}

async function undoLastRound(gameId) {
  const { data: lastRound, error } = await db
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();
  if (error || !lastRound) throw new Error('No rounds to undo');

  await db.from('rounds').delete().eq('id', lastRound.id);
  await db.from('games').update({ is_complete: false, completed_at: null }).eq('id', gameId);
}

async function removeGame(gameId) {
  await db.from('games').delete().eq('id', gameId);
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
  document.getElementById('game-title').textContent = g.name;

  const banner = document.getElementById('game-complete-banner');
  const addBtn = document.getElementById('btn-add-round');

  if (g.is_complete) {
    banner.classList.remove('hidden');
    addBtn.disabled = true;
    const winner = getWinner(g);
    document.getElementById('game-winner-text').textContent =
      `Game Over — ${escHtml(winner.name)} wins with ${winner.total} points!`;
  } else {
    banner.classList.add('hidden');
    addBtn.disabled = false;
  }

  renderScoreTable(g);
}

function calcTotals(g) {
  const totals = {};
  g.players.forEach(p => { totals[p.id] = 0; });
  g.rounds.forEach(round => {
    (round.scores || []).forEach(s => {
      totals[s.player_id] = (totals[s.player_id] || 0) + s.score;
    });
  });
  return totals;
}

function getWinner(g) {
  const totals = calcTotals(g);
  const best = g.players.reduce((a, b) => (totals[a.id] <= totals[b.id] ? a : b));
  return { ...best, total: totals[best.id] };
}

function renderScoreTable(g) {
  document.getElementById('score-header').innerHTML =
    '<th>Round</th>' + g.players.map(p => `<th>${escHtml(p.name)}</th>`).join('');

  const body = document.getElementById('score-body');
  if (g.rounds.length === 0) {
    body.innerHTML = `<tr><td colspan="${g.players.length + 1}" class="empty-state">No rounds yet.</td></tr>`;
  } else {
    body.innerHTML = g.rounds.map(round => {
      const cells = g.players.map(p => {
        const s = (round.scores || []).find(sc => sc.player_id === p.id);
        return `<td>${s != null ? s.score : '—'}</td>`;
      }).join('');
      return `<tr><td>${round.round_number}</td>${cells}</tr>`;
    }).join('');
  }

  const totals   = calcTotals(g);
  const minTotal = Math.min(...g.players.map(p => totals[p.id] || 0));
  const maxTotal = Math.max(...g.players.map(p => totals[p.id] || 0));

  document.getElementById('score-totals').innerHTML =
    '<td>Total</td>' + g.players.map(p => {
      const t = totals[p.id] || 0;
      let cls = '';
      if (g.is_complete && t === minTotal) cls = 'winner-col';
      else if (t === maxTotal && g.players.length > 1) cls = 'danger-col';
      return `<td class="${cls}">${t}</td>`;
    }).join('');
}

function initGameView() {
  document.getElementById('btn-back-from-game').addEventListener('click', () => {
    currentGameId   = null;
    currentGameData = null;
    showDashboard();
  });

  document.getElementById('btn-add-round').addEventListener('click', openRoundModal);

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
    await removeGame(currentGameId);
    currentGameId   = null;
    currentGameData = null;
    showDashboard();
  });
}

/* ── Round Modal ── */
function openRoundModal() {
  const g = currentGameData;

  document.getElementById('shoot-moon-buttons').innerHTML = g.players.map(p =>
    `<button type="button" class="btn-moon" data-id="${p.id}">🌙 ${escHtml(p.name)}</button>`
  ).join('');

  document.getElementById('round-score-inputs').innerHTML = g.players.map(p =>
    `<div class="round-input-row">
      <label>${escHtml(p.name)}</label>
      <input type="number" class="score-input" data-id="${p.id}" min="0" max="26" value="0" />
    </div>`
  ).join('');

  document.getElementById('round-error').classList.add('hidden');
  updateRoundTotal();

  document.querySelectorAll('.score-input').forEach(inp =>
    inp.addEventListener('input', updateRoundTotal)
  );

  document.querySelectorAll('.btn-moon').forEach(btn => {
    btn.addEventListener('click', () => {
      const shooterId = Number(btn.dataset.id);
      document.querySelectorAll('.score-input').forEach(inp => {
        inp.value = Number(inp.dataset.id) === shooterId ? 0 : 26;
      });
      updateRoundTotal();
    });
  });

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function updateRoundTotal() {
  const total = Array.from(document.querySelectorAll('.score-input'))
    .reduce((sum, inp) => sum + (parseInt(inp.value) || 0), 0);
  const el = document.getElementById('round-total-display');
  el.textContent = total;
  el.className = 'round-total ' + (total === 26 ? 'ok' : total === 0 ? '' : 'warn');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function initModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-round').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('btn-confirm-round').addEventListener('click', async () => {
    const scores = Array.from(document.querySelectorAll('.score-input')).map(inp => ({
      playerId: Number(inp.dataset.id),
      score: parseInt(inp.value) || 0,
    }));
    const total = scores.reduce((s, x) => s + x.score, 0);
    const errEl = document.getElementById('round-error');

    if (total !== 26 && total !== 0) {
      errEl.textContent = `Scores should total 26 (currently ${total}). Use 🌙 for shoot the moon.`;
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');

    try {
      await saveRound(currentGameId, scores);
      currentGameData = await fetchGame(currentGameId);

      const totals  = calcTotals(currentGameData);
      const gameOver = Object.values(totals).some(t => t >= 100);
      if (gameOver) {
        await db.from('games')
          .update({ is_complete: true, completed_at: new Date().toISOString() })
          .eq('id', currentGameId);
        currentGameData = await fetchGame(currentGameId);
      }

      closeModal();
      renderGame();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
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
  initModal();

  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      currentUser = session.user;
      showDashboard();
    } else if (event === 'SIGNED_OUT') {
      currentUser     = null;
      currentGameId   = null;
      currentGameData = null;
      showView('view-auth');
    }
  });

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    showDashboard();
  } else {
    showView('view-auth');
  }
}

document.addEventListener('DOMContentLoaded', boot);
