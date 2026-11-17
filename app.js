'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createStore } = require('./lib/store');
const { buildSchedule, findOccurrence, openStatus, labels, menusNow } = require('./lib/schedule');
const { applyAction, ActionError, LOOKS } = require('./lib/actions');
const { buildStats } = require('./lib/stats');
const { localNow, addDays } = require('./lib/time');
const render = require('./lib/render');

const PORT = process.env.PORT || 3000;
const DEMO = process.env.DEMO_MODE === '1';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (DEMO ? 'marea' : '');
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_HOURS = 12;
const SECURE = process.env.NODE_ENV === 'production' ? '; Secure' : '';

const store = createStore();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

let ready = false;
let startError = null;
store.init().then(() => { ready = true; }).catch((e) => { startError = e; console.error('Storage failed to start:', e.message); });

// ---------- helpers ----------

function baseUrl(req) { return process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`; }

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const hit = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

async function currentMember(req) {
  const t = readCookie(req, 'vfd_circle');
  return t && /^[\w-]{10,60}$/.test(t) ? store.memberByToken(t) : null;
}

async function context(req, extra = {}) {
  const [{ data, version }, counts, member] = await Promise.all([store.getState(), store.bookedCounts(), extra.member !== undefined ? extra.member : currentMember(req)]);
  const look = DEMO && LOOKS.includes(req.query.look) ? req.query.look : data.venue.look;
  return {
    state: data, version, look, demo: DEMO, path: req.originalUrl, member, counts,
    schedule: buildSchedule(data, new Date(), { member: Boolean(member) }), status: openStatus(data),
    menus: data.venue.features.menu ? menusNow(data) : [], L: labels(data), baseUrl: baseUrl(req)
  };
}

function sign(value) { return crypto.createHmac('sha256', SECRET).update(value).digest('base64url'); }
function makeToken() { const exp = String(Date.now() + SESSION_HOURS * 3600 * 1000); return `${exp}.${sign(exp)}`; }
function validToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  const good = sign(exp);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return Number(exp) > Date.now();
}
function isEditor(req) { return validToken(readCookie(req, 'vfd_session')); }
function requireAdmin(req, res, next) { if (isEditor(req)) return next(); res.status(401).json({ error: 'Please log in again' }); }

const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

const cleanSrc = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);

// Where a visit came from: the ?src= tag on shared links, else the referrer.
function visitSource(req) {
  const tagged = cleanSrc(req.query.src);
  if (tagged) return tagged;
  const ref = String(req.get('referer') || '');
  if (!ref || ref.includes(req.get('host'))) return 'direct';
  if (/instagram\./.test(ref)) return 'instagram';
  if (/google\./.test(ref)) return 'google';
  if (/facebook\.|fb\./.test(ref)) return 'facebook';
  if (/tripadvisor\./.test(ref)) return 'tripadvisor';
  return 'other';
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

// Count real page loads (not the live refresh, not bots, not the editor).
function countVisit(req) {
  if (req.get('X-Live') || isEditor(req) || /bot|crawl|spider|preview/i.test(req.get('user-agent') || '')) return;
  store.getState().then(({ data }) => store.countView(localNow(data.venue.timezone).date, visitSource(req))).catch(() => {});
}

// ---------- static ----------

app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: '1h' }));

// ---------- public site ----------

app.get('/', page(async (req, res) => { countVisit(req); res.send(render.homePage(await context(req))); }));
app.get('/whats-on', page(async (req, res) => { countVisit(req); res.send(render.whatsOnPage(await context(req))); }));
app.get('/menu', page(async (req, res) => {
  countVisit(req);
  const ctx = await context(req);
  if (!ctx.state.venue.features.menu) return res.status(404).send(render.notFoundPage(ctx));
  res.send(render.menuPage(ctx));
}));
app.get('/book', page(async (req, res) => {
  countVisit(req);
  res.send(render.bookPage(await context(req), { values: { src: cleanSrc(req.query.src) } }));
}));
app.get('/night/:key', (req, res) => res.redirect(301, `/event/${encodeURIComponent(req.params.key)}`));

app.get('/event/:key', page(async (req, res) => {
  countVisit(req);
  const ctx = await context(req);
  const o = findOccurrence(ctx.state, req.params.key, new Date(), { member: Boolean(ctx.member), editor: isEditor(req) });
  if (!o) return res.status(404).send(render.notFoundPage(ctx));
  res.send(render.eventPage(ctx, o, { values: { src: cleanSrc(req.query.src) } }));
}));

const form = express.urlencoded({ extended: false, limit: '20kb' });

app.post('/event/:key', form, page(async (req, res) => {
  const ctx = await context(req);
  const o = findOccurrence(ctx.state, req.params.key, new Date(), { member: Boolean(ctx.member) });
  if (!o) return res.status(404).send(render.notFoundPage(ctx));
  const b = req.body || {};
  const values = { name: String(b.name || '').trim().slice(0, 80), contact: String(b.contact || '').trim().slice(0, 120), guests: parseInt(b.guests, 10) || 0, src: cleanSrc(b.src) };
  const again = (status, error) => res.status(status).send(render.eventPage(ctx, o, { error, values }));
  if (b.website) return res.send(render.eventPage(ctx, o, { sent: { name: values.name, guests: values.guests || 1 } }));
  if (!o.bookable || o.status === 'past' || !ctx.state.venue.features.bookings) return again(400, 'This one is not taking bookings.');
  if (limited('evbook:' + req.ip, 8, 10 * 60 * 1000)) return again(429, 'Too many requests. Please try again in a few minutes.');
  if (!values.name || !values.contact) return again(400, 'Please add your name and a phone number or email.');
  if (!(values.guests >= 1 && values.guests <= 20)) return again(400, 'Guests must be between 1 and 20.');
  const result = await store.addBooking({
    event_key: o.key, event_name: o.name.slice(0, 80), date: o.date, name: values.name, contact: values.contact,
    guests: values.guests, source: values.src || (ctx.member ? 'circle' : 'direct')
  }, o.capacity);
  if (result.full) return again(409, result.left ? `Only ${result.left} ${result.left > 1 ? 'places' : 'place'} left.` : 'Sorry, that just filled up.');
  ctx.counts = await store.bookedCounts();
  res.send(render.eventPage(ctx, o, { sent: { name: values.name, guests: values.guests } }));
}));

app.post('/book', form, page(async (req, res) => {
  const ctx = await context(req);
  const b = req.body || {};
  const values = {
    type: ['table', 'private', 'other'].includes(b.type) ? b.type : 'table',
    name: String(b.name || '').trim().slice(0, 80),
    contact: String(b.contact || '').trim().slice(0, 120),
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : '',
    guests: Math.max(0, Math.min(500, parseInt(b.guests, 10) || 0)) || '',
    message: String(b.message || '').trim().slice(0, 1000),
    src: cleanSrc(b.src)
  };
  if (b.website) return res.send(render.bookPage(ctx, { sent: true }));
  if (limited('book:' + req.ip, 5, 10 * 60 * 1000)) return res.status(429).send(render.bookPage(ctx, { error: 'Too many requests. Please try again in a few minutes.', values }));
  if (!values.name || !values.contact) return res.status(400).send(render.bookPage(ctx, { error: 'Please add your name and a phone number or email.', values }));
  await store.addEnquiry({ name: values.name, contact: values.contact, date: values.date || null, guests: values.guests || null, type: values.type, message: values.message, source: values.src || 'direct' });
  res.send(render.bookPage(ctx, { sent: true }));
}));

// ---------- the Circle ----------

function setCircleCookie(res, token) {
  res.append('Set-Cookie', `vfd_circle=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${400 * 86400}${SECURE}`);
}

app.get('/circle', page(async (req, res) => {
  countVisit(req);
  const ctx = await context(req);
  if (!ctx.state.venue.features.circle) return res.status(404).send(render.notFoundPage(ctx));
  res.send(render.circlePage(ctx, { joined: req.query.welcome === '1' }));
}));

// Personal link: opens the Circle on a new phone.
app.get('/circle/key/:token', page(async (req, res) => {
  const m = /^[\w-]{10,60}$/.test(req.params.token) ? await store.memberByToken(req.params.token) : null;
  if (m) setCircleCookie(res, req.params.token);
  res.redirect(302, '/circle');
}));

app.post('/circle', form, page(async (req, res) => {
  const b = req.body || {};
  const ctx = await context(req);
  const name = String(b.name || '').trim().slice(0, 80);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
  if (b.website) return res.redirect(303, '/circle');
  if (limited('circle:' + req.ip, 6, 10 * 60 * 1000)) return res.status(429).send(render.circlePage(ctx, { error: 'Too many tries. Please wait a few minutes.' }));
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).send(render.circlePage(ctx, { error: 'Please add your name and a valid email.' }));
  if (b.consent !== '1') return res.status(400).send(render.circlePage(ctx, { error: 'Please tick the box so we can email you.' }));
  const { token } = await store.addMember({ name, email, source: cleanSrc(b.src) || 'direct' });
  setCircleCookie(res, token);
  res.redirect(303, '/circle?welcome=1');
}));

app.get('/photos/:id', page(async (req, res) => {
  if (!/^[a-f0-9]{16,32}$/.test(req.params.id)) return res.status(404).end();
  const p = await store.getPhoto(req.params.id);
  if (!p) return res.status(404).end();
  res.set('Content-Type', p.mime).set('Cache-Control', 'public, max-age=31536000, immutable').send(p.data);
}));

// ---------- public API ----------

app.get('/api/version', page(async (req, res) => res.json({ version: await store.version() })));
app.get('/healthz', (req, res) => res.json({ ok: ready, storage: store.kind }));

// ---------- editor ----------

app.get('/admin', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'public', 'admin.html')); });

app.post('/api/login', express.json({ limit: '4kb' }), (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'No editor password is set on the server (ADMIN_PASSWORD).' });
  if (limited('login:' + req.ip, 10, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many tries. Wait a few minutes.' });
  const given = Buffer.from(String((req.body || {}).password || ''));
  const want = Buffer.from(ADMIN_PASSWORD);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'Wrong password' });
  res.set('Set-Cookie', `vfd_session=${makeToken()}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${SECURE}`);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { res.set('Set-Cookie', 'vfd_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'); res.json({ ok: true }); });

app.get('/api/editor-info', (req, res) => res.json({ demo: DEMO, demoPassword: DEMO ? ADMIN_PASSWORD : null, loggedIn: isEditor(req) }));

app.get('/api/admin/state', requireAdmin, page(async (req, res) => {
  const [{ data, version }, changes, enquiries, bookings, members] = await Promise.all([
    store.getState(), store.listChanges(10), store.listEnquiries(100), store.listBookings(500), store.listMembers(1000)
  ]);
  const schedule = buildSchedule(data, new Date(), { editor: true });
  const views = await store.listViews(addDays(schedule.today, -30));
  const counts = await store.bookedCounts();
  res.json({
    state: data, version, schedule, status: openStatus(data), menus: menusNow(data), labels: labels(data),
    changes, enquiries, bookings, members, counts,
    stats: buildStats({ state: data, schedule, bookings, members, views, enquiries }),
    baseUrl: baseUrl(req), demo: DEMO
  });
}));

app.post('/api/admin/action', requireAdmin, express.json({ limit: '64kb' }), page(async (req, res) => {
  const { action } = req.body || {};
  if (!action || typeof action.type !== 'string') return res.status(400).json({ error: 'Nothing to change' });
  // Each action is a small, self-contained change, so on a clash we re-apply
  // it to the newest record instead of losing someone's edit.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await store.getState();
    let result;
    try { result = applyAction(current.data, action); } catch (e) {
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

app.patch('/api/admin/bookings/:id', requireAdmin, express.json({ limit: '4kb' }), page(async (req, res) => {
  const status = (req.body || {}).status;
  if (!['confirmed', 'arrived', 'cancelled', 'no-show'].includes(status)) return res.status(400).json({ error: 'Unknown status' });
  await store.setBookingStatus(Number(req.params.id), status);
  res.json({ ok: true });
}));

app.get('/api/admin/members.csv', requireAdmin, page(async (req, res) => {
  const rows = await store.listMembers(100000);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="circle-members.csv"');
  res.send(['name,email,joined,source', ...rows.map((m) => [m.name, m.email, String(m.created_at).slice(0, 10), m.source].map(cell).join(','))].join('\n'));
}));

app.post('/api/admin/reset', requireAdmin, page(async (req, res) => {
  if (!DEMO) return res.status(403).json({ error: 'Reset is only available in demo mode' });
  await store.reset();
  res.json({ ok: true });
}));

app.use(page(async (req, res) => res.status(404).send(render.notFoundPage(await context(req)))));

module.exports = { app, store, PORT, DEMO };
