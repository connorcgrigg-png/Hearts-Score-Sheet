/* ── State ── */
let token = localStorage.getItem('hearts_token');
let username = localStorage.getItem('hearts_username');
let currentGameId = null;
let currentGameData = null;

/* ── API ── */
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    logout(false);
    return null;
  }
  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}

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
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');
    try {
      const data = await api('POST', '/auth/login', { username: user, password: pass });
      if (data) setSession(data.token, data.username);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  document.getElementById('form-register').addEventListener('submit', async e => {
    e.preventDefault();
    const user = document.getElementById('reg-username').value.trim();
    const pass = document.getElementById('reg-password').value;
    const errEl = document.getElementById('register-error');
    errEl.classList.add('hidden');
    try {
      const data = await api('POST', '/auth/register', { username: user, password: pass });
      if (data) setSession(data.token, data.username);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

function setSession(t, u) {
  token = t;
  username = u;
  localStorage.setItem('hearts_token', t);
  localStorage.setItem('hearts_username', u);
  showDashboard();
}

function logout(redirect = true) {
  token = null;
  username = null;
  localStorage.removeItem('hearts_token');
  localStorage.removeItem('hearts_username');
  if (redirect) showView('view-auth');
}

/* ── Dashboard ── */
async function showDashboard() {
  showView('view-dashboard');
  document.getElementById('dash-username').textContent = username;

  let games;
  try {
    games = await api('GET', '/games');
  } catch {
    return;
  }

  const list = document.getElementById('games-list');
  if (!games || games.length === 0) {
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
  document.getElementById('btn-logout').addEventListener('click', () => logout());
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
    const name = document.getElementById('game-name').value.trim();
    const players = Array.from(document.querySelectorAll('.player-name'))
      .map(i => i.value.trim())
      .filter(Boolean);
    const errEl = document.getElementById('new-game-error');
    errEl.classList.add('hidden');

    try {
      const data = await api('POST', '/games', { name, players });
      if (data) {
        resetNewGameForm();
        openGame(data.id);
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

function resetNewGameForm() {
  document.getElementById('game-name').value = '';
  const inputs = document.getElementById('player-inputs');
  inputs.innerHTML = [1,2,3,4].map(n =>
    `<div class="player-row"><input type="text" class="player-name" placeholder="Player ${n}" /></div>`
  ).join('');
}

function updatePlayerButtons() {
  const count = document.querySelectorAll('.player-row').length;
  document.getElementById('btn-add-player').disabled = count >= 6;
  document.getElementById('btn-remove-player').disabled = count <= 2;
}

/* ── Game View ── */
async function openGame(id) {
  currentGameId = id;
  showView('view-game');

  try {
    currentGameData = await api('GET', `/games/${id}`);
  } catch {
    return;
  }

  renderGame();
}

function renderGame() {
  const g = currentGameData;
  document.getElementById('game-title').textContent = g.name;

  const banner = document.getElementById('game-complete-banner');
  const actionsEl = document.getElementById('game-actions');
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

function getWinner(g) {
  const totals = calcTotals(g);
  return g.players.reduce((best, p) => {
    const t = totals[p.id] || 0;
    return t < (totals[best.id] || 0) ? p : best;
  }, g.players[0]);
}

function calcTotals(g) {
  const totals = {};
  g.players.forEach(p => { totals[p.id] = 0; });
  g.rounds.forEach(round => {
    round.scores.forEach(s => { totals[s.player_id] = (totals[s.player_id] || 0) + s.score; });
  });
  return totals;
}

function renderScoreTable(g) {
  const header = document.getElementById('score-header');
  const body = document.getElementById('score-body');
  const foot = document.getElementById('score-totals');

  header.innerHTML = '<th>Round</th>' + g.players.map(p =>
    `<th>${escHtml(p.name)}</th>`
  ).join('');

  if (g.rounds.length === 0) {
    body.innerHTML = `<tr><td colspan="${g.players.length + 1}" class="empty-state">No rounds yet.</td></tr>`;
  } else {
    body.innerHTML = g.rounds.map(round => {
      const cells = g.players.map(p => {
        const s = round.scores.find(sc => sc.player_id === p.id);
        return `<td>${s ? s.score : '—'}</td>`;
      }).join('');
      return `<tr><td>${round.round_number}</td>${cells}</tr>`;
    }).join('');
  }

  const totals = calcTotals(g);
  const minTotal = Math.min(...g.players.map(p => totals[p.id] || 0));
  const maxTotal = Math.max(...g.players.map(p => totals[p.id] || 0));

  foot.innerHTML = '<td>Total</td>' + g.players.map(p => {
    const t = totals[p.id] || 0;
    let cls = '';
    if (g.is_complete && t === minTotal) cls = 'winner-col';
    else if (t === maxTotal && g.players.length > 1) cls = 'danger-col';
    return `<td class="${cls}">${t}</td>`;
  }).join('');
}

function initGameView() {
  document.getElementById('btn-back-from-game').addEventListener('click', () => {
    currentGameId = null;
    currentGameData = null;
    showDashboard();
  });

  document.getElementById('btn-add-round').addEventListener('click', openRoundModal);

  document.getElementById('btn-undo-round').addEventListener('click', async () => {
    if (!confirm('Undo the last round?')) return;
    try {
      await api('DELETE', `/games/${currentGameId}/rounds/last`);
      currentGameData = await api('GET', `/games/${currentGameId}`);
      renderGame();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('btn-delete-game').addEventListener('click', async () => {
    if (!confirm('Delete this game permanently?')) return;
    try {
      await api('DELETE', `/games/${currentGameId}`);
      currentGameId = null;
      currentGameData = null;
      showDashboard();
    } catch (err) {
      alert(err.message);
    }
  });
}

/* ── Round Modal ── */
function openRoundModal() {
  const g = currentGameData;
  const moonBtns = document.getElementById('shoot-moon-buttons');
  const inputs = document.getElementById('round-score-inputs');

  moonBtns.innerHTML = g.players.map(p =>
    `<button type="button" class="btn-moon" data-id="${p.id}">🌙 ${escHtml(p.name)}</button>`
  ).join('');

  inputs.innerHTML = g.players.map(p =>
    `<div class="round-input-row">
      <label>${escHtml(p.name)}</label>
      <input type="number" class="score-input" data-id="${p.id}" min="0" max="26" value="0" />
    </div>`
  ).join('');

  document.getElementById('round-error').classList.add('hidden');
  updateRoundTotal();

  inputs.querySelectorAll('.score-input').forEach(inp => {
    inp.addEventListener('input', updateRoundTotal);
  });

  moonBtns.querySelectorAll('.btn-moon').forEach(btn => {
    btn.addEventListener('click', () => {
      const shooterId = Number(btn.dataset.id);
      inputs.querySelectorAll('.score-input').forEach(inp => {
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
      errEl.textContent = `Scores should total 26 (currently ${total}). Use the 🌙 buttons for shoot the moon.`;
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');

    try {
      await api('POST', `/games/${currentGameId}/rounds`, { scores });
      currentGameData = await api('GET', `/games/${currentGameId}`);
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Boot ── */
function boot() {
  initAuth();
  initDashboard();
  initNewGame();
  initGameView();
  initModal();

  if (token) {
    showDashboard();
  } else {
    showView('view-auth');
  }
}

document.addEventListener('DOMContentLoaded', boot);
