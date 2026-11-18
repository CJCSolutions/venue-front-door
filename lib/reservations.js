'use strict';

// Table bookings and order ahead for a venue with no other system.
// Table bookings: the venue sets its booking times and how many covers it
// takes at each one; guests pick a date, a time and a party size.
// Order ahead: guests order from today's menu and pick up at a time today.
// Both are paid at the venue.

const { localNow, addDays, dowOf, DAY_KEYS, isTime } = require('./time');
const { hoursFor } = require('./schedule');

const TABLE_DEFAULTS = {
  mode: 'auto', // 'auto': confirmed while there is space; 'manual': the venue confirms each one
  times: ['13:00', '13:30', '14:00', '14:30', '20:00', '20:30', '21:00', '21:30'],
  covers: 20, // guests per booking time
  maxParty: 8, // bigger groups send a request instead
  notice: 60, // minutes ahead a booking must be made
  daysAhead: 30
};

const COLLECT_DEFAULTS = {
  open: false,
  from: '12:00',
  to: '22:00',
  every: 15, // minutes between pickup times
  notice: 30 // minutes the kitchen needs
};

// Statuses that hold a place at a booking time.
const HOLDS = ['pending', 'confirmed', 'arrived'];
const RES_STATUSES = ['pending', 'confirmed', 'declined', 'arrived', 'no-show', 'cancelled'];

const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function tableSettings(state) {
  const s = { ...TABLE_DEFAULTS, ...(state.tableBooking || {}) };
  s.times = (s.times || []).filter(isTime).sort();
  return s;
}

function collectSettings(state) {
  return { ...COLLECT_DEFAULTS, ...(state.collect || {}) };
}

// Is a time inside the venue's opening hours on that date (including after midnight)?
function withinHours(state, date, time) {
  const { slot } = hoursFor(state, date);
  if (!slot) return false;
  const o = mins(slot.open), c0 = mins(slot.close), c = c0 <= o ? c0 + 1440 : c0;
  let t = mins(time);
  if (t < o && t + 1440 < c) t += 1440;
  return t >= o && t < c;
}

// Table bookings start once the venue has saved its own booking times and
// covers; until then guests send a request. A booking system link replaces them.
function tablesOn(state) {
  const l = state.links || {};
  return Boolean(state.venue.modules.tables && state.tableBooking && !l.bookingUrl && tableSettings(state).times.length);
}

// The dates a guest can book: open days within daysAhead.
function bookableDates(state, now = new Date()) {
  const s = tableSettings(state);
  const local = localNow(state.venue.timezone, now);
  const out = [];
  for (let i = 0; i <= s.daysAhead; i++) {
    const date = addDays(local.date, i);
    if (timesFor(state, date, {}, now).some((t) => t.left > 0)) out.push(date);
  }
  return out;
}

// Booking times on a date with places left. taken = { '20:00': guests }.
function timesFor(state, date, taken = {}, now = new Date()) {
  const s = tableSettings(state);
  const local = localNow(state.venue.timezone, now);
  if (date < local.date || date > addDays(local.date, s.daysAhead)) return [];
  const earliest = date === local.date ? mins(local.time) + s.notice : -1;
  return s.times
    .filter((t) => withinHours(state, date, t) && mins(t) >= earliest)
    .map((t) => ({ time: t, left: Math.max(0, s.covers - (taken[t] || 0)) }));
}

// Pickup times left today, from now plus notice to the end of the window.
function collectSlots(state, now = new Date()) {
  const s = collectSettings(state);
  if (!state.venue.modules.collect || !s.open) return [];
  const local = localNow(state.venue.timezone, now);
  const step = Math.max(5, Math.min(60, s.every || 15));
  const start = Math.max(mins(s.from), Math.ceil((mins(local.time) + s.notice) / step) * step);
  const out = [];
  for (let m = start; m <= mins(s.to); m += step) {
    const t = hhmm(m);
    if (withinHours(state, local.date, t)) out.push(t);
  }
  return out;
}

// Does a menu serve at this time? Handles menus that run past midnight.
function serves(m, time) {
  if (m.allDay) return true;
  const f = mins(m.from), t0 = mins(m.to), t = t0 <= f ? t0 + 1440 : t0;
  const x = mins(time);
  return (x >= f && x < t) || (x + 1440 >= f && x + 1440 < t);
}

// What can be ordered today: dishes on the menus still serving at a pickup time left today, not sold out.
function collectMenu(state, now = new Date(), slots = collectSlots(state, now)) {
  const local = localNow(state.venue.timezone, now);
  const day = DAY_KEYS[dowOf(local.date)];
  const seen = new Set();
  return (state.menus || [])
    .filter((m) => m.days.includes(day) && slots.some((t) => serves(m, t)))
    .map((m) => ({
      id: m.id, name: m.name, from: m.from, to: m.to, allDay: m.allDay,
      sections: m.sections.map((sec) => ({
        id: sec.id, name: sec.name,
        items: sec.items.filter((it) => !it.soldOut && it.price != null && !seen.has(it.id) && seen.add(it.id))
      })).filter((sec) => sec.items.length)
    }))
    .filter((m) => m.sections.length);
}

function looksLikeEmail(s) { return /^[^\s@,;<>"()]+@[^\s@,;<>"()]+\.[^\s@,;<>"()]+$/.test(String(s || '').trim()); }

// Every menu each dish is on today, so a dish on lunch and dinner is fine at either time.
function menusByItem(state, now = new Date()) {
  const local = localNow(state.venue.timezone, now);
  const day = DAY_KEYS[dowOf(local.date)];
  const out = {};
  for (const m of state.menus || []) {
    if (!m.days.includes(day)) continue;
    for (const sec of m.sections) for (const it of sec.items) (out[it.id] = out[it.id] || []).push(m);
  }
  return out;
}

// A WhatsApp link that opens a chat with the guest, message written.
function whatsappLink(contact, message) {
  const digits = String(contact || '').replace(/[^\d+]/g, '');
  if (looksLikeEmail(contact) || digits.replace('+', '').length < 8) return null;
  const n = digits.startsWith('+') ? digits.slice(1) : digits.startsWith('00') ? digits.slice(2) : digits.length === 9 ? '34' + digits : digits;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

module.exports = {
  TABLE_DEFAULTS, COLLECT_DEFAULTS, HOLDS, RES_STATUSES,
  tableSettings, collectSettings, tablesOn, bookableDates, timesFor, collectSlots, collectMenu, serves, menusByItem, withinHours, looksLikeEmail, whatsappLink
};
