'use strict';

// Without DEMO_MODE a brand new store starts empty: no Marea sample.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_FILE = path.join(os.tmpdir(), `vfd-blank-${process.pid}.json`);
process.env.ADMIN_PASSWORD = 'test-pass';
delete process.env.DEMO_MODE;
delete process.env.DB_NAME;

const { app } = require('../app');

let server, base;
test.before(async () => {
  await new Promise((r) => setTimeout(r, 50));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); try { fs.unlinkSync(process.env.DATA_FILE); } catch {} });

test('no DEMO_MODE: a new store starts empty and every page still renders', async () => {
  for (const p of ['/', '/whats-on', '/menu', '/book', '/visit', '/about', '/circle', '/playbook', '/admin', '/api/playbook.json', '/api/playbook-guide.json']) {
    const r = await fetch(base + p);
    assert.strictEqual(r.status, 200, p);
    // /playbook and /admin are static pages; the rest are built from the store.
    if (!['/playbook', '/admin'].includes(p)) assert.doesNotMatch(await r.text(), /Marea|Dune|Kasper|Sunday roast/, p);
  }
  // An empty menu shows only the coming soon line: no diet filters, no allergies note.
  const menu = await (await fetch(base + '/menu')).text();
  assert.match(menu, /The menu is coming soon\./);
  assert.doesNotMatch(menu, /data-filter=|class="filters"|Allergies\?/);
  // No pre-orders yet, so /order is the normal "not found" page, not an error.
  assert.strictEqual((await fetch(base + '/order')).status, 404);
  const feed = await (await fetch(base + '/api/playbook.json')).json();
  assert.ok(feed.venues.every((v) => v.listings.length === 0));

  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-pass' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const st = await (await fetch(base + '/api/admin/state', { headers: { cookie } })).json();
  assert.strictEqual(st.state.venue.name, 'Your venue');
  for (const k of ['events', 'menus', 'stories', 'offers', 'gallery', 'preorders']) assert.deepStrictEqual(st.state[k], [], k);
  assert.deepStrictEqual(st.state.ledger, {});
  for (const k of ['bookings', 'members', 'enquiries', 'orders']) assert.deepStrictEqual(st[k], [], k);
});
