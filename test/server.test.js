'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.DATA_FILE = path.join(os.tmpdir(), `vfd-test-${process.pid}.json`);
process.env.ADMIN_PASSWORD = 'test-pass';
delete process.env.DB_NAME;

const { app } = require('../server');

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
  for (const p of ['/', '/whats-on', '/menu', '/book']) {
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
  const dish = st.state.menu[0];
  const r = await fetch(base + '/api/admin/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ action: { type: 'menu.soldout', payload: { id: dish.id, soldOut: true } } })
  });
  assert.strictEqual(r.status, 200);
  const after = (await (await fetch(base + '/api/version')).json()).version;
  assert.strictEqual(after, before + 1);
  const menu = await (await fetch(base + '/menu')).text();
  assert.match(menu, new RegExp(`dish sold[\\s\\S]*${dish.name}`));
});

test('booking form stores an enquiry with its source', async () => {
  const r = await fetch(base + '/book', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'type=table&name=Ana&contact=ana%40example.com&guests=4&src=instagram' });
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Thanks, we have it/);
  const cookie = await login();
  const st = await (await fetch(base + '/api/admin/state', { headers: { cookie } })).json();
  assert.strictEqual(st.enquiries[0].name, 'Ana');
  assert.strictEqual(st.enquiries[0].source, 'instagram');
});
