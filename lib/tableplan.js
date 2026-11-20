'use strict';

// Table plan: the venue lists its tables by seats, which tables can be joined
// and which can be split. Each booking goes on a table that fits for the whole
// sitting (the hold time). When only a join or a split fits, the booking is
// still taken and the manager is told which tables to put together or split.
//
// A booking's table is saved as a short reference:
//   "3"     the whole of table 3
//   "3+4"   tables 3 and 4 joined
//   "5/A"   the first part of table 5 when it is split (5/B the second)
// Table names may not contain "+" or "/".

const HOLDS = ['pending', 'confirmed', 'arrived'];
const HOLD_CHOICES = [60, 75, 90, 105, 120, 150, 180, 210, 240];

const mins = (t) => Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5));

function planOf(settings) {
  const p = (settings && settings.plan) || {};
  return {
    on: Boolean(p.on),
    hold: HOLD_CHOICES.includes(Number(p.hold)) ? Number(p.hold) : 120,
    tables: Array.isArray(p.tables) ? p.tables : [],
    joins: Array.isArray(p.joins) ? p.joins : []
  };
}

function planOn(settings) {
  const p = planOf(settings);
  return p.on && p.tables.length > 0;
}

// Every way a party can be seated: whole tables, parts of split tables, joins.
// units: the pieces of the room a choice takes up, so two choices clash when they share one.
function options(plan) {
  const byName = new Map(plan.tables.map((t) => [t.name, t]));
  const unitsOf = (t) => (t.split ? [t.name + '/A', t.name + '/B'] : [t.name]);
  const out = [];
  for (const t of plan.tables) {
    out.push({ ref: t.name, kind: 'table', seats: t.seats, units: unitsOf(t), tables: [t.name] });
    if (t.split) {
      out.push({ ref: t.name + '/A', kind: 'split', seats: t.split[0], units: [t.name + '/A'], tables: [t.name], part: 'A' });
      out.push({ ref: t.name + '/B', kind: 'split', seats: t.split[1], units: [t.name + '/B'], tables: [t.name], part: 'B' });
    }
  }
  for (const j of plan.joins) {
    const ts = j.map((n) => byName.get(n)).filter(Boolean);
    if (ts.length !== j.length || ts.length < 2) continue;
    out.push({ ref: j.join('+'), kind: 'join', seats: ts.reduce((a, t) => a + t.seats, 0), units: ts.flatMap(unitsOf), tables: j.slice() });
  }
  return out;
}

// Preference: the smallest whole table, then the smallest split part or join.
function rank(a, b) {
  const ka = a.kind === 'table' ? 0 : 1, kb = b.kind === 'table' ? 0 : 1;
  return ka - kb || a.seats - b.seats || (a.kind === 'split' ? 0 : 1) - (b.kind === 'split' ? 0 : 1) || a.ref.localeCompare(b.ref, 'en', { numeric: true });
}

// What is taken around a time. rows: the day's bookings. Bookings already on a
// table keep it; bookings with no table yet (taken before the plan was on, or
// added by hand when nothing fitted) are given one in the order they came in, so
// they still hold a place. Returns a map of booking id to the option it holds.
function occupancy(plan, rows, exceptId = null) {
  const opts = options(plan);
  const byRef = new Map(opts.map((o) => [o.ref, o]));
  const held = [];
  const placed = new Map();
  const live = rows.filter((r) => HOLDS.includes(r.status) && r.id !== exceptId);
  for (const r of live) {
    const o = r.table_ref && byRef.get(r.table_ref);
    if (o && o.seats >= r.guests) { held.push({ start: mins(r.time), units: o.units }); placed.set(r.id, { option: o, given: false }); }
  }
  for (const r of live.filter((x) => !placed.has(x.id)).sort((a, b) => a.id - b.id)) {
    const o = pick(plan, held, r.time, r.guests, opts);
    if (o) { held.push({ start: mins(r.time), units: o.units }); placed.set(r.id, { option: o, given: true }); }
  }
  return { held, placed, opts };
}

function free(plan, held, time, option) {
  const t = mins(time);
  return !held.some((h) => Math.abs(h.start - t) < plan.hold && h.units.some((u) => option.units.includes(u)));
}

// The best free option for a party at a time, or null.
function pick(plan, held, time, guests, opts = options(plan)) {
  return opts.filter((o) => o.seats >= guests && free(plan, held, time, o)).sort(rank)[0] || null;
}

// Where a new booking would go, given the day's bookings.
function place(plan, rows, time, guests) {
  const { held, opts } = occupancy(plan, rows);
  return pick(plan, held, time, guests, opts);
}

// The biggest party that still fits at a time (0 when nothing is free).
function biggestFree(plan, rows, time) {
  const { held, opts } = occupancy(plan, rows);
  return opts.filter((o) => free(plan, held, time, o)).reduce((m, o) => Math.max(m, o.seats), 0);
}

// Every free option a booking could be moved to, best first (its own table included).
function movesFor(plan, rows, booking) {
  const { held, opts } = occupancy(plan, rows, booking.id);
  return opts.filter((o) => o.seats >= booking.guests && free(plan, held, booking.time, o)).sort(rank).map((o) => o.ref);
}

// Is this reference free for a booking? Used when the manager moves a booking.
function canTake(plan, rows, booking, ref) {
  return movesFor(plan, rows, booking).includes(ref);
}

// Does a saved table still exist in the plan and seat the party? (The plan may have changed since.)
function valid(plan, ref, guests) {
  const o = ref && options(plan).find((x) => x.ref === ref);
  return Boolean(o && o.seats >= guests);
}

// Words for the manager. Plain English, like the rest of the editor.
function label(plan, ref) {
  if (!ref) return 'No table yet';
  const o = options(plan).find((x) => x.ref === ref);
  if (!o) return 'Table ' + ref;
  if (o.kind === 'join') return 'Tables ' + o.tables.join(' + ') + ' joined';
  if (o.kind === 'split') return `Table ${o.tables[0]}, ${o.seats} seat part`;
  return 'Table ' + o.ref;
}

function action(plan, ref) {
  const o = options(plan).find((x) => x.ref === ref);
  if (!o) return '';
  if (o.kind === 'join') return 'join tables ' + o.tables.slice(0, -1).join(', ') + ' and ' + o.tables[o.tables.length - 1];
  if (o.kind === 'split') return `split table ${o.tables[0]}`;
  return '';
}

// Check and tidy what the editor sends. Throws a plain message on bad input.
function clean(p, fail) {
  p = p || {};
  const tables = [];
  const seen = new Set();
  for (const raw of (Array.isArray(p.tables) ? p.tables : []).slice(0, 61)) {
    const name = String((raw && raw.name) || '').trim().slice(0, 13);
    if (!name && !(raw && raw.seats)) continue;
    if (!name) fail('Every table needs a name or number');
    if (name.length > 12) fail(`Table names are up to 12 characters (${name})`);
    if (/[+/]/.test(name)) fail(`Table names can't use + or / (${name})`);
    const key = name.toLowerCase();
    if (seen.has(key)) fail(`Two tables are called ${name}`);
    seen.add(key);
    const seats = parseInt(raw.seats, 10);
    if (!(seats >= 1 && seats <= 30)) fail(`Table ${name}: seats must be between 1 and 30`);
    let split = null;
    const s = String(raw.split || '').trim();
    if (s) {
      const parts = s.split(/\s*[+,]\s*/).map((x) => parseInt(x, 10));
      if (parts.length !== 2 || !parts.every((n) => n >= 1)) fail(`Table ${name}: a split looks like 4+2`);
      if (parts[0] + parts[1] !== seats) fail(`Table ${name}: the split must add up to its ${seats} seats`);
      split = parts;
    }
    tables.push({ name, seats, split });
  }
  if (tables.length > 60) fail('Up to 60 tables');
  const names = new Map(tables.map((t) => [t.name.toLowerCase(), t.name]));
  const joins = [];
  const joinKeys = new Set();
  const rawJoins = Array.isArray(p.joins) ? p.joins : String(p.joins || '').split(/[,;\n]+/);
  for (const j of rawJoins.slice(0, 31)) {
    const list = (Array.isArray(j) ? j : String(j).split('+')).map((x) => String(x).trim()).filter(Boolean);
    if (!list.length) continue;
    if (list.length < 2 || list.length > 4) fail('A join is 2 to 4 tables, like 3+4');
    const real = list.map((n) => { const r = names.get(n.toLowerCase()); if (!r) fail(`Join ${list.join('+')}: there is no table ${n}`); return r; });
    if (new Set(real).size !== real.length) fail(`Join ${list.join('+')}: a table is in it twice`);
    const key = real.slice().sort().join('+');
    if (joinKeys.has(key)) continue;
    joinKeys.add(key);
    joins.push(real);
  }
  if (joins.length > 30) fail('Up to 30 joins');
  const on = Boolean(p.on);
  if (on && !tables.length) fail('Add at least one table to use the table plan');
  const hold = HOLD_CHOICES.includes(Number(p.hold)) ? Number(p.hold) : 120;
  return { on, hold, tables, joins };
}

module.exports = { HOLD_CHOICES, planOf, planOn, options, occupancy, valid, place, biggestFree, movesFor, canTake, label, action, clean };
