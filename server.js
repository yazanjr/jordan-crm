require('dotenv').config();
const express  = require('express');
const path     = require('path');
const http     = require('http');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 4000;

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Attach io to every request so routes can emit events ─────────────────────
app.use((req, _res, next) => { req.io = io; next(); });

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/roles',         require('./routes/roles'));
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/contacts',      require('./routes/contacts'));
app.use('/api/deal-contacts', require('./routes/dealContacts'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/opportunities', require('./routes/opportunities'));
app.use('/api/projects',      require('./routes/projects'));
app.use('/api/quotations',    require('./routes/quotations'));
app.use('/api/approvals',     require('./routes/approvals'));
app.use('/api/activities',    require('./routes/activities'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/diagnostics',   require('./routes/diagnostics'));

// Design workflow (uses demo-auth via x-demo-user-id header — see middleware/demoAuth.js)
app.use('/api',               require('./routes/design'));
app.use('/api',               require('./routes/products'));

// Idempotent design-pages seed (runs once on first start; safe to re-run).
require('./database/design_seed')();

// ── Friendly redirects for the new pipeline ────────────────────────────────
app.get(['/pipeline', '/pipeline/'], (_req, res) => {
  res.redirect('/pipeline/Pipeline.html');
});
app.get('/contacts', (_req, res) => {
  res.redirect('/pipeline/Contacts.html');
});
app.get('/reports', (_req, res) => {
  res.redirect('/pipeline/Reports.html');
});

// ── Catch-all: SPA ───────────────────────────────────────────────────────────
app.get('/app*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  socket.on('join', userId => socket.join(`user:${userId}`));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅  IMG CRM is running`);
  console.log(`    Local  : http://localhost:${PORT}`);
  console.log(`    Network: http://0.0.0.0:${PORT}\n`);
});

module.exports = { app, io };
