'use strict';

const { DAY_KEYS, EN_DAYS, localNow, dowOf, addDays, serviceDate } = require('./time');

// --- Nights: one record can repeat, and each dated copy is worked out here ---

function occurrenceDates(night, from, to) {
  const out = [];
  const skip = new Set(night.skipped || []);
  const until = night.until && night.until < to ? night.until : to;
  if (!night.start) return out;

  if (night.repeat === 'weekly') {
    let d = night.start;
    if (d < from) {
      const gap = Math.floor((Date.parse(from) - Date.parse(d)) / 86400000);
      d = addDays(d, Math.floor(gap / 7) * 7);
    }
    for (; d <= until; d = addDays(d, 7)) {
      if (d >= from && d >= night.start && !skip.has(d)) out.push(d);
    }
  } else if (night.repeat === 'monthly') {
    // Same weekday, same week of the month as the first date (e.g. first Friday).
    const startDow = dowOf(night.start);
    const week = Math.ceil(Number(night.start.slice(8, 10)) / 7);
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7));
    for (let i = 0; i < 24; i++) {
      const first = `${y}-${String(m).padStart(2, '0')}-01`;
      if (first > until) break;
      const offset = (startDow - dowOf(first) + 7) % 7;
      const d = addDays(first, offset + (week - 1) * 7);
      if (d.slice(0, 7) === first.slice(0, 7) && d >= from && d <= until && d >= night.start && !skip.has(d)) out.push(d);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
  } else if (night.start >= from && night.start <= until && !skip.has(night.start)) {
    out.push(night.start);
  }
  return out;
}

function occurrence(night, date) {
  return {
    key: `${night.id}@${date}`,
    nightId: night.id,
    date,
    name: night.name,
    blurb: night.blurb || '',
    doors: night.doors || '',
    djs: night.djs || [],
    photo: night.photo || null,
    repeat: night.repeat || 'none'
  };
}

function buildSchedule(state, now = new Date()) {
  const local = localNow(state.venue.timezone, now);
  const today = serviceDate(local);
  const ahead = addDays(today, 27);
  const back = addDays(today, -56);
  const all = [];
  for (const night of state.nights) {
    for (const d of occurrenceDates(night, back, ahead)) all.push(occurrence(night, d));
  }
  all.sort((a, b) => (a.date === b.date ? (a.doors || '').localeCompare(b.doors || '') : a.date.localeCompare(b.date)));
  const tonight = all.filter((o) => o.date === today);
  const upcoming = all.filter((o) => o.date > today);
  const past = all.filter((o) => o.date < today).reverse();
  return { today, local, tonight, upcoming, past, next: tonight[0] || upcoming[0] || null };
}

function findOccurrence(state, key, now = new Date()) {
  const [id, date] = String(key).split('@');
  const night = state.nights.find((n) => n.id === id);
  if (!night || !date) return null;
  if (!occurrenceDates(night, date, date).includes(date)) return null;
  const today = buildSchedule(state, now).today;
  const o = occurrence(night, date);
  o.status = date === today ? 'tonight' : date > today ? 'upcoming' : 'past';
  return o;
}

// --- Hours: weekly pattern plus one-day overrides (closed, or different times) ---

function hoursFor(state, date) {
  const overrides = state.hours.overrides || {};
  if (Object.prototype.hasOwnProperty.call(overrides, date)) return { slot: overrides[date], special: true };
  return { slot: state.hours.weekly[DAY_KEYS[dowOf(date)]] || null, special: false };
}

function crossesMidnight(slot) {
  return slot && slot.close <= slot.open;
}

function openStatus(state, now = new Date()) {
  const local = localNow(state.venue.timezone, now);
  const today = hoursFor(state, local.date);
  const yesterday = hoursFor(state, addDays(local.date, -1));

  // Still open from last night?
  if (crossesMidnight(yesterday.slot) && local.time < yesterday.slot.close) {
    return { open: true, label: `Open now · until ${yesterday.slot.close}`, today: today.slot, special: today.special };
  }
  if (!today.slot) {
    return { open: false, label: today.special ? 'Closed today' : 'Closed today', today: null, special: today.special };
  }
  const { open, close } = today.slot;
  const afterOpen = local.time >= open;
  const beforeClose = crossesMidnight(today.slot) || local.time < close;
  if (afterOpen && beforeClose) {
    return { open: true, label: `Open now · until ${close}`, today: today.slot, special: today.special };
  }
  if (!afterOpen) {
    return { open: false, label: `Opens today at ${open}`, today: today.slot, special: today.special };
  }
  return { open: false, label: 'Closed now', today: today.slot, special: today.special };
}

function weekHours(state) {
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return order.map((k) => {
    const slot = state.hours.weekly[k];
    return { key: k, day: EN_DAYS[DAY_KEYS.indexOf(k)], text: slot ? `${slot.open} to ${slot.close}` : 'Closed', slot };
  });
}

module.exports = { occurrenceDates, buildSchedule, findOccurrence, hoursFor, openStatus, weekHours };
