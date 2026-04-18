const express = require('express');
const path = require('path');
const db = require('./db');
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

db.init()
  .then(() => app.listen(PORT, () => console.log(`Hearts Score Sheet running on http://localhost:${PORT}`)))
  .catch(err => { console.error('Failed to connect to database:', err.message); process.exit(1); });
