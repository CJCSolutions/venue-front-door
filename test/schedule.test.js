'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { occurrenceDates, buildSchedule, openStatus } = require('../lib/schedule');
const { applyAction } = require('../lib/actions');
const { seedState } = require('../lib/seed');

// 2026-11-20 is a Friday. 21:00 Madrid = 20:00 UTC.
const FRI_EVENING = new Date('2026-11-20T20:00:00Z');

test('weekly nights repeat and skip cancelled dates', () => {
  const night = { start: '2026-11-06', repeat: 'weekly', skipped: ['2026-11-27'] };
  assert.deepStrictEqual(occurrenceDates(night, '2026-11-01', '2026-12-10'), ['2026-11-06', '2026-11-13', '2026-11-20', '2026-12-04']);
});

test('monthly nights land on the same weekday of the month', () => {
  const night = { start: '2026-11-06', repeat: 'monthly' }; // first Friday
  assert.deepStrictEqual(occurrenceDates(night, '2026-11-01', '2027-01-31'), ['2026-11-06', '2026-12-04', '2027-01-01']);
});

test('a night after midnight still counts as the night before', () => {
  const state = seedState(FRI_EVENING);
  const at3am = buildSchedule(state, new Date('2026-11-21T02:00:00Z')); // 03:00 Saturday in Madrid
  assert.strictEqual(at3am.today, '2026-11-20');
  assert.ok(at3am.tonight.some((o) => o.name === 'Dune: album release night'));
});

test('past nights move to the archive', () => {
  const state = seedState(FRI_EVENING);
  const nextWeek = buildSchedule(state, new Date('2026-11-27T12:00:00Z'));
  assert.ok(nextWeek.past.some((o) => o.date === '2026-11-20' && o.nightId === 'tonight-special'));
  assert.ok(!nextWeek.upcoming.some((o) => o.nightId === 'tonight-special'));
});

test('open status handles closing after midnight and closing for a day', () => {
  let state = seedState(FRI_EVENING);
  assert.match(openStatus(state, FRI_EVENING).label, /Open now · until 04:00/);
  assert.match(openStatus(state, new Date('2026-11-21T02:30:00Z')).label, /Open now · until 04:00/); // 03:30 Sat
  state = applyAction(state, { type: 'hours.day', payload: { mode: 'closed', date: '2026-11-20' } }, FRI_EVENING).state;
  assert.strictEqual(openStatus(state, FRI_EVENING).label, 'Closed today');
});

test('menu change reports what it reached', () => {
  const state = seedState(FRI_EVENING);
  const { state: next, change } = applyAction(state, { type: 'menu.save', payload: { ...state.menu[0], price: 21 } });
  assert.strictEqual(next.menu[0].price, 21);
  assert.strictEqual(change.summary, 'Grilled octopus: €19 → €21');
  assert.ok(change.touchpoints.auto.includes('QR menu on the tables'));
  assert.strictEqual(state.menu[0].price, 19, 'original record is not mutated');
});

test('bad input is refused with a plain message', () => {
  const state = seedState(FRI_EVENING);
  assert.throws(() => applyAction(state, { type: 'night.save', payload: { name: '', start: '2026-11-20' } }), /Name is needed/);
  assert.throws(() => applyAction(state, { type: 'night.save', payload: { name: 'X', start: '2026-11-20', doors: '25:00' } }), /Doors time/);
  assert.throws(() => applyAction(state, { type: 'look.set', payload: { look: 'neon' } }), /Unknown look/);
});
