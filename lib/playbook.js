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

// ---------- the whole-island guide ----------
// Each client venue runs its own install, with its own /api/playbook.json.
// The guide page reads this install's feed plus every client feed listed in
// playbook-feeds.json (or PLAYBOOK_FEEDS, comma separated), merged into one.
// A feed that is slow or down is skipped and named, so one venue can never
// take the guide down.

const fs = require('fs');
const path = require('path');

function feedList() {
  const fromEnv = (process.env.PLAYBOOK_FEEDS || '').split(',');
  let fromFile = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'playbook-feeds.json'), 'utf8'));
    fromFile = (raw.feeds || []).map((f) => (typeof f === 'string' ? f : f.url));
  } catch (e) { /* no file, no extra feeds */ }
  const seen = new Set();
  return [...fromEnv, ...fromFile].map((u) => String(u || '').trim().replace(/\/+$/, '')).filter((u) => {
    if (!/^https?:\/\/[^\s/]+/i.test(u) || seen.has(u)) return false;
    seen.add(u); return true;
  }).map((u) => (/\/api\/playbook\.json$/.test(u) ? u : `${u}/api/playbook.json`));
}

const hostOf = (u) => { try { return new URL(u).host; } catch (e) { return u; } };

// Client feeds are cached for a minute so a busy guide doesn't hammer them.
const cache = new Map();
async function fetchFeed(url, { timeoutMs = 4000, maxAgeMs = 60000, fetcher = fetch } = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.result;
  let result;
  try {
    const r = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const f = await r.json();
    if (!f || !Array.isArray(f.venues) || !f.today) throw new Error('not a Playbook feed');
    result = { ok: true, feed: f };
  } catch (e) {
    result = { ok: false, error: e.name === 'TimeoutError' ? 'too slow to answer' : e.message };
    if (hit && hit.result.ok) result = { ...hit.result, stale: true }; // keep the last good copy
  }
  cache.set(url, { at: Date.now(), result });
  return result;
}

// Shift a listing's day so every feed speaks about the guide's "today".
function shiftTo(today, feedToday, l) {
  if (feedToday === today) return l;
  const d = (Date.parse(l.date) - Date.parse(today)) / 864e5;
  return d === 0 || d === 1 ? l : null;
}

async function guideFeed({ own, ownBase, feeds = feedList(), fetcher }) {
  const ownHost = hostOf(ownBase);
  const sources = [{ url: `${ownBase}/api/playbook.json`, host: ownHost, ok: true, venues: own.venues.length }];
  const venues = own.venues.map((v) => ({ ...v, source: ownHost }));
  const names = new Set(venues.map((v) => `${v.name}|${v.area}`.toLowerCase()));
  const remote = feeds.filter((u) => hostOf(u) !== ownHost);
  const results = await Promise.all(remote.map((u) => fetchFeed(u, fetcher ? { fetcher } : {})));
  results.forEach((res, i) => {
    const host = hostOf(remote[i]);
    if (!res.ok) { sources.push({ url: remote[i], host, ok: false, error: res.error }); return; }
    let added = 0;
    for (const v of res.feed.venues) {
      const id = `${v.name}|${v.area}`.toLowerCase();
      if (names.has(id)) continue; // same venue listed twice: keep the first
      names.add(id); added++;
      venues.push({
        ...v, key: `${host}/${v.key}`, source: host,
        listings: (v.listings || []).map((l) => shiftTo(own.today, res.feed.today, l)).filter(Boolean).map((l) => ({ ...l, id: `${host}/${l.id}` }))
      });
    }
    sources.push({ url: remote[i], host, ok: true, venues: added, stale: !!res.stale });
  });
  return { ...own, venues, sources };
}

module.exports = { buildFeed, venueListings, areaOf, guideFeed, feedList, fetchFeed, _cache: cache };
