'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { occurrenceDates, buildSchedule, openStatus, menusNow, findOccurrence } = require('../lib/schedule');
const { applyAction } = require('../lib/actions');
const { seedState } = require('../lib/seed');
const { buildStats } = require('../lib/stats');

// 2026-11-20 is a Friday. 21:00 Madrid = 20:00 UTC.
const FRI_EVENING = new Date('2026-11-20T20:00:00Z');

test('weekly events repeat and skip cancelled dates', () => {
  const ev = { start: '2026-11-06', repeat: 'weekly', skipped: ['2026-11-27'] };
  assert.deepStrictEqual(occurrenceDates(ev, '2026-11-01', '2026-12-10'), ['2026-11-06', '2026-11-13', '2026-11-20', '2026-12-04']);
});

test('monthly events land on the same weekday of the month', () => {
  const ev = { start: '2026-11-06', repeat: 'monthly' };
  assert.deepStrictEqual(occurrenceDates(ev, '2026-11-01', '2027-01-31'), ['2026-11-06', '2026-12-04', '2027-01-01']);
});

test('a late event still counts as the day it started', () => {
  const state = seedState(FRI_EVENING);
  const at3am = buildSchedule(state, new Date('2026-11-21T02:00:00Z'));
  assert.strictEqual(at3am.today, '2026-11-20');
  assert.ok(at3am.tonight.some((o) => o.eventId === 'ev-tonight'));
});

test('past events move to the archive', () => {
  const state = seedState(FRI_EVENING);
  const nextWeek = buildSchedule(state, new Date('2026-11-27T12:00:00Z'));
  assert.ok(nextWeek.past.some((o) => o.date === '2026-11-20' && o.eventId === 'ev-tonight'));
});

test('Circle-first events are hidden from the public until their time', () => {
  const state = seedState(FRI_EVENING);
  const pub = buildSchedule(state, FRI_EVENING);
  const mem = buildSchedule(state, FRI_EVENING, { member: true });
  assert.ok(!pub.upcoming.some((o) => o.eventId === 'ev-supper'));
  assert.ok(mem.upcoming.some((o) => o.eventId === 'ev-supper' && o.circleFirst));
  const later = buildSchedule(state, new Date(FRI_EVENING.getTime() + 40 * 3600 * 1000));
  assert.ok(later.upcoming.some((o) => o.eventId === 'ev-supper' && !o.circleFirst));
  assert.strictEqual(findOccurrence(state, `ev-supper@2026-12-02`, FRI_EVENING), null);
});

test('menus switch by time of day, including late menus after midnight', () => {
  const state = seedState(FRI_EVENING);
  const at = (iso) => menusNow(state, new Date(iso)).filter((m) => m.active).map((m) => m.name);
  assert.deepStrictEqual(at('2026-11-20T09:00:00Z'), ['Breakfast']); // 10:00 Fri
  assert.deepStrictEqual(at('2026-11-20T12:30:00Z'), ['Lunch']); // 13:30
  assert.deepStrictEqual(at('2026-11-20T20:00:00Z'), ['Dinner']); // 21:00
  assert.deepStrictEqual(at('2026-11-21T00:30:00Z'), ['Late bites']); // 01:30 Sat, from Friday
  assert.deepStrictEqual(at('2026-11-23T00:30:00Z'), []); // 01:30 Mon: Sunday has no late menu
});

test('open status handles closing after midnight and closing for a day', () => {
  let state = seedState(FRI_EVENING);
  assert.match(openStatus(state, FRI_EVENING).label, /Open now · until 03:00/);
  state = applyAction(state, { type: 'hours.day', payload: { mode: 'closed', date: '2026-11-20' } }, FRI_EVENING).state;
  assert.strictEqual(openStatus(state, FRI_EVENING).label, 'Closed today');
});

test('menu builder changes report what they reached', () => {
  const state = seedState(FRI_EVENING);
  const m = state.menus[1];
  const sec = m.sections[0];
  const { state: next, change } = applyAction(state, { type: 'item.price', payload: { menuId: m.id, sectionId: sec.id, id: sec.items[1].id, delta: 2 } });
  assert.strictEqual(next.menus[1].sections[0].items[1].price, 21);
  assert.strictEqual(change.summary, 'Grilled octopus: €19 → €21');
  assert.ok(change.touchpoints.auto.includes('QR menu on the tables'));
  const created = applyAction(next, { type: 'menu.create', payload: { name: 'Brunch', from: '10:00', to: '14:00', days: ['sat', 'sun'] } }).state;
  assert.strictEqual(created.menus.at(-1).name, 'Brunch');
  assert.throws(() => applyAction(next, { type: 'menu.create', payload: { name: 'X', from: '10:00', to: '10:00', days: ['sat'] } }), /same/);
});

test('stories need a photo or text, and bad input is refused plainly', () => {
  const state = seedState(FRI_EVENING);
  assert.throws(() => applyAction(state, { type: 'story.add', payload: { theme: 'Tonight' } }), /photo or a line/);
  assert.throws(() => applyAction(state, { type: 'story.add', payload: { caption: 'x' } }), /Theme is needed/);
  const ok = applyAction(state, { type: 'story.add', payload: { theme: 'Brunch club', caption: 'Doors open', circleOnly: true } }, FRI_EVENING);
  assert.strictEqual(ok.state.stories.at(-1).circleOnly, true);
  assert.ok(ok.state.storyThemes.includes('Brunch club'));
  const renamed = applyAction(ok.state, { type: 'theme.rename', payload: { from: 'Brunch club', to: 'Brunch' } }).state;
  assert.strictEqual(renamed.stories.at(-1).theme, 'Brunch');
  assert.throws(() => applyAction(state, { type: 'event.save', payload: { name: '', start: '2026-11-20' } }), /Name is needed/);
  assert.throws(() => applyAction(state, { type: 'event.save', payload: { name: 'X', start: '2026-11-20', bookable: true, capacity: -3 } }), /Capacity/);
});

test('stats rank events by profit', () => {
  const state = seedState(FRI_EVENING);
  const schedule = buildSchedule(state, FRI_EVENING, { editor: true });
  const s = buildStats({ state, schedule, bookings: [], members: [], views: [], enquiries: [] });
  assert.ok(s.ranking.length >= 4);
  assert.strictEqual(s.ranking[0].name, 'House Friday');
  assert.ok(s.headline.revenue > 0);
});

const { homeSections, PRESETS } = require('../lib/presets');

test('use cases switch modules and home order; core modules stay on', () => {
  let state = seedState(FRI_EVENING);
  state = applyAction(state, { type: 'preset.set', payload: { type: 'cafe' } }).state;
  assert.strictEqual(state.venue.modules.events, false);
  assert.strictEqual(state.venue.modules.menu, true);
  assert.deepStrictEqual(homeSections(state.venue).slice(0, 3), ['hero', 'menu', 'preorder']);
  assert.throws(() => applyAction(state, { type: 'module.toggle', payload: { module: 'hours' } }), /always on/);
  state = applyAction(state, { type: 'module.toggle', payload: { module: 'events' } }).state;
  assert.strictEqual(homeSections(state.venue).at(-1), 'events', 'a module switched on joins the end of the home page');
  state = applyAction(state, { type: 'home.move', payload: { section: 'gallery', dir: 'up' } }).state;
  assert.ok(state.venue.home.indexOf('gallery') < PRESETS.cafe.home.indexOf('gallery'));
  for (const k of Object.keys(PRESETS)) assert.ok(homeSections({ ...state.venue, type: k, modules: PRESETS[k].modules, home: null }).includes('visit'));
});

test('offers show as on during their window', () => {
  const { offersNow } = require('../lib/schedule');
  const state = seedState(FRI_EVENING);
  const at = (iso) => offersNow(state, new Date(iso)).filter((o) => o.active).map((o) => o.name);
  assert.deepStrictEqual(at('2026-11-20T17:30:00Z'), ['Spritz hour']); // 18:30 Fri
  assert.deepStrictEqual(at('2026-11-20T12:30:00Z'), ['Menú del día']); // 13:30 Fri
  assert.deepStrictEqual(at('2026-11-21T12:30:00Z'), []); // Sat lunch: weekdays only
});
