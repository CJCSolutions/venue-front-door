'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createStore } = require('./lib/store');
const { buildSchedule, findOccurrence, openStatus } = require('./lib/schedule');
const { applyAction, ActionError, LOOKS } = require('./lib/actions');
const render = require('./lib/render');

const PORT = process.env.PORT || 3000;
const DEMO = process.env.DEMO_MODE === '1';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (DEMO ? 'marea' : '');
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_HOURS = 12;

const store = createStore();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

let ready = false;
let startError = null;
store.init().then(() => { ready = true; }).catch((e) => { startError = e; console.error('Storage failed to start:', e.message); });

// ---------- helpers ----------

function baseUrl(req) {
  return process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

async function context(req) {
  const { data, version } = await store.getState();
  const look = DEMO && LOOKS.includes(req.query.look) ? req.query.look : data.venue.look;
  return {
    state: data, version, look, demo: DEMO, path: req.originalUrl,
    schedule: buildSchedule(data), status: openStatus(data), baseUrl: baseUrl(req)
  };
}

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function makeToken() {
  const exp = String(Date.now() + SESSION_HOURS * 3600 * 1000);
  return `${exp}.${sign(exp)}`;
}

function validToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  const good = sign(exp);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return Number(exp) > Date.now();
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const hit = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

function requireAdmin(req, res, next) {
  if (validToken(readCookie(req, 'vfd_session'))) return next();
  res.status(401).json({ error: 'Please log in again' });
}

// Tiny in-memory rate limit for the public form and the login.
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

const page = (fn) => async (req, res) => {
  if (!ready) {
    res.status(503).set('Retry-After', '5').send(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>Starting</title><body style="font:16px system-ui;padding:40px">${startError ? 'The database could not be reached. Check DB_HOST, DB_USER, DB_PASSWORD and DB_NAME.' : 'Starting up, one moment…'}</body>`);
    return;
  }
  try {
    res.set('Cache-Control', 'no-store');
    await fn(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).send('Something went wrong. Please try again.');
  }
};

// ---------- static ----------

app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: '1h' }));

// ---------- public site ----------

app.get('/', page(async (req, res) => res.send(render.homePage(await context(req)))));
app.get('/whats-on', page(async (req, res) => res.send(render.whatsOnPage(await context(req)))));
app.get('/menu', page(async (req, res) => res.send(render.menuPage(await context(req)))));
app.get('/book', page(async (req, res) => {
  const ctx = await context(req);
  res.send(render.bookPage(ctx, { values: { src: String(req.query.src || '').slice(0, 20) } }));
}));
app.get('/night/:key', page(async (req, res) => {
  const ctx = await context(req);
  const o = findOccurrence(ctx.state, req.params.key);
  if (!o) return res.status(404).send(render.notFoundPage(ctx));
  res.send(render.nightPage(ctx, o));
}));

app.post('/book', express.urlencoded({ extended: false, limit: '20kb' }), page(async (req, res) => {
  const ctx = await context(req);
  const b = req.body || {};
  const values = {
    type: ['table', 'event', 'private'].includes(b.type) ? b.type : 'table',
    name: String(b.name || '').trim().slice(0, 80),
    contact: String(b.contact || '').trim().slice(0, 120),
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : '',
    guests: Math.max(0, Math.min(500, parseInt(b.guests, 10) || 0)) || '',
    message: String(b.message || '').trim().slice(0, 1000),
    src: String(b.src || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 20)
  };
  if (b.website) return res.send(render.bookPage(ctx, { sent: true })); // honeypot
  if (limited('book:' + req.ip, 5, 10 * 60 * 1000)) return res.status(429).send(render.bookPage(ctx, { error: 'Too many requests. Please try again in a few minutes.', values }));
  if (!values.name || !values.contact) return res.status(400).send(render.bookPage(ctx, { error: 'Please add your name and a phone number or email.', values }));
  const night = String(b.night || '').slice(0, 120);
  await store.addEnquiry({
    name: values.name, contact: values.contact, date: values.date || null, guests: values.guests || null,
    type: values.type, message: [night ? `Night: ${night}` : '', values.message].filter(Boolean).join('\n'), source: values.src || 'direct'
  });
  res.send(render.bookPage(ctx, { sent: true }));
}));

app.get('/photos/:id', page(async (req, res) => {
  if (!/^[a-f0-9]{16,32}$/.test(req.params.id)) return res.status(404).end();
  const p = await store.getPhoto(req.params.id);
  if (!p) return res.status(404).end();
  res.set('Content-Type', p.mime).set('Cache-Control', 'public, max-age=31536000, immutable').send(p.data);
}));

// ---------- public API ----------

app.get('/api/version', page(async (req, res) => res.json({ version: await store.version() })));

app.get('/api/public', page(async (req, res) => {
  const ctx = await context(req);
  res.json({
    venue: ctx.state.venue, status: ctx.status,
    tonight: ctx.schedule.tonight, upcoming: ctx.schedule.upcoming.slice(0, 14),
    menu: ctx.state.menu, version: ctx.version
  });
}));

app.get('/healthz', (req, res) => res.json({ ok: ready, storage: store.kind }));

// ---------- editor ----------

app.get('/admin', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/login', express.json({ limit: '4kb' }), (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'No editor password is set on the server (ADMIN_PASSWORD).' });
  if (limited('login:' + req.ip, 10, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many tries. Wait a few minutes.' });
  const given = Buffer.from(String((req.body || {}).password || ''));
  const want = Buffer.from(ADMIN_PASSWORD);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'Wrong password' });
  res.set('Set-Cookie', `vfd_session=${makeToken()}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.set('Set-Cookie', 'vfd_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/editor-info', (req, res) => res.json({ demo: DEMO, demoPassword: DEMO ? ADMIN_PASSWORD : null, loggedIn: validToken(readCookie(req, 'vfd_session')) }));

app.get('/api/admin/state', requireAdmin, page(async (req, res) => {
  const ctx = await context(req);
  const [changes, enquiries] = await Promise.all([store.listChanges(10), store.listEnquiries(50)]);
  res.json({
    state: ctx.state, version: ctx.version, schedule: ctx.schedule, status: ctx.status,
    changes, enquiries, baseUrl: ctx.baseUrl, demo: DEMO
  });
}));

app.post('/api/admin/action', requireAdmin, express.json({ limit: '64kb' }), page(async (req, res) => {
  const { action } = req.body || {};
  if (!action || typeof action.type !== 'string') return res.status(400).json({ error: 'Nothing to change' });
  // Each action is a small, self-contained change, so on a clash we simply
  // re-apply it to the newest record instead of losing someone's edit.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await store.getState();
    let result;
    try {
      result = applyAction(current.data, action);
    } catch (e) {
      if (e instanceof ActionError) return res.status(400).json({ error: e.message });
      throw e;
    }
    const saved = await store.saveState(result.state, current.version, result.change);
    if (saved) return res.json({ ok: true, version: saved, change: result.change });
  }
  res.status(409).json({ error: 'Busy, please try again' });
}));

app.post('/api/admin/photos', requireAdmin, express.json({ limit: '3mb' }), page(async (req, res) => {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String((req.body || {}).dataUrl || ''));
  if (!m) return res.status(400).json({ error: 'Use a JPEG, PNG or WebP photo' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) return res.status(413).json({ error: 'Photo is too big' });
  res.json({ id: await store.savePhoto(buf, m[1]) });
}));

app.patch('/api/admin/enquiries/:id', requireAdmin, express.json({ limit: '4kb' }), page(async (req, res) => {
  const status = (req.body || {}).status;
  if (!['new', 'replied', 'booked', 'declined'].includes(status)) return res.status(400).json({ error: 'Unknown status' });
  await store.setEnquiryStatus(Number(req.params.id), status);
  res.json({ ok: true });
}));

app.post('/api/admin/reset', requireAdmin, page(async (req, res) => {
  if (!DEMO) return res.status(403).json({ error: 'Reset is only available in demo mode' });
  await store.reset();
  res.json({ ok: true });
}));

app.use(page(async (req, res) => res.status(404).send(render.notFoundPage(await context(req)))));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Venue front door on :${PORT} (${store.kind} storage${DEMO ? ', demo mode' : ''})`));
}

module.exports = { app, store };
