'use strict';

// Pre-orders: guests order ahead for a set day. A café's weekend bakes to
// collect, a restaurant's Sunday roast to eat in or take away. Each pre-order
// has its days, a time window cut into slots, a cut-off, and items with an
// optional limit per day so the kitchen never takes more than it can make.

const { localNow, addDays, dowOf, DAY_KEYS } = require('./time');

const MODES = { sitin: 'Eat in', takeaway: 'Take away', collect: 'Collect' };

function slotsOf(po) {
  const out = [];
  const step = Math.max(10, Math.min(120, po.every || 30));
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  for (let m = toMin(po.from); m <= toMin(po.to); m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

// When orders for a date close, as local date and time.
function cutoffOf(po, date) {
  return { date: addDays(date, -(po.cutoffDays || 0)), time: po.cutoffTime || '20:00' };
}

// The next dates still taking orders.
function openDates(po, tz, now = new Date(), count = 3) {
  if (!po.open) return [];
  const local = localNow(tz, now);
  const stamp = `${local.date} ${local.time}`;
  const out = [];
  for (let i = 0; i < 21 && out.length < count; i++) {
    const date = addDays(local.date, i);
    if (!po.days.includes(DAY_KEYS[dowOf(date)])) continue;
    const c = cutoffOf(po, date);
    if (`${c.date} ${c.time}` > stamp) out.push({ date, cutoff: c });
  }
  return out;
}

// What is left of each item on a date, given what is already ordered.
function remaining(po, taken = {}) {
  const out = {};
  for (const it of po.items) out[it.id] = it.soldOut ? 0 : it.limit ? Math.max(0, it.limit - (taken[it.id] || 0)) : null;
  return out;
}

// Pre-orders as the site needs them.
function preordersNow(state, now = new Date()) {
  const tz = state.venue.timezone;
  return (state.preorders || []).map((po) => ({ ...po, dates: openDates(po, tz, now), slots: slotsOf(po) }));
}

// The kitchen list: how many of each item for each coming date.
function prepList(orders, today) {
  const by = {};
  for (const o of orders) {
    if (o.status === 'cancelled' || o.date < today) continue;
    const k = `${o.preorder_id}@${o.date}`;
    by[k] = by[k] || { preorder_id: o.preorder_id, name: o.preorder_name, date: o.date, orders: 0, total: 0, items: {}, modes: {} };
    const g = by[k];
    g.orders += 1; g.total += Number(o.total) || 0;
    g.modes[o.mode] = (g.modes[o.mode] || 0) + 1;
    for (const it of o.items) g.items[it.name] = (g.items[it.name] || 0) + it.qty;
  }
  return Object.values(by).sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { MODES, slotsOf, cutoffOf, openDates, remaining, preordersNow, prepList };
