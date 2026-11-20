'use strict';

const test = require('node:test');
const assert = require('node:assert');
const TP = require('../lib/tableplan');

// Tables 1 (2), 2 (2), 3 (4), 4 (4), 5 (6, splits 4+2); 3 and 4 join to 8.
const plan = TP.planOf({ plan: { on: true, hold: 120, tables: [
  { name: '1', seats: 2 }, { name: '2', seats: 2 }, { name: '3', seats: 4 }, { name: '4', seats: 4 }, { name: '5', seats: 6, split: [4, 2] }
], joins: [['3', '4']] } });
let id = 0;
const row = (time, guests, table_ref = null, status = 'confirmed') => ({ id: ++id, time, guests, status, table_ref });

test('smallest whole table first', () => {
  assert.strictEqual(TP.place(plan, [], '20:00', 2).ref, '1');
  assert.strictEqual(TP.place(plan, [], '20:00', 3).ref, '3');
  assert.strictEqual(TP.place(plan, [], '20:00', 5).ref, '5');
  assert.strictEqual(TP.place(plan, [], '20:00', 7).ref, '3+4');
  assert.strictEqual(TP.place(plan, [], '20:00', 9), null);
});

test('a table is held for the sitting, not just its time', () => {
  const rows = [row('20:00', 2, '1'), row('20:00', 2, '2')];
  // 21:00 overlaps the 20:00 sittings, 22:00 does not
  assert.strictEqual(TP.place(plan, rows, '21:00', 2).ref, '3');
  assert.strictEqual(TP.place(plan, rows, '22:00', 2).ref, '1');
});

test('whole tables before splits; a split is used and named as a job when only half is free', () => {
  const rows = [row('20:00', 2, '1'), row('20:00', 2, '2'), row('20:00', 4, '3'), row('20:00', 4, '4')];
  // a free whole table comes before splitting one
  assert.strictEqual(TP.place(plan, rows, '20:30', 2).ref, '5');
  // half of 5 taken: the other half is still free, the whole table is not
  const rows2 = rows.concat(row('20:30', 4, '5/A'));
  const o = TP.place(plan, rows2, '20:30', 2);
  assert.strictEqual(o.ref, '5/B');
  assert.strictEqual(TP.action(plan, o.ref), 'split table 5');
  assert.strictEqual(TP.label(plan, o.ref), 'Table 5, 2 seat part');
  assert.strictEqual(TP.place(plan, rows2, '20:30', 3), null);
  assert.strictEqual(TP.action(plan, '3+4'), 'join tables 3 and 4');
  assert.strictEqual(TP.label(plan, '3+4'), 'Tables 3 + 4 joined');
  assert.strictEqual(TP.action(plan, '3'), '');
});

test('a join blocks both tables and a whole table blocks its join', () => {
  const rows = [row('20:00', 7, '3+4'), row('20:00', 6, '5')];
  assert.strictEqual(TP.place(plan, rows, '20:00', 4), null);
  const rows2 = [row('20:00', 4, '3')];
  assert.strictEqual(TP.place(plan, rows2, '20:00', 7), null);
});

test('biggest free party and the moves a booking can make', () => {
  const rows = [row('20:00', 6, '5'), row('20:00', 4, '3')];
  assert.strictEqual(TP.biggestFree(plan, rows, '20:00'), 4);
  const b = row('20:00', 2, '1');
  const moves = TP.movesFor(plan, rows.concat(b), b);
  assert.deepStrictEqual(moves, ['1', '2', '4']);
  assert.strictEqual(TP.canTake(plan, rows.concat(b), b, '3'), false);
});

test('bookings with no table still hold one, cancelled ones do not', () => {
  const rows = [row('20:00', 2), row('20:00', 2), row('20:00', 2, '3', 'cancelled')];
  const occ = TP.occupancy(plan, rows);
  assert.strictEqual(occ.placed.size, 2);
  assert.strictEqual(TP.place(plan, rows, '20:00', 2).ref, '3');
});

test('the editor input is checked', () => {
  const fail = (m) => { throw new Error(m); };
  const ok = TP.clean({ on: true, hold: 90, tables: [{ name: '1', seats: 2 }, { name: '5', seats: 6, split: '4+2' }, { name: '', seats: '' }], joins: '1+5' }, fail);
  assert.deepStrictEqual(ok, { on: true, hold: 90, tables: [{ name: '1', seats: 2, split: null }, { name: '5', seats: 6, split: [4, 2] }], joins: [['1', '5']] });
  assert.throws(() => TP.clean({ tables: [{ name: '5', seats: 6, split: '4+3' }] }, fail), /add up/);
  assert.throws(() => TP.clean({ tables: [{ name: '1', seats: 2 }, { name: '1', seats: 4 }] }, fail), /Two tables/);
  assert.throws(() => TP.clean({ tables: [{ name: '1', seats: 2 }], joins: '1+9' }, fail), /no table 9/);
  assert.throws(() => TP.clean({ tables: [{ name: '3+4', seats: 2 }] }, fail), /can't use/);
  assert.throws(() => TP.clean({ on: true, tables: [] }, fail), /at least one/);
  assert.strictEqual(TP.clean({ hold: 999, tables: [{ name: 'A', seats: 2 }] }, fail).hold, 120);
});
