'use strict';

const crypto = require('crypto');
const { isDate, isTime, DAY_KEYS, localNow } = require('./time');

// Every edit from the phone goes through applyAction. It checks the input,
// changes one copy of the venue record and says what changed, so the site,
// the menus, the search data and the share kit can never disagree.

const LOOKS = ['poster', 'gallery', 'beach', 'dark'];
const TYPES = ['cafe', 'restaurant', 'bar'];
const REPEATS = ['none', 'weekly', 'monthly'];
const TAGS = ['vegan', 'vegetarian', 'gluten free'];
const FEATURES = ['stories', 'circle', 'bookings', 'menu'];

// What each kind of change reaches. "auto" updates by itself,
// "share" is a ready-made post the venue taps to send from its own phone.
const TOUCHPOINTS = {
  event: { auto: ['Website home', "What's on page", 'Event page', 'Booking form', 'Search listing data'], share: ['Instagram post', 'Instagram story', 'Google profile post', 'Facebook'] },
  menu: { auto: ['Website home', 'Menu page', 'QR menu on the tables', 'Search listing data'], share: [] },
  story: { auto: ['Stories on the website', 'Event archive'], share: ['Instagram story', 'WhatsApp'] },
  hours: { auto: ['Website header', 'Visit section', 'Search listing data'], share: ['Google profile hours'] },
  look: { auto: ['Every page', 'Share images'], share: [] },
  venue: { auto: ['Every page', 'Search listing data'], share: [] },
  ledger: { auto: ['Stats'], share: [] }
};

class ActionError extends Error {}
function fail(msg) { throw new ActionError(msg); }

function text(v, max, field, required = false) {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (required && !s) fail(`${field} is needed`);
  if (s.length > max) fail(`${field} is too long (max ${max} characters)`);
  return s;
}

function money(v, field) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 999999) fail(`${field} must be a number`);
  return Math.round(n * 100) / 100;
}

function photoId(v) {
  return typeof v === 'string' && /^[a-f0-9]{16,32}$/.test(v) ? v : null;
}

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

function cleanSlot(slot, label) {
  if (slot === null || slot === undefined || slot === 'closed') return null;
  if (!isTime(slot.open) || !isTime(slot.close)) fail(`${label}: times must look like 18:00`);
  if (slot.open === slot.close) fail(`${label}: opening and closing times are the same`);
  return { open: slot.open, close: slot.close };
}

function cleanEvent(input, existing, now) {
  const name = text(input.name, 80, 'Name', true);
  if (!isDate(input.start)) fail('Pick a date');
  const repeat = REPEATS.includes(input.repeat) ? input.repeat : 'none';
  const doors = input.doors || '';
  if (doors && !isTime(doors)) fail('Start time must look like 22:00');
  if (input.until && !isDate(input.until)) fail('End date is not a date');
  const lineup = Array.isArray(input.lineup) ? input.lineup.slice(0, 8).map((d) => {
    const n = text(d && d.name, 40, 'Name in the line-up');
    const t = d && d.time ? d.time : '';
    if (t && !isTime(t)) fail(`Time for ${n || 'the line-up'} must look like 00:30`);
    return n ? { name: n, time: t } : null;
  }).filter(Boolean) : [];
  const bookable = Boolean(input.bookable);
  let capacity = null;
  if (bookable && input.capacity !== '' && input.capacity != null) {
    capacity = parseInt(input.capacity, 10);
    if (!(capacity > 0 && capacity <= 10000)) fail('Capacity must be a number of guests');
  }
  // Circle first: members see it now, everyone else after this many hours.
  let publicFrom = existing ? existing.publicFrom || null : null;
  if (input.circleHours !== undefined) {
    const h = Number(input.circleHours);
    publicFrom = h > 0 ? new Date(now.getTime() + Math.min(h, 168) * 3600 * 1000).toISOString() : null;
  }
  return {
    id: existing ? existing.id : newId('ev'),
    name,
    blurb: text(input.blurb, 280, 'Description'),
    start: input.start,
    repeat,
    until: repeat !== 'none' && input.until ? input.until : null,
    doors,
    lineup,
    photo: photoId(input.photo),
    skipped: existing ? (existing.skipped || []) : [],
    bookable,
    capacity,
    price: bookable ? money(input.price, 'Price') : null,
    publicFrom
  };
}

function cleanItem(input, existing) {
  const price = money(input.price, 'Price');
  if (price === null) fail('Add a price');
  return {
    id: existing ? existing.id : newId('i'),
    name: text(input.name, 80, 'Dish name', true),
    note: text(input.note, 140, 'Note'),
    price,
    tags: Array.isArray(input.tags) ? input.tags.filter((t) => TAGS.includes(t)) : [],
    soldOut: existing ? Boolean(existing.soldOut) : false
  };
}

function cleanMenuMeta(input) {
  const allDay = Boolean(input.allDay);
  const from = allDay ? '00:00' : input.from;
  const to = allDay ? '00:00' : input.to;
  if (!allDay && (!isTime(from) || !isTime(to))) fail('Menu times must look like 12:00');
  if (!allDay && from === to) fail('Start and end time are the same. Tick "all day" instead.');
  const days = Array.isArray(input.days) ? DAY_KEYS.filter((d) => input.days.includes(d)) : [];
  if (!days.length) fail('Pick at least one day');
  return { name: text(input.name, 40, 'Menu name', true), from, to, days, allDay };
}

function findMenu(state, id) { return state.menus.find((m) => m.id === id) || fail('That menu no longer exists'); }
function findSection(menu, id) { return menu.sections.find((s) => s.id === id) || fail('That section no longer exists'); }
function findEvent(state, id) { return state.events.find((n) => n.id === id) || fail('That event no longer exists'); }

function isHex(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }

function applyAction(state, action, now = new Date()) {
  const next = JSON.parse(JSON.stringify(state));
  const p = action.payload || {};
  let summary;
  let kind;

  switch (action.type) {
    // ---- events ----
    case 'event.save': {
      kind = 'event';
      const idx = p.id ? next.events.findIndex((n) => n.id === p.id) : -1;
      if (p.id && idx < 0) fail('That event no longer exists');
      const ev = cleanEvent(p, idx >= 0 ? next.events[idx] : null, now);
      if (idx >= 0) next.events[idx] = ev; else next.events.push(ev);
      summary = `${idx >= 0 ? 'Updated' : 'Added'} ${ev.name}${ev.publicFrom ? ' (Circle first)' : ''}`;
      break;
    }
    case 'event.delete': {
      kind = 'event';
      const ev = findEvent(next, p.id);
      next.events = next.events.filter((n) => n.id !== p.id);
      summary = `Removed ${ev.name}`;
      break;
    }
    case 'event.skip': {
      kind = 'event';
      const ev = findEvent(next, p.id);
      if (!isDate(p.date)) fail('Pick a date');
      ev.skipped = Array.from(new Set([...(ev.skipped || []), p.date])).sort();
      summary = `Cancelled ${ev.name} on ${p.date}`;
      break;
    }
    case 'event.unskip': {
      kind = 'event';
      const ev = findEvent(next, p.id);
      ev.skipped = (ev.skipped || []).filter((d) => d !== p.date);
      summary = `Brought back ${ev.name} on ${p.date}`;
      break;
    }
    case 'ledger.save': {
      kind = 'ledger';
      if (typeof p.key !== 'string' || !/^[\w-]+@\d{4}-\d{2}-\d{2}$/.test(p.key)) fail('Unknown event date');
      next.ledger = next.ledger || {};
      const row = {};
      for (const f of ['revenue', 'talent', 'marketing', 'other', 'effort']) row[f] = money(p[f], f) || 0;
      next.ledger[p.key] = row;
      summary = `Saved takings and costs for ${p.key.split('@')[1]}`;
      break;
    }

    // ---- menus ----
    case 'menu.create': {
      kind = 'menu';
      const m = { id: newId('mn'), ...cleanMenuMeta(p), sections: [{ id: newId('sc'), name: 'Main', items: [] }] };
      next.menus.push(m);
      summary = `Added the ${m.name} menu`;
      break;
    }
    case 'menu.update': {
      kind = 'menu';
      const m = findMenu(next, p.id);
      Object.assign(m, cleanMenuMeta(p));
      summary = `${m.name}: ${m.allDay ? 'all day' : `${m.from} to ${m.to}`}`;
      break;
    }
    case 'menu.delete': {
      kind = 'menu';
      const m = findMenu(next, p.id);
      next.menus = next.menus.filter((x) => x.id !== p.id);
      summary = `Removed the ${m.name} menu`;
      break;
    }
    case 'menu.move': {
      kind = 'menu';
      const i = next.menus.findIndex((x) => x.id === p.id);
      const j = i + (p.dir === 'up' ? -1 : 1);
      if (i < 0 || j < 0 || j >= next.menus.length) fail('Cannot move that way');
      [next.menus[i], next.menus[j]] = [next.menus[j], next.menus[i]];
      summary = `Reordered menus`;
      break;
    }
    case 'section.save': {
      kind = 'menu';
      const m = findMenu(next, p.menuId);
      const name = text(p.name, 40, 'Section name', true);
      if (p.id) findSection(m, p.id).name = name; else m.sections.push({ id: newId('sc'), name, items: [] });
      summary = `${m.name}: section ${name}`;
      break;
    }
    case 'section.delete': {
      kind = 'menu';
      const m = findMenu(next, p.menuId);
      const sec = findSection(m, p.id);
      m.sections = m.sections.filter((s) => s.id !== p.id);
      summary = `${m.name}: removed ${sec.name}`;
      break;
    }
    case 'item.save': {
      kind = 'menu';
      const m = findMenu(next, p.menuId);
      const sec = findSection(m, p.sectionId);
      const idx = p.id ? sec.items.findIndex((x) => x.id === p.id) : -1;
      if (p.id && idx < 0) fail('That dish no longer exists');
      const item = cleanItem(p, idx >= 0 ? sec.items[idx] : null);
      if (idx >= 0) {
        const before = sec.items[idx];
        sec.items[idx] = item;
        summary = before.price !== item.price ? `${item.name}: €${before.price} → €${item.price}` : `Updated ${item.name}`;
      } else {
        sec.items.push(item);
        summary = `Added ${item.name} to ${m.name}`;
      }
      break;
    }
    case 'item.price': {
      kind = 'menu';
      const m = findMenu(next, p.menuId);
      const item = findSection(m, p.sectionId).items.find((x) => x.id === p.id) || fail('That dish no longer exists');
      const before = item.price;
      item.price = Math.max(0, Math.round((item.price + Number(p.delta || 0)) * 100) / 100);
      summary = `${item.name}: €${before} → €${item.price}`;
      break;
    }
    case 'item.soldout': {
      kind = 'menu';
      const m = findMenu(next, p.menuId);
      const item = findSection(m, p.sectionId).items.find((x) => x.id === p.id) || fail('That dish no longer exists');
      item.soldOut = Boolean(p.soldOut);
      summary = `${item.name} ${item.soldOut ? 'sold out' : 'back on'}`;
      break;
    }
    case 'item.delete': {
      kind = 'menu';
      const m = findMenu(next, p.menuId);
      const sec = findSection(m, p.sectionId);
      const item = sec.items.find((x) => x.id === p.id) || fail('That dish no longer exists');
      sec.items = sec.items.filter((x) => x.id !== p.id);
      summary = `Removed ${item.name}`;
      break;
    }
    case 'item.move': {
      kind = 'menu';
      const m = findMenu(next, p.menuId);
      const sec = findSection(m, p.sectionId);
      const i = sec.items.findIndex((x) => x.id === p.id);
      const j = i + (p.dir === 'up' ? -1 : 1);
      if (i < 0 || j < 0 || j >= sec.items.length) fail('Cannot move that way');
      [sec.items[i], sec.items[j]] = [sec.items[j], sec.items[i]];
      summary = `Reordered ${sec.name}`;
      break;
    }

    // ---- stories ----
    case 'story.add': {
      kind = 'story';
      const photo = photoId(p.photo);
      const caption = text(p.caption, 160, 'Caption');
      if (!photo && !caption) fail('Add a photo or a line of text');
      if (p.eventKey && !next.events.some((e) => e.id === String(p.eventKey).split('@')[0])) fail('That event no longer exists');
      next.stories = next.stories || [];
      next.stories.push({ id: newId('st'), photo, caption, eventKey: p.eventKey || null, circleOnly: Boolean(p.circleOnly), at: now.toISOString() });
      // Keep the record small: stories older than 60 days drop off.
      const cutoff = now.getTime() - 60 * 86400000;
      next.stories = next.stories.filter((s) => Date.parse(s.at) > cutoff).slice(-200);
      summary = `Posted a story${p.circleOnly ? ' for the Circle' : ''}`;
      break;
    }
    case 'story.delete': {
      kind = 'story';
      next.stories = (next.stories || []).filter((s) => s.id !== p.id);
      summary = 'Removed a story';
      break;
    }

    // ---- hours ----
    case 'hours.weekly': {
      kind = 'hours';
      const weekly = {};
      for (const k of DAY_KEYS) weekly[k] = cleanSlot(p.weekly ? p.weekly[k] : null, k);
      next.hours.weekly = weekly;
      summary = 'Updated weekly hours';
      break;
    }
    case 'hours.day': {
      kind = 'hours';
      const date = p.date || localNow(next.venue.timezone, now).date;
      if (!isDate(date)) fail('Pick a date');
      next.hours.overrides = next.hours.overrides || {};
      if (p.mode === 'normal') {
        delete next.hours.overrides[date];
        summary = `Normal hours on ${date}`;
      } else if (p.mode === 'closed') {
        next.hours.overrides[date] = null;
        summary = `Closed on ${date}`;
      } else {
        next.hours.overrides[date] = cleanSlot(p.slot, date);
        summary = `Hours on ${date}: ${p.slot.open} to ${p.slot.close}`;
      }
      const today = localNow(next.venue.timezone, now).date;
      for (const d of Object.keys(next.hours.overrides)) {
        if (Date.parse(d) < Date.parse(today) - 7 * 86400000) delete next.hours.overrides[d];
      }
      break;
    }

    // ---- look and venue ----
    case 'look.set': {
      kind = 'look';
      if (!LOOKS.includes(p.look)) fail('Unknown look');
      next.venue.look = p.look;
      if (p.accent !== undefined) next.venue.accent = isHex(p.accent) ? p.accent.toLowerCase() : null;
      summary = `Look: ${p.look}${next.venue.accent ? ` with ${next.venue.accent}` : ''}`;
      break;
    }
    case 'venue.save': {
      kind = 'venue';
      next.venue.name = text(p.name, 60, 'Venue name', true);
      next.venue.tagline = text(p.tagline, 120, 'Tagline');
      next.venue.address = text(p.address, 160, 'Address', true);
      next.venue.phone = text(p.phone, 30, 'Phone');
      next.venue.email = text(p.email, 80, 'Email');
      next.venue.instagram = text(p.instagram, 40, 'Instagram').replace(/^@/, '');
      const g = text(p.googleProfileUrl, 300, 'Google profile link');
      if (g && !/^https:\/\//.test(g)) fail('Google profile link must start with https://');
      next.venue.googleProfileUrl = g;
      if (p.type !== undefined) {
        if (!TYPES.includes(p.type)) fail('Unknown kind of venue');
        next.venue.type = p.type;
      }
      if (p.features && typeof p.features === 'object') {
        for (const f of FEATURES) if (f in p.features) next.venue.features[f] = Boolean(p.features[f]);
      }
      summary = 'Updated venue details';
      break;
    }
    default:
      fail('Unknown change');
  }

  return { state: next, change: { kind, summary, touchpoints: TOUCHPOINTS[kind] } };
}

module.exports = { applyAction, ActionError, TOUCHPOINTS, LOOKS, TYPES, TAGS, FEATURES };
