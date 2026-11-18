'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.DATA_FILE = path.join(os.tmpdir(), `vfd-test-${process.pid}.json`);
process.env.ADMIN_PASSWORD = 'test-pass';
process.env.LEADS_PASSWORD = 'leads-pass';
process.env.DEMO_MODE = '1';
delete process.env.DB_NAME;

const { app } = require('../app');

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
