'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.DATA_FILE = path.join(os.tmpdir(), `vfd-test-${process.pid}.json`);
process.env.ADMIN_PASSWORD = 'test-pass';
process.env.LEADS_PASSWORD = 'leads-pass';
process.env.DEMO_MODE = '1';
process.env.ALERT_EMAIL = 'alerts@example.com';
delete process.env.DB_NAME;

const { app } = require('../app');
const notify = require('../lib/notify');

let server, base;
test.before(async () => {
  await new Promise((r) => setTimeout(r, 50));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function login() {
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-pass' }) });
  assert.strictEqual(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

test('public pages render with structured data', async () => {
  for (const p of ['/', '/whats-on', '/menu', '/book', '/circle', '/about', '/visit']) {
    const r = await fetch(base + p);
    assert.strictEqual(r.status, 200, p);
    const html = await r.text();
    assert.match(html, /application\/ld\+json/, p);
  }
});

test('editor needs a login', async () => {
  const r = await fetch(base + '/api/admin/state');
  assert.strictEqual(r.status, 401);
  const bad = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'nope' }) });
  assert.strictEqual(bad.status, 401);
});

test('one change shows up on the live site and bumps the version', async () => {
  const cookie = await login();
  const before = (await (await fetch(base + '/api/version')).json()).version;
  const st = await (await fetch(base + '/api/admin/state', { headers: { cookie } })).json();
  const m = st.state.menus.find((x) => x.name === 'Drinks');
  const item = m.sections[0].items[0];
  const r = await fetch(base + '/api/admin/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ action: { type: 'item.soldout', payload: { menuId: m.id, sectionId: m.sections[0].id, id: item.id, soldOut: true } } })
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await (await fetch(base + '/api/version')).json()).version, before + 1);
  const menu = await (await fetch(base + '/menu')).text();
  assert.match(menu, new RegExp(`dish sold[\\s\\S]*${item.name}`));
});

test('event bookings respect capacity', async () => {
  const cookie = await login();
  const st = await (await fetch(base + '/api/admin/state', { headers: { cookie } })).json();
  const quiz = st.schedule.upcoming.find((o) => o.eventId === 'ev-quiz');
  const book = (guests, name) => fetch(base + '/event/' + encodeURIComponent(quiz.key), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `name=${name}&contact=x%40example.com&guests=${guests}&src=instagram` });
  const taken = (st.counts[quiz.key] || {}).guests || 0;
  const left = quiz.capacity - taken;
  const ok = await book(left, 'Team');
  assert.strictEqual(ok.status, 200);
  assert.match(await ok.text(), /You're booked/);
  const full = await book(1, 'Late');
  assert.strictEqual(full.status, 409);
});

test('joining the Circle unlocks Circle-first events', async () => {
  const before = await (await fetch(base + '/whats-on')).text();
  assert.doesNotMatch(before, /Supper Club/);
  const r = await fetch(base + '/circle', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=Bea&email=bea%40example.com&consent=1&src=home' });
  assert.strictEqual(r.status, 303);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const after = await (await fetch(base + '/whats-on', { headers: { cookie } })).text();
  assert.match(after, /Supper Club/);
});

test('table enquiries are stored with their source', async () => {
  const r = await fetch(base + '/book', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'type=table&name=Ana&contact=ana%40example.com&guests=4&src=google' });
  assert.match(await r.text(), /Thanks, we have it/);
  const cookie = await login();
  const st = await (await fetch(base + '/api/admin/state', { headers: { cookie } })).json();
  assert.strictEqual(st.enquiries[0].name, 'Ana');
  assert.strictEqual(st.enquiries[0].source, 'google');
  assert.ok(st.stats.headline.members >= 12);
});

test('a café hides events but keeps menu, about and visit', async () => {
  const cookie = await login();
  const post = (type, payload) => fetch(base + '/api/admin/action', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ action: { type, payload } }) });
  assert.strictEqual((await post('preset.set', { type: 'cafe' })).status, 200);
  assert.strictEqual((await fetch(base + '/whats-on')).status, 404);
  const home = await (await fetch(base + '/')).text();
  assert.match(home, /See the menu/);
  assert.match(home, /Good to know/);
  assert.doesNotMatch(home, /Coming up/);
  assert.strictEqual((await fetch(base + '/about')).status, 200);
  await post('preset.set', { type: 'restaurant' });
});

test('the Pulse page takes a lead and the leads page is private', async () => {
  for (const q of ['', '?lang=es']) assert.strictEqual((await fetch(base + '/for-venues' + q)).status, 200);
  const r = await fetch(base + '/for-venues', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'lang=en&name=Sam&venue=Sol&type=cafe&contact=sam%40example.com&needs=menus&needs=social&consent=1' });
  assert.match(await r.text(), /be in touch/);
  const locked = await (await fetch(base + '/leads')).text();
  assert.doesNotMatch(locked, /Sam/);
  assert.strictEqual((await fetch(base + '/leads.csv')).status, 401);
});

test('the four sample venues each show their own content', async () => {
  const cafe = await fetch(base + '/?sample=cafe');
  const html = await cafe.text();
  assert.match(html, /<a class="logo" href="\/">Sol</);
  assert.doesNotMatch(html, /Coming up/);
  const cookie = cafe.headers.get('set-cookie') ? cafe.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') : '';
  const menu = await (await fetch(base + '/menu', { headers: { cookie } })).text();
  assert.match(menu, /Coffee and cakes/);
  const bar = await (await fetch(base + '/?sample=bar')).text();
  assert.match(bar, /Lunar/);
  assert.match(bar, /Coming up/);
  const beach = await (await fetch(base + '/?sample=beach')).text();
  assert.match(beach, /Cala Blanca/);
});

test('pre-orders take an order, respect limits and reach the kitchen list', async () => {
  const page = await fetch(base + '/order/po-roast?sample=restaurant');
  assert.strictEqual(page.status, 200);
  const html = await page.text();
  assert.match(html, /Sunday roast/);
  const date = /name="date" value="(\d{4}-\d{2}-\d{2})"/.exec(html)[1];
  const post = (fields) => fetch(base + '/order/po-roast', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ date, slot: '13:30', mode: 'takeaway', name: 'Test', contact: 'test@example.com', ...fields }) });
  const ok = await post({ 'qty_pr-beef': '2', 'qty_pr-pud': '1', src: 'whatsapp' });
  assert.strictEqual(ok.status, 200);
  assert.match(await ok.text(), /Order in, Test[\s\S]*€55/);
  const none = await post({});
  assert.strictEqual(none.status, 400);
  const tooMany = await post({ 'qty_pr-nut': '13' });
  assert.strictEqual(tooMany.status, 409);
  const cookie = await login();
  const st = await (await fetch(base + '/api/admin/state', { headers: { cookie } })).json();
  const mine = st.orders.find((o) => o.name === 'Test');
  assert.ok(mine && mine.source === 'whatsapp');
  const g = st.prep.find((x) => x.date === date);
  assert.ok(g.items['Roast beef'] >= 2);
  const r = await fetch(base + '/api/admin/orders/' + mine.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ status: 'ready' }) });
  assert.strictEqual(r.status, 200);
});

test('the café sample has weekend bakes to collect', async () => {
  const r = await fetch(base + '/order/po-bakes?sample=cafe');
  assert.strictEqual(r.status, 200);
  const html = await r.text();
  assert.match(html, /Weekend bakes/);
  assert.match(html, /Collect between/);
});

test('the Ibiza Playbook reads live listings from the venue platform', async () => {
  const feed = await (await fetch(base + '/api/playbook.json')).json();
  assert.strictEqual(feed.venues.length, 4);
  const marea = feed.venues.find((v) => v.name === 'Marea');
  assert.strictEqual(marea.area, 'Sant Antoni');
  assert.ok(feed.venues.every((v) => Array.isArray(v.listings)));
  const cafe = feed.venues.find((v) => v.name === 'Sol');
  assert.ok(cafe.listings.some((l) => l.tags.includes('food')));
  const page = await fetch(base + '/playbook');
  assert.strictEqual(page.status, 200);
  assert.match(await page.text(), /Ibiza <span>Playbook/);
  const home = await (await fetch(base + '/')).text();
  assert.match(home, /Find us on the Ibiza Playbook/);
});

test('a venue can keep its own booking system', async () => {
  const cookie = await login();
  const r = await fetch(base + '/api/admin/action', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ action: { type: 'links.save', payload: { bookingUrl: 'https://booking.example.com/marea', bookingName: 'CoverManager' } } }) });
  assert.strictEqual(r.status, 200);
  const page = await (await fetch(base + '/book?sample=restaurant')).text();
  assert.match(page, /Book a table<\/b> on CoverManager/);
  assert.match(page, /https:\/\/booking\.example\.com\/marea/);
  const bad = await fetch(base + '/api/admin/action', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ action: { type: 'links.save', payload: { bookingUrl: 'http://insecure.example.com' } } }) });
  assert.strictEqual(bad.status, 400);
});

test('menus and what\'s on can be embedded in an existing website', async () => {
  const r = await fetch(base + '/menu?sample=restaurant&embed=1');
  assert.strictEqual(r.status, 200);
  const html = await r.text();
  assert.match(html, /class="embedded"/);
  assert.doesNotMatch(html, /class="masthead"/);
  assert.match(html, /<base target="_blank">/);
  const book = await (await fetch(base + '/book?sample=beach')).text();
  assert.match(book, /Book a table<\/b> on our booking system/);
});

test('the Playbook guide merges client venue feeds and skips one that is down', async () => {
  const { guideFeed, _cache } = require('../lib/playbook');
  _cache.clear();
  const own = await (await fetch(base + '/api/playbook.json')).json();
  const client = { today: own.today, localTime: own.localTime, venues: [{ key: 'venue', name: 'Can Real', area: 'Ibiza Town', kind: 'Bar', url: 'https://canreal.example/', listings: [{ id: 'venue:dj', kind: 'event', date: own.today, start: 1260, end: 1500, title: 'DJ night', what: '', tags: ['dj'], action: { label: 'See it', href: 'https://canreal.example/' } }] }] };
  const fetcher = async (u) => {
    if (u.startsWith('https://canreal.example')) return { ok: true, json: async () => client };
    if (u.startsWith('https://dup.example')) return { ok: true, json: async () => ({ ...client }) };
    throw new Error('connection refused');
  };
  const g = await guideFeed({ own, ownBase: base, feeds: ['https://canreal.example/api/playbook.json', 'https://dup.example/api/playbook.json', 'https://down.example/api/playbook.json', base + '/api/playbook.json'], fetcher });
  assert.strictEqual(g.venues.length, 5); // 4 samples + Can Real once, own feed not read twice
  const real = g.venues.find((v) => v.name === 'Can Real');
  assert.strictEqual(real.listings[0].id, 'canreal.example/venue:dj');
  assert.deepStrictEqual(g.sources.map((s) => s.ok), [true, true, true, false]);
  const r = await fetch(base + '/api/playbook-guide.json');
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).venues.length, 4);
});

test('ibizaplaybook.com shows only the guest guide, never the sample venues', async () => {
  const h = { headers: { 'x-forwarded-host': 'ibizaplaybook.com' }, redirect: 'manual' };
  const home = await fetch(base + '/', h);
  assert.strictEqual(home.status, 200);
  const html = await home.text();
  assert.match(html, /<html lang="es" data-guest>/);
  assert.match(html, /MUY PRONTO/);
  const www = await (await fetch(base + '/', { headers: { 'x-forwarded-host': 'www.ibizaplaybook.com' } })).text();
  assert.match(www, /data-guest/);
  const feed = await (await fetch(base + '/api/playbook-guide.json', h)).json();
  assert.strictEqual(feed.venues.length, 0);
  const menu = await fetch(base + '/menu?sample=cafe', h);
  assert.strictEqual(menu.status, 302);
  assert.match(menu.headers.get('location'), /venue\.foodforthought\.agency\/menu\?sample=cafe$/);
  const demo = await (await fetch(base + '/playbook')).text();
  assert.match(demo, /<html lang="en">/);
  assert.strictEqual((await (await fetch(base + '/api/playbook-guide.json')).json()).venues.length, 4);
});

test('a venue sends a free listing; it shows as Listed only after it is checked', async () => {
  const feed0 = await (await fetch(base + '/api/playbook-guide.json')).json();
  const today = feed0.today;
  const bad = await fetch(base + '/playbook/add', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'venue=X' });
  assert.strictEqual(bad.status, 400);
  assert.match(await bad.text(), /Revisa los campos marcados/);
  const body = new URLSearchParams({ venue: 'Bar Tardeo', area: 'Ibiza Town', kind: 'Bar', title: 'Tardeo con DJ', what: 'Paella y DJ', date: today, start: '17:00', end: '23:30', link: 'https://instagram.com/bartardeo', contact: 'hola@bartardeo.example' });
  body.append('tags', 'dj'); body.append('tags', 'food');
  const ok = await fetch(base + '/playbook/add', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  assert.strictEqual(ok.status, 200);
  assert.match(await ok.text(), /Gracias/);
  const guestFeed = async () => (await fetch(base + '/api/playbook-guide.json', { headers: { 'x-forwarded-host': 'ibizaplaybook.com' } })).json();
  assert.strictEqual((await guestFeed()).venues.length, 0, 'waiting listings never show');
  // log in with the leads password, then show it
  const login = await fetch(base + '/leads', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=leads-pass', redirect: 'manual' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const admin = await (await fetch(base + '/playbook/listed', { headers: { cookie } })).text();
  assert.match(admin, /Bar Tardeo: Tardeo con DJ/);
  assert.match(admin, /hola@bartardeo\.example/);
  const id = admin.match(/\/playbook\/listed\/(\d+)/)[1];
  const noAuth = await fetch(base + `/playbook/listed/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'status=live' });
  assert.strictEqual(noAuth.status, 401);
  await fetch(base + `/playbook/listed/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie }, body: 'status=live', redirect: 'manual' });
  const g = await guestFeed();
  assert.strictEqual(g.venues.length, 1);
  const v = g.venues[0];
  assert.ok(v.listed);
  assert.strictEqual(JSON.stringify(v).includes('hola@'), false, 'contact is never published');
  assert.deepStrictEqual(v.listings[0].tags.sort(), ['dj', 'food']);
  // the demo guide shows it after the four verified sample venues
  const demo = await (await fetch(base + '/api/playbook-guide.json')).json();
  assert.strictEqual(demo.venues.length, 5);
  assert.strictEqual(demo.venues.at(-1).name, 'Bar Tardeo');
  const form = await fetch(base + '/playbook/add', { headers: { 'x-forwarded-host': 'ibizaplaybook.com' }, redirect: 'manual' });
  assert.strictEqual(form.status, 200);
});

test('weekly Listed entries run on the same weekday for eight weeks', () => {
  const { runsOn } = require('../lib/listed');
  const l = { weekly: true, date: '2026-11-21' };
  assert.ok(runsOn(l, '2026-11-28'));
  assert.ok(!runsOn(l, '2026-11-27'));
  assert.ok(!runsOn(l, '2027-01-16'));
  assert.ok(runsOn({ weekly: false, date: '2026-11-21' }, '2026-11-21'));
});

test('Listed: a food offer on its own, a night on its own, or both', () => {
  const { validate, typeOf, toVenues, repeatLabel } = require('../lib/listed');
  const base = { venue: 'Can Prova', area: 'Sant Antoni', kind: 'Restaurant', date: '2026-11-23', start: '13:00', end: '16:00', contact: 'hola@prova.example' };
  // a menú del día: food only, Monday to Friday, until a date, with a price; no music needed
  const food = validate({ ...base, type: 'food', title: 'Menú del día', price: '15 €', days: ['1', '2', '3', '4', '5'], until: '2026-12-18' }, '2026-11-20');
  assert.deepStrictEqual(food.errors, []);
  assert.deepStrictEqual(food.values.tags, ['food']);
  assert.strictEqual(repeatLabel(food.values), 'Mon to Fri until 18 Dec');
  // a night with no food
  const night = validate({ ...base, type: 'night', title: 'DJ', tags: ['dj'] }, '2026-11-20');
  assert.deepStrictEqual(night.errors, []);
  assert.strictEqual(typeOf(night.values), 'night');
  assert.deepStrictEqual(validate({ ...base, type: 'night', title: 'DJ' }, '2026-11-20').errors, ['tags'], 'a night still says what guests get');
  // end date before the first day, or no ticked day inside the run, is refused
  assert.ok(validate({ ...base, type: 'food', title: 'Menú', days: ['1'], until: '2026-11-22' }, '2026-11-20').errors.includes('until'));
  assert.ok(validate({ ...base, type: 'food', title: 'Menú', days: ['6'], until: '2026-11-24' }, '2026-11-20').errors.includes('until'));
  assert.ok(validate({ ...base, type: 'food', title: 'Menú', days: ['1'], until: '2027-03-01' }, '2026-11-20').errors.includes('until'));
  // entries sent before the type existed are read from their tags
  assert.strictEqual(typeOf({ tags: ['food', 'dj'] }), 'both');
  assert.strictEqual(typeOf({ tags: ['food'] }), 'food');
  // in the guide: runs on weekdays only, carries type, price and how it repeats
  const rows = [{ id: 7, status: 'live', data: food.values }];
  assert.strictEqual(toVenues(rows, '2026-11-21').length, 0, 'not on Saturday or Sunday');
  const l = toVenues(rows, '2026-11-23')[0].listings[0];
  assert.strictEqual(l.type, 'food'); assert.strictEqual(l.price, '15 €'); assert.strictEqual(l.runs, 'Mon to Fri until 18 Dec');
  assert.strictEqual(toVenues(rows, '2026-12-21').length, 0, 'gone after the end date');
});

test('Verified listings say whether they are food, a night or both', async () => {
  const feed = await (await fetch(base + '/api/playbook.json')).json();
  const all = feed.venues.flatMap((v) => v.listings);
  assert.ok(all.length);
  for (const l of all) assert.ok(['food', 'night', 'both'].includes(l.type), l.id);
  for (const l of all.filter((x) => x.kind === 'menu' || x.kind === 'preorder')) assert.strictEqual(l.type, 'food');
});

let cached = null;
async function session() { return cached || (cached = await login()); }
async function adminAction(cookie, type, payload) {
  const r = await fetch(base + '/api/admin/action', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ action: { type, payload } }) });
  return { status: r.status, body: await r.json() };
}
const post = (url, data) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() });

test('a guest books a table and it is confirmed straight away', async () => {
  const cookie = await session();
  await adminAction(cookie, 'links.save', { bookingUrl: '', bookingName: '' });
  assert.strictEqual((await adminAction(cookie, 'tables.save', { times: '13:00 13:30 20:00 20:30', covers: 4, maxParty: 4, notice: 0, daysAhead: 30, mode: 'auto' })).status, 200);
  const page = await (await fetch(base + '/book')).text();
  assert.match(page, /Book the table/);
  const date = /<option value="(\d{4}-\d{2}-\d{2})" selected>/.exec(page)[1];
  const time = /name="time" value="(\d\d:\d\d)"\s+checked/.exec(page)[1];
  const before = notify.sent.length;
  const r = await post('/book/table', { date, time, guests: '3', name: 'Ana', contact: 'ana@example.com', note: 'Window please' });
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Booked, Ana\./);
  assert.ok(notify.sent.length > before, 'the venue gets an alert');
  assert.match(notify.sent[notify.sent.length - 1].subject, /New booking: 3 at/);
  // Only one place left at that time now.
  const full = await post('/book/table', { date, time, guests: '2', name: 'Ben', contact: '+34 600 111 222' });
  assert.strictEqual(full.status, 409);
  assert.match(await full.text(), /Only 1 place left/);
  const tooBig = await post('/book/table', { date, time, guests: '9', name: 'Big', contact: '600111222' });
  assert.strictEqual(tooBig.status, 400);
});

test('with manual confirming, the venue confirms and the guest gets a WhatsApp message ready', async () => {
  const cookie = await session();
  await adminAction(cookie, 'tables.save', { times: '13:00 13:30 20:00 20:30', covers: 10, maxParty: 8, notice: 0, daysAhead: 30, mode: 'manual' });
  const page = await (await fetch(base + '/book')).text();
  assert.match(page, /Request this table/);
  const dates = [...page.matchAll(/<option value="(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
  const date = dates[dates.length - 1];
  const p2 = await (await fetch(base + '/book?date=' + date)).text();
  const time = /name="time" value="(\d\d:\d\d)"\s+checked/.exec(p2)[1];
  const r = await post('/book/table', { date, time, guests: '2', name: 'Carla', contact: '600 222 333' });
  assert.match(await r.text(), /will confirm by WhatsApp or phone/);
  const state = await (await fetch(base + '/api/admin/state', { headers: { cookie } })).json();
  const res = state.reservations.find((x) => x.name === 'Carla');
  assert.strictEqual(res.status, 'pending');
  const pulse = await (await fetch(base + '/api/admin/pulse', { headers: { cookie } })).json();
  assert.ok(pulse.waiting >= 1);
  const ok = await (await fetch(base + '/api/admin/reservations/' + res.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ status: 'confirmed' }) })).json();
  assert.ok(ok.ok);
  assert.match(ok.whatsapp, /^https:\/\/wa\.me\/34600222333\?text=/);
  const bad = await fetch(base + '/api/admin/reservations/' + res.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ status: 'eaten' }) });
  assert.strictEqual(bad.status, 400);
});

test('a guest orders ahead to collect and it lands in the orders inbox', async () => {
  const cookie = await session();
  await adminAction(cookie, 'hours.day', { mode: 'custom', slot: { open: '00:00', close: '23:59' } });
  assert.strictEqual((await adminAction(cookie, 'collect.save', { open: true, from: '00:00', to: '23:50', every: 10, notice: 0 })).status, 200);
  const page = await (await fetch(base + '/collect')).text();
  assert.match(page, /Order to collect/);
  const slot = /<select name="slot" required><option[^>]*>(\d\d:\d\d)</.exec(page);
  if (!slot) return assert.match(page, /closed/); // run in the last minutes of the day
  const item = [...page.matchAll(/name="qty_([\w-]+)" data-price="([\d.]+)"/g)].pop(); // the all-day drinks menu comes last
  const r = await post('/collect', { ['qty_' + item[1]]: '2', slot: slot[1], name: 'Dani', contact: '600333444' });
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Order in, Dani\./);
  const state = await (await fetch(base + '/api/admin/state', { headers: { cookie } })).json();
  const o = state.orders.find((x) => x.name === 'Dani');
  assert.strictEqual(o.preorder_id, 'collect');
  assert.strictEqual(o.total, Math.round(2 * Number(item[2]) * 100) / 100);
  const none = await post('/collect', { slot: slot[1], name: 'Eve', contact: '600' });
  assert.strictEqual(none.status, 400);
  await adminAction(cookie, 'collect.save', { open: false, from: '12:00', to: '22:00', every: 15, notice: 30 });
  assert.match(await (await fetch(base + '/collect')).text(), /not taking orders online/);
});

test('settings reject bad input', async () => {
  const cookie = await session();
  assert.strictEqual((await adminAction(cookie, 'tables.save', { times: '25:00', covers: 4, maxParty: 4, notice: 0, daysAhead: 30 })).status, 400);
  assert.strictEqual((await adminAction(cookie, 'alerts.save', { email: 'not-an-email' })).status, 400);
  assert.strictEqual((await adminAction(cookie, 'alerts.save', { email: 'kitchen@marea.example' })).status, 200);
});

test('table bookings stay off until the venue saves its own times', () => {
  const R = require('../lib/reservations');
  const state = { venue: { modules: { tables: true }, timezone: 'Europe/Madrid' }, links: {} };
  assert.strictEqual(R.tablesOn(state), false);
  assert.strictEqual(R.tablesOn({ ...state, tableBooking: { times: ['20:00'] } }), true);
  assert.strictEqual(R.tablesOn({ ...state, tableBooking: { times: ['20:00'] }, links: { bookingUrl: 'https://x.example' } }), false);
  assert.strictEqual(R.looksLikeEmail('"x"<victim@evil.example>'), false);
  assert.strictEqual(R.looksLikeEmail('ana@example.com'), true);
});

test('booking times after midnight are refused, phone bookings count against covers', async () => {
  const cookie = await session();
  const late = await adminAction(cookie, 'tables.save', { times: '22:00 00:30', covers: 4, maxParty: 4, notice: 0, daysAhead: 30, mode: 'auto' });
  assert.strictEqual(late.status, 400);
  assert.match(late.body.error, /after midnight/);
  await adminAction(cookie, 'tables.save', { times: '13:00 20:00', covers: 4, maxParty: 4, notice: 0, daysAhead: 30, mode: 'auto' });
  const state = await (await fetch(base + '/api/admin/state', { headers: { cookie } })).json();
  const date = require('../lib/time').addDays(state.localToday, 20);
  const add = (guests, force) => fetch(base + '/api/admin/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ date, time: '20:00', guests, name: 'Phone guest', force }) });
  assert.strictEqual((await add(3)).status, 200);
  assert.strictEqual((await add(2)).status, 409);
  assert.strictEqual((await add(2, true)).status, 200);
  const page = await (await fetch(base + '/book?date=' + date)).text();
  assert.match(page, /20:00 · full/);
});
