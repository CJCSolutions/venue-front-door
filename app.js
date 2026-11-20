'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createStore } = require('./lib/store');
const { buildSchedule, findOccurrence, openStatus, labels, menusNow, offersNow } = require('./lib/schedule');
const { PRESETS, MODULES, SECTIONS } = require('./lib/presets');
const { SAMPLES, overlay } = require('./lib/samples');
const { applyAction, ActionError, LOOKS } = require('./lib/actions');
const { buildStats } = require('./lib/stats');
const { preordersNow, remaining, prepList, MODES } = require('./lib/orders');
const { localNow, addDays, serviceDate, formatDate } = require('./lib/time');
const render = require('./lib/render');
const { buildFeed, guideFeed, isGuestHost } = require('./lib/playbook');
const listed = require('./lib/listed');
const pitch = require('./lib/pitch');
const R = require('./lib/reservations');
const TP = require('./lib/tableplan');
const notify = require('./lib/notify');
const LEADS_PASSWORD = process.env.LEADS_PASSWORD || '';

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

// Demo only: which sample venue and style the visitor picked. Remembered in
// a cookie so every page and link stays on the same sample.
function demoChoice(req, res) {
  if (!DEMO) return {};
  let sample = SAMPLES[req.query.sample] ? req.query.sample : readCookie(req, 'vfd_sample');
  let look = LOOKS.includes(req.query.look) ? req.query.look : readCookie(req, 'vfd_look');
  if (!SAMPLES[sample]) sample = 'restaurant';
  if (req.query.sample && !req.query.look) look = null; // a new sample shows its own style
  if (!LOOKS.includes(look)) look = null;
  if (res && (req.query.sample || req.query.look)) {
    res.append('Set-Cookie', `vfd_sample=${sample}; Path=/; SameSite=Lax; Max-Age=86400${SECURE}`);
    res.append('Set-Cookie', `vfd_look=${look || ''}; Path=/; SameSite=Lax; Max-Age=${look ? 86400 : 0}${SECURE}`);
  }
  return { sample, look };
}

async function context(req, extra = {}) {
  const [{ data: saved, version }, counts, member] = await Promise.all([store.getState(), store.bookedCounts(), extra.member !== undefined ? extra.member : currentMember(req)]);
  const choice = demoChoice(req, extra.res);
  const data = DEMO ? overlay(saved, choice.sample) : saved;
  const look = choice.look || data.venue.look;
  return {
    state: data, version, look, demo: DEMO, sample: choice.sample || null, path: req.originalUrl, member, counts, embed: req.query.embed === '1',
    schedule: buildSchedule(data, new Date(), { member: Boolean(member) }), status: openStatus(data),
    menus: data.venue.modules.menu ? menusNow(data) : [], offers: data.venue.modules.offers ? offersNow(data) : [],
    preorders: data.venue.modules.preorder ? preordersNow(data) : [], L: labels(data), baseUrl: baseUrl(req)
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

const enc = encodeURIComponent;
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

// ---------- the guest Playbook address (ibizaplaybook.com) ----------
// That address shows only the guide. Everything else on it goes to the venue
// platform's own address, so guests never land on a sample venue page.
const GUEST_PATHS = new Set(['/', '/playbook', '/playbook/add', '/api/playbook-guide.json', '/api/playbook.json', '/healthz']);
function playbookPage(guest) {
  const html = require('fs').readFileSync(path.join(__dirname, 'public', 'playbook.html'), 'utf8');
  return guest ? html.replace('<html lang="en">', '<html lang="es" data-guest>') : html;
}
app.use((req, res, next) => {
  if (!isGuestHost(req.hostname)) return next();
  req.guest = true;
  if (GUEST_PATHS.has(req.path)) return next();
  res.redirect(302, `${process.env.PUBLIC_URL || 'https://venue.foodforthought.agency'}${req.originalUrl}`);
});

// ---------- static ----------

app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: '1h' }));

// ---------- public site ----------

app.get('/', page(async (req, res, next) => { if (req.guest) return res.set('Cache-Control', 'no-store').type('html').send(playbookPage(true)); countVisit(req); res.send(render.homePage(await context(req, { res }))); }));
app.get('/whats-on', page(async (req, res) => {
  countVisit(req);
  const ctx = await context(req, { res });
  if (!ctx.state.venue.modules.events) return res.status(404).send(render.notFoundPage(ctx));
  res.send(render.whatsOnPage(ctx));
}));
app.get('/about', page(async (req, res) => {
  countVisit(req);
  const ctx = await context(req, { res });
  if (!ctx.state.venue.modules.about && !ctx.state.venue.modules.gallery) return res.status(404).send(render.notFoundPage(ctx));
  res.send(render.aboutPage(ctx));
}));
app.get('/visit', page(async (req, res) => { countVisit(req); res.send(render.visitPage(await context(req, { res }))); }));
app.get('/menu', page(async (req, res) => {
  countVisit(req);
  const ctx = await context(req, { res });
  if (!ctx.state.venue.modules.menu) return res.status(404).send(render.notFoundPage(ctx));
  res.send(render.menuPage(ctx));
}));
// Table bookings: the dates with space, and the times left on the chosen one.
async function tableCtx(state, wanted) {
  if (!R.tablesOn(state)) return null;
  const settings = R.tableSettings(state);
  const dates = R.bookableDates(state);
  const date = dates.includes(wanted) ? wanted : dates[0] || null;
  const plan = TP.planOn(settings) ? TP.planOf(settings) : null;
  const times = !date ? [] : plan ? R.timesForPlan(state, date, await store.reservationsOn(date)) : R.timesFor(state, date, await store.reservationsTaken(date));
  return { settings, dates, date, times, plan };
}

// Table plan: a check for the store, run inside its lock with the day's bookings.
// Gives the booking the best free table, or says the time is full.
function planCheck(plan, time, guests, { force = false } = {}) {
  return (rows) => {
    const o = TP.place(plan, rows, time, guests);
    if (o) return { table_ref: o.ref };
    if (force) return { table_ref: null };
    return { full: true, left: TP.biggestFree(plan, rows, time) };
  };
}

app.get('/book', page(async (req, res) => {
  countVisit(req);
  const ctx = await context(req, { res });
  const table = await tableCtx(ctx.state, req.query.date);
  res.send(render.bookPage(ctx, { table, values: { src: cleanSrc(req.query.src), type: ['table', 'private', 'other'].includes(req.query.type) ? req.query.type : '' }, tableValues: { src: cleanSrc(req.query.src), guests: parseInt(req.query.guests, 10) || 2 } }));
}));

app.post('/book/table', express.urlencoded({ extended: false, limit: '20kb' }), page(async (req, res) => {
  const ctx = await context(req, { res });
  const b = req.body || {};
  const tv = {
    date: String(b.date || ''), time: String(b.time || ''), guests: parseInt(b.guests, 10) || 0,
    name: String(b.name || '').trim().slice(0, 80), contact: String(b.contact || '').trim().slice(0, 120),
    note: String(b.note || '').trim().slice(0, 300), src: cleanSrc(b.src)
  };
  const table = await tableCtx(ctx.state, tv.date);
  const again = async (status, error, fresh) => res.status(status).send(render.bookPage(ctx, { table: fresh || table, tableValues: tv, tableError: error }));
  if (!table) return res.status(404).send(render.notFoundPage(ctx));
  if (b.website) return res.send(render.bookPage(ctx, { table, tableSent: { status: 'pending', ...tv } }));
  if (limited('table:' + req.ip, 6, 10 * 60 * 1000)) return again(429, 'Too many bookings. Please try again in a few minutes.');
  if (table.date !== tv.date) return again(400, 'That day is not available. Pick another day.');
  const slot = table.times.find((t) => t.time === tv.time);
  if (!slot) return again(400, 'Pick a time.');
  if (!(tv.guests >= 1 && tv.guests <= table.settings.maxParty)) return again(400, `Bookings are for 1 to ${table.settings.maxParty} guests. For a bigger group, send a request below.`);
  if (!tv.name || !tv.contact) return again(400, 'Please add your name and a phone number or email.');
  const status = table.settings.mode === 'manual' ? 'pending' : 'confirmed';
  const plan = table.plan;
  const result = await store.addReservation({ date: tv.date, time: tv.time, guests: tv.guests, name: tv.name, contact: tv.contact, note: tv.note, status, source: tv.src || (ctx.member ? 'circle' : 'direct') }, plan ? planCheck(plan, tv.time, tv.guests) : table.settings.covers);
  if (result.full) {
    const msg = plan
      ? (result.left ? `At ${tv.time} we can seat up to ${result.left}. Try fewer guests or another time.` : `${tv.time} just filled up. Pick another time.`)
      : (result.left ? `Only ${result.left} ${result.left > 1 ? 'places' : 'place'} left at ${tv.time}. Try fewer guests or another time.` : `${tv.time} just filled up. Pick another time.`);
    return again(409, msg, await tableCtx(ctx.state, tv.date));
  }
  const when = `${formatDate(tv.date)} at ${tv.time}`;
  // Table plan: when only a join or a split fits, the subject says what to do.
  const todo = plan && TP.action(plan, result.table_ref);
  const subject = todo ? `Party of ${tv.guests} at ${tv.time}: ${todo}${status === 'pending' ? ' (to confirm)' : ''}` : status === 'pending' ? `Booking to confirm: ${tv.guests} at ${tv.time}` : `New booking: ${tv.guests} at ${tv.time}`;
  notify.venueAlert(ctx.state, subject,
    [`${tv.name}, ${tv.guests} ${tv.guests > 1 ? 'guests' : 'guest'}, ${when}.`, plan && `${TP.label(plan, result.table_ref)}.${todo ? ` Please ${todo} before ${tv.time}.` : ''}`, `Contact: ${tv.contact}`, tv.note && `Note: ${tv.note}`, status === 'pending' ? 'Confirm or decline it in the editor.' : 'Confirmed automatically.'],
    { replyTo: tv.contact, base: baseUrl(req) });
  if (status === 'confirmed') notify.guestEmail(ctx.state, tv.contact, 'your table is booked', ['Hello,', '', `Your table for ${tv.guests} is booked for ${when}.`, 'Need to change it? Just reply to this email.']);
  res.send(render.bookPage(ctx, { table: await tableCtx(ctx.state, tv.date), tableSent: { status, ...tv } }));
}));

// Order ahead to collect today, from the live menu. Paid on collection.
function collectCtx(state) {
  const slots = R.collectSlots(state);
  return { settings: R.collectSettings(state), slots, menus: R.collectMenu(state, new Date(), slots) };
}

app.get('/collect', page(async (req, res) => {
  countVisit(req);
  const ctx = await context(req, { res });
  if (!ctx.state.venue.modules.collect) return res.status(404).send(render.notFoundPage(ctx));
  res.send(render.collectPage(ctx, collectCtx(ctx.state), { values: { src: cleanSrc(req.query.src) } }));
}));

app.post('/collect', express.urlencoded({ extended: false, limit: '40kb' }), page(async (req, res) => {
  const ctx = await context(req, { res });
  if (!ctx.state.venue.modules.collect) return res.status(404).send(render.notFoundPage(ctx));
  const c = collectCtx(ctx.state);
  const b = req.body || {};
  const all = c.menus.flatMap((m) => m.sections.flatMap((s) => s.items));
  const qty = {};
  for (const it of all) { const n = parseInt(b['qty_' + it.id], 10); if (n > 0) qty[it.id] = Math.min(n, 30); }
  const values = { name: String(b.name || '').trim().slice(0, 80), contact: String(b.contact || '').trim().slice(0, 120), note: String(b.note || '').trim().slice(0, 300), slot: String(b.slot || ''), qty, src: cleanSrc(b.src) };
  const again = (status, error) => res.status(status).send(render.collectPage(ctx, c, { error, values }));
  if (b.website) return res.send(render.collectPage(ctx, c, { sent: { name: values.name, items: [], total: 0, slot: values.slot } }));
  if (!c.slots.length) return again(400, 'We are not taking orders right now.');
  if (limited('collect:' + req.ip, 8, 10 * 60 * 1000)) return again(429, 'Too many orders. Please try again in a few minutes.');
  const items = all.filter((it) => qty[it.id]).map((it) => ({ id: it.id, name: it.name, qty: qty[it.id], price: it.price }));
  if (!items.length) return again(400, 'Add at least one dish.');
  if (!c.slots.includes(values.slot)) return again(400, 'Pick a pickup time.');
  const onMenus = R.menusByItem(ctx.state);
  const notThen = items.find((i) => !(onMenus[i.id] || []).some((m) => R.serves(m, values.slot)));
  if (notThen) { const m = onMenus[notThen.id][0]; return again(400, `${notThen.name} is served ${m.from} to ${m.to}. Pick a pickup time then, or leave it out.`); }
  if (!values.name || !values.contact) return again(400, 'Please add your name and a phone number or email.');
  const total = Math.round(items.reduce((t, i) => t + i.qty * i.price, 0) * 100) / 100;
  const date = localNow(ctx.state.venue.timezone).date;
  await store.addOrder({ preorder_id: 'collect', preorder_name: 'Order ahead', date, slot: values.slot, mode: 'collect', name: values.name, contact: values.contact, items, total, note: values.note, source: values.src || (ctx.member ? 'circle' : 'direct') }, {});
  notify.venueAlert(ctx.state, `New order for ${values.slot}: ${values.name}`,
    [`Pickup today at ${values.slot}.`, ...items.map((i) => `${i.qty} x ${i.name}`), `Total €${total.toFixed(2)}, paid on collection.`, `Contact: ${values.contact}`, values.note && `Note: ${values.note}`],
    { replyTo: values.contact, base: baseUrl(req) });
  res.send(render.collectPage(ctx, c, { sent: { name: values.name, items, total, slot: values.slot } }));
}));
// Pre-orders: weekend bakes, a Sunday roast. One page per pre-order.
app.get('/order', page(async (req, res) => {
  countVisit(req);
  const ctx = await context(req, { res });
  if (!ctx.state.venue.modules.preorder || !ctx.preorders.length) return res.status(404).send(render.notFoundPage(ctx));
  if (ctx.preorders.length === 1) return res.redirect(302, `/order/${enc(ctx.preorders[0].id)}${req.query.src ? `?src=${enc(cleanSrc(req.query.src))}` : ''}`);
  res.send(render.ordersPage(ctx));
}));

async function orderCtx(req, res) {
  const ctx = await context(req, { res });
  const po = ctx.state.venue.modules.preorder ? ctx.preorders.find((x) => x.id === req.params.id) : null;
  if (!po) return { ctx };
  const wanted = (req.body && req.body.date) || req.query.date;
  const chosen = po.dates.find((x) => x.date === wanted) || po.dates[0] || null;
  const left = chosen ? remaining(po, await store.takenFor(po.id, chosen.date)) : {};
  return { ctx, po, chosen, left };
}

app.get('/order/:id', page(async (req, res) => {
  countVisit(req);
  const { ctx, po, chosen, left } = await orderCtx(req, res);
  if (!po) return res.status(404).send(render.notFoundPage(ctx));
  res.send(render.orderPage(ctx, po, chosen, left, { values: { src: cleanSrc(req.query.src) } }));
}));

app.get('/night/:key', (req, res) => res.redirect(301, `/event/${encodeURIComponent(req.params.key)}`));

app.get('/event/:key', page(async (req, res) => {
  countVisit(req);
  const ctx = await context(req, { res });
  const o = findOccurrence(ctx.state, req.params.key, new Date(), { member: Boolean(ctx.member), editor: isEditor(req) });
  if (!o) return res.status(404).send(render.notFoundPage(ctx));
  res.send(render.eventPage(ctx, o, { values: { src: cleanSrc(req.query.src) } }));
}));

const form = express.urlencoded({ extended: false, limit: '20kb' });

app.post('/event/:key', form, page(async (req, res) => {
  const ctx = await context(req, { res });
  const o = findOccurrence(ctx.state, req.params.key, new Date(), { member: Boolean(ctx.member) });
  if (!o) return res.status(404).send(render.notFoundPage(ctx));
  const b = req.body || {};
  const values = { name: String(b.name || '').trim().slice(0, 80), contact: String(b.contact || '').trim().slice(0, 120), guests: parseInt(b.guests, 10) || 0, src: cleanSrc(b.src) };
  const again = (status, error) => res.status(status).send(render.eventPage(ctx, o, { error, values }));
  if (b.website) return res.send(render.eventPage(ctx, o, { sent: { name: values.name, guests: values.guests || 1 } }));
  if (!o.bookable || o.status === 'past' || !ctx.state.venue.modules.bookings) return again(400, 'This one is not taking bookings.');
  if (limited('evbook:' + req.ip, 8, 10 * 60 * 1000)) return again(429, 'Too many requests. Please try again in a few minutes.');
  if (!values.name || !values.contact) return again(400, 'Please add your name and a phone number or email.');
  if (!(values.guests >= 1 && values.guests <= 20)) return again(400, 'Guests must be between 1 and 20.');
  const result = await store.addBooking({
    event_key: o.key, event_name: o.name.slice(0, 80), date: o.date, name: values.name, contact: values.contact,
    guests: values.guests, source: values.src || (ctx.member ? 'circle' : 'direct')
  }, o.capacity);
  if (result.full) return again(409, result.left ? `Only ${result.left} ${result.left > 1 ? 'places' : 'place'} left.` : 'Sorry, that just filled up.');
  ctx.counts = await store.bookedCounts();
  notify.venueAlert(ctx.state, `New booking: ${values.guests} for ${o.name}`, [`${values.name}, ${values.guests} for ${o.name} on ${formatDate(o.date)}.`, `Contact: ${values.contact}`], { replyTo: values.contact, base: baseUrl(req) });
  res.send(render.eventPage(ctx, o, { sent: { name: values.name, guests: values.guests } }));
}));

app.post('/order/:id', form, page(async (req, res) => {
  const { ctx, po, chosen, left } = await orderCtx(req, res);
  if (!po) return res.status(404).send(render.notFoundPage(ctx));
  const b = req.body || {};
  const qty = {};
  for (const it of po.items) { const n = parseInt(b['qty_' + it.id], 10); if (n > 0) qty[it.id] = n; }
  const values = {
    name: String(b.name || '').trim().slice(0, 80), contact: String(b.contact || '').trim().slice(0, 120),
    note: String(b.note || '').trim().slice(0, 300), slot: String(b.slot || ''), mode: String(b.mode || ''), qty, src: cleanSrc(b.src)
  };
  const again = (status, error) => res.status(status).send(render.orderPage(ctx, po, chosen, left, { error, values }));
  if (b.website) return res.send(render.orderPage(ctx, po, chosen, left, { sent: { name: values.name } }));
  if (!chosen || chosen.date !== b.date) return again(400, 'Orders for that day have closed. Pick another day.');
  if (limited('order:' + req.ip, 8, 10 * 60 * 1000)) return again(429, 'Too many orders. Please try again in a few minutes.');
  const items = po.items.filter((it) => qty[it.id]).map((it) => ({ id: it.id, name: it.name, qty: Math.min(qty[it.id], 50), price: it.price }));
  if (!items.length) return again(400, 'Add at least one item.');
  if (!po.slots.includes(values.slot)) return again(400, 'Pick a time.');
  if (!po.modes.includes(values.mode)) return again(400, `Pick ${po.modes.map((m) => MODES[m].toLowerCase()).join(' or ')}.`);
  if (!values.name || !values.contact) return again(400, 'Please add your name and a phone number or email.');
  const limits = Object.fromEntries(po.items.map((it) => [it.id, it.soldOut ? 0 : it.limit]));
  const total = Math.round(items.reduce((t, i) => t + i.qty * i.price, 0) * 100) / 100;
  const result = await store.addOrder({
    preorder_id: po.id, preorder_name: po.name.slice(0, 80), date: chosen.date, slot: values.slot, mode: values.mode,
    name: values.name, contact: values.contact, items, total, note: values.note, source: values.src || (ctx.member ? 'circle' : 'direct')
  }, limits);
  if (result.short) {
    const fresh = remaining(po, await store.takenFor(po.id, chosen.date));
    return res.status(409).send(render.orderPage(ctx, po, chosen, fresh, { error: result.short.left ? `Only ${result.short.left} ${result.short.name} left for that day.` : `${result.short.name} has sold out for that day.`, values }));
  }
  notify.venueAlert(ctx.state, `New pre-order: ${po.name}, ${values.name}`,
    [`${formatDate(chosen.date)} at ${values.slot}, ${MODES[values.mode].toLowerCase()}.`, ...items.map((i) => `${i.qty} x ${i.name}`), `Total €${total.toFixed(2)}, paid on the day.`, `Contact: ${values.contact}`, values.note && `Note: ${values.note}`],
    { replyTo: values.contact, base: baseUrl(req) });
  res.send(render.orderPage(ctx, po, chosen, left, { sent: { name: values.name, items, total, slot: values.slot, mode: values.mode, date: chosen.date } }));
}));

app.post('/book', form, page(async (req, res) => {
  const ctx = await context(req, { res });
  const table = await tableCtx(ctx.state);
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
  if (b.website) return res.send(render.bookPage(ctx, { sent: true, table }));
  if (limited('book:' + req.ip, 5, 10 * 60 * 1000)) return res.status(429).send(render.bookPage(ctx, { table, error: 'Too many requests. Please try again in a few minutes.', values }));
  if (!values.name || !values.contact) return res.status(400).send(render.bookPage(ctx, { table, error: 'Please add your name and a phone number or email.', values }));
  await store.addEnquiry({ name: values.name, contact: values.contact, date: values.date || null, guests: values.guests || null, type: values.type, message: values.message, source: values.src || 'direct' });
  notify.venueAlert(ctx.state, `New request: ${({ table: 'group', private: 'private hire', other: 'enquiry' })[values.type]} from ${values.name}`,
    [values.date && `Date: ${formatDate(values.date)}`, values.guests && `Guests: ${values.guests}`, `Contact: ${values.contact}`, values.message && `Message: ${values.message}`],
    { replyTo: values.contact, base: baseUrl(req) });
  res.send(render.bookPage(ctx, { sent: true, table }));
}));

// ---------- sales page and leads ----------

app.get('/pulse', (req, res) => res.redirect(301, '/for-venues' + (req.query.lang === 'es' ? '?lang=es' : '')));
app.get('/for-venues', page(async (req, res) => {
  countVisit(req);
  res.send(pitch.pitchPage({ lang: req.query.lang === 'es' ? 'es' : 'en' }));
}));

app.post('/for-venues', form, page(async (req, res) => {
  const b = req.body || {};
  const lang = b.lang === 'es' ? 'es' : 'en';
  const t = pitch.T[lang];
  const needs = [].concat(b.needs || []).filter((x) => Object.keys(t.needs).includes(x));
  const values = {
    name: String(b.name || '').trim().slice(0, 80), venue: String(b.venue || '').trim().slice(0, 80),
    type: Object.keys(t.types).includes(b.type) ? b.type : 'other', contact: String(b.contact || '').trim().slice(0, 120),
    needs, message: String(b.message || '').trim().slice(0, 1000)
  };
  if (b.website) return res.send(pitch.pitchPage({ lang, sent: true }));
  if (limited('lead:' + req.ip, 5, 10 * 60 * 1000)) return res.status(429).send(pitch.pitchPage({ lang, error: 'Too many tries. Please wait a few minutes.', values }));
  if (!values.name || !values.contact) return res.status(400).send(pitch.pitchPage({ lang, error: t.errName, values }));
  if (b.consent !== '1') return res.status(400).send(pitch.pitchPage({ lang, error: t.errConsent, values }));
  await store.addLead({ ...values, needs: needs.join(', '), lang });
  console.log(JSON.stringify({ level: 'INFO', message: `New lead: ${values.name} (${values.venue || values.type})`, timestamp: new Date().toISOString() }));
  res.send(pitch.pitchPage({ lang, sent: true }));
}));

function leadsAllowed(req) { return LEADS_PASSWORD && readCookie(req, 'vfd_leads') === sign('leads:' + LEADS_PASSWORD); }

app.get('/leads', page(async (req, res) => {
  res.set('X-Robots-Tag', 'noindex');
  if (!LEADS_PASSWORD) return res.status(503).send(pitch.leadsPage({ error: 'Set LEADS_PASSWORD on the server to open this page.' }));
  res.send(pitch.leadsPage({ leads: leadsAllowed(req) ? await store.listLeads() : null }));
}));

app.post('/leads', form, page(async (req, res) => {
  if (!LEADS_PASSWORD) return res.status(503).send(pitch.leadsPage({ error: 'Set LEADS_PASSWORD on the server to open this page.' }));
  if (limited('leadslogin:' + req.ip, 8, 10 * 60 * 1000)) return res.status(429).send(pitch.leadsPage({ error: 'Too many tries. Wait a few minutes.' }));
  const given = Buffer.from(String((req.body || {}).password || ''));
  const want = Buffer.from(LEADS_PASSWORD);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).send(pitch.leadsPage({ error: 'Wrong password' }));
  res.set('Set-Cookie', `vfd_leads=${sign('leads:' + LEADS_PASSWORD)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 86400}${SECURE}`);
  res.redirect(303, '/leads');
}));

app.get('/leads.csv', page(async (req, res) => {
  if (!leadsAllowed(req)) return res.status(401).send('Log in at /leads first');
  const rows = await store.listLeads();
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="venue-leads.csv"');
  res.send(['date,name,venue,type,contact,needs,message,lang', ...rows.map((l) => [String(l.created_at).slice(0, 16), l.name, l.venue, l.type, l.contact, l.needs, l.message, l.lang].map(cell).join(','))].join('\n'));
}));

// ---------- the Circle ----------

function setCircleCookie(res, token) {
  res.append('Set-Cookie', `vfd_circle=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${400 * 86400}${SECURE}`);
}

app.get('/circle', page(async (req, res) => {
  countVisit(req);
  const ctx = await context(req, { res });
  if (!ctx.state.venue.modules.circle) return res.status(404).send(render.notFoundPage(ctx));
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
  const ctx = await context(req, { res });
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

// The Ibiza Playbook reads every venue's listings from here. In the demo that
// is the four sample venues; for a real venue, just its own.
async function ownFeed(req) {
  const { data } = await store.getState();
  const states = DEMO ? Object.keys(SAMPLES).map((key) => ({ key, state: overlay(data, key) })) : [{ key: null, state: data }];
  return buildFeed({ states, base: baseUrl(req) });
}
app.get('/api/playbook.json', page(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.json(await ownFeed(req));
}));
// What the guide page reads: this feed plus every client venue's feed
// (playbook-feeds.json), merged. Client feeds stay their own source of truth.
// Guests (?guest=1 or the guest address) never see the demo's sample venues.
app.get('/api/playbook-guide.json', page(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const own = await ownFeed(req);
  const guest = req.guest || req.query.guest === '1';
  const extra = listed.toVenues(await store.listListed(), own.today);
  res.json(await guideFeed({ own: guest && DEMO ? { ...own, venues: [] } : own, ownBase: baseUrl(req), listed: extra }));
}));

// The free Listed tier: venues send what's on, Christopher checks it, then it shows.
const todayHere = () => serviceDate(localNow('Europe/Madrid'));
app.get('/playbook/add', (req, res) => { res.set('Cache-Control', 'no-store').send(listed.formPage({ today: todayHere() })); });
app.post('/playbook/add', form, page(async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.send(listed.thanksPage()); // filled by bots only
  if (limited('listed:' + req.ip, 6, 60 * 60 * 1000)) return res.status(429).send(listed.formPage({ today: todayHere(), values: b, errors: [] }).replace('<form', '<div class="box"><b>Demasiados envíos. Prueba en una hora. / Too many sends. Try again in an hour.</b></div><form'));
  const { values, errors } = listed.validate(b, todayHere());
  if (errors.length) return res.status(400).send(listed.formPage({ today: todayHere(), values, errors }));
  await store.addListed(values);
  console.log(JSON.stringify({ level: 'INFO', message: `New Playbook listing waiting: ${values.venue} (${values.title})`, timestamp: new Date().toISOString() }));
  res.send(listed.thanksPage());
}));
app.get('/playbook/listed', page(async (req, res) => {
  res.set('X-Robots-Tag', 'noindex').set('Cache-Control', 'no-store');
  const allowed = leadsAllowed(req);
  res.send(listed.adminPage({ allowed, rows: allowed ? await store.listListed() : [] }));
}));
app.post('/playbook/listed/:id', form, page(async (req, res) => {
  if (!leadsAllowed(req)) return res.status(401).send(listed.adminPage({ allowed: false }));
  const status = String((req.body || {}).status);
  if (!['live', 'hidden', 'deleted'].includes(status)) return res.status(400).send('Unknown status');
  await store.setListedStatus(Number(req.params.id), status);
  res.redirect(303, '/playbook/listed');
}));
app.get('/playbook', (req, res) => { res.set('Cache-Control', 'no-store').type('html').send(playbookPage(req.guest || req.query.guest === '1')); });

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

// Table plan: each booking from today on gets its table in words, what the
// manager must do (join or split), and the free tables it could move to.
function withTables(state, rows, today) {
  const settings = R.tableSettings(state);
  if (!TP.planOn(settings)) return rows;
  const plan = TP.planOf(settings);
  const byDate = {};
  for (const r of rows) (byDate[r.date] = byDate[r.date] || []).push(r);
  return rows.map((r) => {
    if (r.date < today || !R.HOLDS.includes(r.status)) return { ...r, table_label: r.table_ref ? TP.label(plan, r.table_ref) : null };
    const day = byDate[r.date];
    const given = r.table_ref ? null : TP.occupancy(plan, day).placed.get(r.id);
    return {
      ...r,
      table_label: r.table_ref ? TP.label(plan, r.table_ref) : given ? TP.label(plan, given.option.ref) + ' (suggested)' : 'No table yet',
      table_todo: TP.action(plan, r.table_ref || (given && given.option.ref)),
      table_missing: !r.table_ref,
      moves: TP.movesFor(plan, day, r).map((ref) => ({ ref, label: TP.label(plan, ref) }))
    };
  });
}

// When the table plan is switched on, bookings already taken get a table, oldest first.
async function placeWaiting(state) {
  const settings = R.tableSettings(state);
  if (!TP.planOn(settings)) return;
  const plan = TP.planOf(settings);
  const today = localNow(state.venue.timezone).date;
  const waiting = (await store.listReservations(today)).filter((r) => !r.table_ref && R.HOLDS.includes(r.status));
  for (const r of waiting) {
    await store.setReservationTable(r.id, (rows, b) => {
      if (b.table_ref) return null;
      const o = TP.place(plan, rows.filter((x) => x.id !== b.id), b.time, b.guests);
      return o ? o.ref : null;
    });
  }
}

app.get('/api/admin/state', requireAdmin, page(async (req, res) => {
  let [{ data, version }, changes, enquiries, bookings, members, orders] = await Promise.all([
    store.getState(), store.listChanges(10), store.listEnquiries(100), store.listBookings(500), store.listMembers(1000), store.listOrders(300)
  ]);
  const localToday = localNow(data.venue.timezone).date;
  const reservations = withTables(data, await store.listReservations(addDays(localToday, -1)), localToday);
  const schedule = buildSchedule(data, new Date(), { editor: true });
  const poIds = (data.preorders || []).map((x) => x.id).concat('collect');
  orders = orders.filter((o) => poIds.includes(o.preorder_id));
  const views = await store.listViews(addDays(schedule.today, -30));
  const counts = await store.bookedCounts();
  res.json({
    state: data, version, schedule, status: openStatus(data), menus: menusNow(data), labels: labels(data),
    changes, enquiries, bookings, members, counts, orders, prep: prepList(orders.filter((o) => o.preorder_id !== 'collect'), schedule.today), preorders: preordersNow(data),
    reservations, localToday, tables: R.tableSettings(data), tablesOn: R.tablesOn(data), planOn: TP.planOn(R.tableSettings(data)), holdChoices: TP.HOLD_CHOICES, collect: R.collectSettings(data), alerts: { to: notify.alertAddress(data), mailbox: notify.configured() },
    stats: buildStats({ state: data, schedule, bookings, members, views, enquiries, orders }),
    baseUrl: baseUrl(req), demo: DEMO, offers: offersNow(data),
    catalog: { modules: MODULES, sections: SECTIONS, presets: PRESETS }
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
    if (saved && action.type === 'tables.save') await placeWaiting(result.state);
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

// What's waiting, checked by the open editor every 20 seconds so it can ring.
app.get('/api/admin/pulse', requireAdmin, page(async (req, res) => {
  const { data } = await store.getState();
  const local = localNow(data.venue.timezone);
  const today = local.date;
  const orderDay = serviceDate(local);
  const [enquiries, orders, reservations] = await Promise.all([store.listEnquiries(100), store.listOrders(300), store.listReservations(today)]);
  const poIds = (data.preorders || []).map((x) => x.id).concat('collect');
  const waiting = enquiries.filter((e) => e.status === 'new').length +
    orders.filter((o) => o.status === 'new' && o.date >= orderDay && poIds.includes(o.preorder_id)).length +
    reservations.filter((r) => r.status === 'pending').length;
  const newest = Math.max(0, ...enquiries.map((e) => e.id)) + '-' + Math.max(0, ...orders.map((o) => o.id)) + '-' + Math.max(0, ...reservations.map((r) => r.id));
  res.set('Cache-Control', 'no-store').json({ waiting, newest });
}));

app.patch('/api/admin/reservations/:id', requireAdmin, express.json({ limit: '4kb' }), page(async (req, res) => {
  const status = (req.body || {}).status;
  if (!R.RES_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const r = await store.getReservation(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Booking not found' });
  const { data } = await store.getState();
  // Confirming a declined or cancelled booking takes a place again: the store checks there is one.
  const st = R.tableSettings(data);
  const plan = TP.planOn(st) ? TP.planOf(st) : null;
  const takesPlace = R.HOLDS.includes(status) && !R.HOLDS.includes(r.status);
  // With a table plan, a booking that takes a place again keeps its table if it is still free, or gets the best free one.
  const check = !takesPlace ? null : plan ? (rows, b) => {
    if (b.table_ref && TP.canTake(plan, rows, b, b.table_ref)) return { table_ref: b.table_ref };
    const o = TP.place(plan, rows, b.time, b.guests);
    return o ? { table_ref: o.ref } : { full: true };
  } : st.covers;
  const done = await store.setReservationStatus(r.id, status, check);
  if (done && done.full) return res.status(409).json({ error: plan ? `No table is free for ${r.guests} at ${r.time} now. Move or cancel another booking first, or ask the guest to pick another time.` : `${r.time} is full now. Cancel another booking first, or ask the guest to pick another time.` });
  const when = `${formatDate(r.date)} at ${r.time}`;
  const v = data.venue.name;
  const words = {
    confirmed: ['your table is confirmed', `your table for ${r.guests} at ${v} is confirmed for ${when}. See you then!`],
    declined: ['about your booking', `sorry, we can't take your booking for ${r.guests} at ${v} on ${when}. Reply and we'll find another time.`],
    cancelled: ['your booking is cancelled', `your booking for ${r.guests} at ${v} on ${when} is cancelled.`]
  }[status];
  if (words && r.status !== status) notify.guestEmail(data, r.contact, words[0], [`Hello, ${words[1]}`]);
  res.json({ ok: true, whatsapp: words ? R.whatsappLink(r.contact, `Hi ${r.name}, ${words[1]}`) : null, emailed: Boolean(words && R.looksLikeEmail(r.contact) && notify.configured() && !DEMO), todo: plan && done && done.table_ref ? TP.action(plan, done.table_ref) : '' });
}));

// Table plan: move a booking to another free table.
app.patch('/api/admin/reservations/:id/table', requireAdmin, express.json({ limit: '4kb' }), page(async (req, res) => {
  const ref = String((req.body || {}).table || '').slice(0, 40);
  const { data } = await store.getState();
  const st = R.tableSettings(data);
  if (!TP.planOn(st)) return res.status(400).json({ error: 'The table plan is off' });
  const plan = TP.planOf(st);
  const done = await store.setReservationTable(Number(req.params.id), (rows, b) => (R.HOLDS.includes(b.status) && TP.canTake(plan, rows, b, ref) ? ref : null));
  if (done.missing) return res.status(404).json({ error: 'Booking not found' });
  if (done.taken) return res.status(409).json({ error: `${TP.label(plan, ref)} is not free for that booking. Pick another.` });
  res.json({ ok: true, label: TP.label(plan, ref), todo: TP.action(plan, ref) });
}));

// A booking taken by phone or at the door, so it counts against the covers.
app.post('/api/admin/reservations', requireAdmin, express.json({ limit: '4kb' }), page(async (req, res) => {
  const b = req.body || {};
  const { data } = await store.getState();
  const st = R.tableSettings(data);
  const r = { date: String(b.date || ''), time: String(b.time || ''), guests: parseInt(b.guests, 10) || 0, name: String(b.name || '').trim().slice(0, 80), contact: String(b.contact || '').trim().slice(0, 120), note: String(b.note || '').trim().slice(0, 300), status: 'confirmed', source: 'phone' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date < localNow(data.venue.timezone).date) return res.status(400).json({ error: 'Pick today or a later day' });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) return res.status(400).json({ error: 'Time must look like 20:30' });
  if (!(r.guests >= 1 && r.guests <= 500)) return res.status(400).json({ error: 'Guests must be between 1 and 500' });
  if (!r.name) return res.status(400).json({ error: 'Add the guest name' });
  if (!r.contact) r.contact = '-';
  const plan = TP.planOn(st) ? TP.planOf(st) : null;
  const result = await store.addReservation(r, plan ? planCheck(plan, r.time, r.guests, { force: Boolean(b.force) }) : b.force ? 100000 : st.covers);
  if (result.full) return res.status(409).json({ error: plan ? `No table free for ${r.guests} at ${r.time}${result.left ? ` (the biggest free seats ${result.left})` : ''}.` : `Only ${result.left} ${result.left === 1 ? 'place' : 'places'} left at ${r.time}.`, full: true });
  res.json({ ok: true, id: result.id, table: plan ? TP.label(plan, result.table_ref) : null, todo: plan ? TP.action(plan, result.table_ref) : '' });
}));

app.patch('/api/admin/orders/:id', requireAdmin, express.json({ limit: '4kb' }), page(async (req, res) => {
  const status = (req.body || {}).status;
  if (!['new', 'ready', 'collected', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Unknown status' });
  await store.setOrderStatus(Number(req.params.id), status);
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

app.use(page(async (req, res) => res.status(404).send(render.notFoundPage(await context(req, { res })))));

module.exports = { app, store, PORT, DEMO };
