'use strict';

// The Ibiza Playbook feed. Turns a venue's own record (what's on, menus by
// time of day, offers, pre-orders, hours) into plain listings a guest guide can
// filter: food, DJ, sunset, live music, open late, family. One change in the
// editor shows up here on the next refresh, with no second place to update.

const { buildSchedule, hoursFor } = require('./schedule');
const { preordersNow } = require('./orders');
const { localNow, serviceDate, addDays, dowOf, DAY_KEYS } = require('./time');
const { preset } = require('./presets');

const AREAS = [
  [/sant antoni|san antonio/i, 'Sant Antoni'],
  [/eivissa|ibiza town/i, 'Ibiza Town'],
  [/santa eul/i, 'Santa Eulària'],
  [/sant josep|san jos/i, 'West coast'],
  [/sant joan|portinatx|sant miquel|sant carles/i, 'North']
];
const areaOf = (v) => (AREAS.find(([re]) => re.test(`${v.city} ${v.address}`)) || [null, v.city])[1];

const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const DRINKS = /drink|cocktail|wine|bar list/i;

// Close time for a date, as minutes after that date's midnight (02:00 = 1560).
function closeOn(state, date) {
  const { slot } = hoursFor(state, date);
  if (!slot) return null;
  const o = mins(slot.open), c = mins(slot.close);
  return c <= o ? c + 1440 : c;
}

// Does a food menu run at some point between start and end on this date?
function foodBetween(state, date, start, end) {
  const day = DAY_KEYS[dowOf(date)];
  return (state.menus || []).some((m) => {
    if (DRINKS.test(m.name) || !m.days.includes(day) || !m.sections.some((s) => s.items.some((i) => !i.soldOut))) return false;
    if (m.allDay) return false;
    const f = mins(m.from), t0 = mins(m.to), t = t0 <= f ? t0 + 1440 : t0;
    return f < end && t > start;
  });
}

function menuNamesBetween(state, date, start, end) {
  const day = DAY_KEYS[dowOf(date)];
  return (state.menus || []).filter((m) => {
    if (DRINKS.test(m.name) || !m.days.includes(day) || m.allDay) return false;
    const f = mins(m.from), t0 = mins(m.to), t = t0 <= f ? t0 + 1440 : t0;
    return f < end && t > start;
  }).map((m) => `${m.name} ${m.from} to ${m.to}`);
}

function offerOn(state, date, start, end) {
  const day = DAY_KEYS[dowOf(date)];
  const o = (state.offers || []).find((x) => x.days.includes(day) && mins(x.from) < end && mins(x.to) > start);
  return o ? `${o.name}: ${o.detail}` : '';
}

function tagsFor(text, { food, late, family, lineup }) {
  const t = [];
  if (food) t.push('food');
  if ((lineup && !/quiz/i.test(text)) || /\b(dj|djs|decks|house|disco|plays|warms up)\b/i.test(text)) t.push('dj');
  if (/sunset/i.test(text)) t.push('sunset');
  if (/\b(live|band|guitar|sax|jam|acoustic|singer)\b/i.test(text)) t.push('live');
  if (late) t.push('late');
  if (family || /\b(family|kids|children|brunch|roast|daybeds?)\b/i.test(text)) t.push('family');
  return t;
}

// Listings for one venue, today and tomorrow.
function venueListings(state, { key, base, now = new Date() }) {
  const v = state.venue, M = v.modules;
  const today = serviceDate(localNow(v.timezone, now));
  const days = [today, addDays(today, 1)];
  const venueUrl = (path) => `${base}${path}${path.includes('?') ? '&' : '?'}${key ? `sample=${key}&` : ''}src=playbook`;
  const out = [];
  const isCafe = v.type === 'cafe';

  if (M.events) {
    const sc = buildSchedule(state, now);
    for (const o of [...sc.tonight, ...sc.upcoming].filter((x) => days.includes(x.date))) {
      const start = o.doors ? mins(o.doors) : 12 * 60;
      const close = closeOn(state, o.date);
      const end = close && close > start ? close : start + 180;
      const text = `${o.name} ${o.blurb}`;
      out.push({
        id: `${key || 'venue'}:${o.key}`, kind: 'event', date: o.date, start, end,
        title: o.name, what: o.blurb,
        lineup: (o.lineup || []).map((l) => `${l.name}${l.time ? ` from ${l.time}` : ''}`).join(' · '),
        food: menuNamesBetween(state, o.date, start, end).join(', '),
        offer: M.offers ? offerOn(state, o.date, start, end) : '',
        tags: tagsFor(text, { food: M.menu && foodBetween(state, o.date, start, end), late: end >= 1500, lineup: (o.lineup || []).length > 0 }),
        action: o.bookable && M.bookings ? { label: 'Book on their site', href: venueUrl(`/event/${encodeURIComponent(o.key)}`) } : { label: 'See it on their site', href: venueUrl(`/event/${encodeURIComponent(o.key)}`) }
      });
    }
  }

  // Places without events still show up when they are open and serving.
  if (!M.events && M.menu) {
    for (const date of days) {
      const day = DAY_KEYS[dowOf(date)];
      for (const m of (state.menus || []).filter((x) => !x.allDay && !DRINKS.test(x.name) && x.days.includes(day))) {
        const start = mins(m.from), t0 = mins(m.to), end = t0 <= start ? t0 + 1440 : t0;
        const items = m.sections.flatMap((s) => s.items).filter((i) => !i.soldOut).slice(0, 3).map((i) => i.name);
        out.push({
          id: `${key || 'venue'}:menu-${m.id}@${date}`, kind: 'menu', date, start, end,
          title: m.name, what: items.length ? `Serving ${items.join(', ').toLowerCase()} and more.` : `${m.name} is on.`,
          lineup: '', food: `${m.name} ${m.from} to ${m.to}`,
          offer: M.offers ? offerOn(state, date, start, end) : '',
          tags: tagsFor(m.name, { food: true, late: end >= 1500, family: isCafe }),
          action: { label: 'See the menu', href: venueUrl(`/menu#${m.id}`) }
        });
      }
    }
  }

  if (M.preorder) {
    for (const po of preordersNow(state, now)) {
      for (const d of po.dates.filter((x) => days.includes(x.date))) {
        const start = mins(po.from), end = mins(po.to) + 30;
        out.push({
          id: `${key || 'venue'}:${po.id}@${d.date}`, kind: 'preorder', date: d.date, start, end,
          title: po.name, what: po.blurb, lineup: '',
          food: po.items.filter((i) => !i.soldOut).slice(0, 4).map((i) => i.name).join(', '),
          offer: `Pre-order by ${d.cutoff.time} on ${d.cutoff.date === today ? 'today' : d.cutoff.date}`,
          tags: tagsFor(`${po.name} ${po.blurb}`, { food: true, family: true }),
          action: { label: 'Pre-order on their site', href: venueUrl(`/order/${encodeURIComponent(po.id)}`) }
        });
      }
    }
  }

  return {
    key: key || 'venue', name: v.name, kind: (preset(v).label || '').split(' ')[0] === 'Restaurant' ? 'Restaurant' : ({ cafe: 'Café', bar: 'Bar', beach: 'Beach club', restaurant: 'Restaurant' })[v.type] || 'Venue',
    area: areaOf(v), url: venueUrl('/'), listings: out
  };
}

function buildFeed({ states, base, now = new Date() }) {
  const tz = states[0] ? states[0].state.venue.timezone : 'Europe/Madrid';
  const local = localNow(tz, now);
  return {
    generated: now.toISOString(), today: serviceDate(local), localTime: local.time,
    venues: states.map(({ key, state }) => venueListings(state, { key, base, now }))
  };
}

module.exports = { buildFeed, venueListings, areaOf };
