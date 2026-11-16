'use strict';

const crypto = require('crypto');
const { isDate, isTime, DAY_KEYS, localNow } = require('./time');

// Every edit from the phone goes through applyAction. It checks the input,
// changes one copy of the venue record and says what changed, so the site,
// the menu, the search data and the share kit can never disagree.

const LOOKS = ['poster', 'gallery', 'beach', 'dark'];
const REPEATS = ['none', 'weekly', 'monthly'];
const SECTIONS = ['Food', 'Drinks', 'Specials'];
const TAGS = ['vegan', 'vegetarian', 'gluten free'];

// What each kind of change reaches. "auto" updates by itself,
// "share" is a ready-made post the venue taps to send from its own phone.
const TOUCHPOINTS = {
  night: { auto: ['Website home', "What's on page", 'Night page', 'Search listing data'], share: ['Instagram post', 'Instagram story', 'Google profile post', 'Facebook'] },
  menu: { auto: ['Website home', 'QR menu on the tables', 'Search listing data'], share: [] },
  hours: { auto: ['Website header', 'Visit section', 'Search listing data'], share: ['Google profile hours'] },
  look: { auto: ['Every page', 'Share images'], share: [] },
  venue: { auto: ['Every page', 'Search listing data'], share: [] }
};

class ActionError extends Error {}

function fail(msg) { throw new ActionError(msg); }

function text(v, max, field, required = false) {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (required && !s) fail(`${field} is needed`);
  if (s.length > max) fail(`${field} is too long (max ${max} characters)`);
  return s;
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

function cleanNight(input, existing) {
  const name = text(input.name, 80, 'Name', true);
  if (!isDate(input.start)) fail('Pick a date');
  const repeat = REPEATS.includes(input.repeat) ? input.repeat : 'none';
  const doors = input.doors ? input.doors : '';
  if (doors && !isTime(doors)) fail('Doors time must look like 22:00');
  if (input.until && !isDate(input.until)) fail('End date is not a date');
  const djs = Array.isArray(input.djs) ? input.djs.slice(0, 8).map((d) => {
    const n = text(d && d.name, 40, 'DJ name');
    const t = d && d.time ? d.time : '';
    if (t && !isTime(t)) fail(`Set time for ${n || 'DJ'} must look like 00:30`);
    return n ? { name: n, time: t } : null;
  }).filter(Boolean) : [];
  const photo = typeof input.photo === 'string' && /^[a-f0-9]{16,32}$/.test(input.photo) ? input.photo : null;
  return {
    id: existing ? existing.id : newId('night'),
    name,
    blurb: text(input.blurb, 240, 'Description'),
    start: input.start,
    repeat,
    until: repeat !== 'none' && input.until ? input.until : null,
    doors,
    djs,
    photo,
    skipped: existing ? (existing.skipped || []) : []
  };
}

function cleanMenuItem(input, existing) {
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0 || price > 9999) fail('Price must be a number');
  return {
    id: existing ? existing.id : newId('m'),
    section: SECTIONS.includes(input.section) ? input.section : 'Food',
    name: text(input.name, 80, 'Dish name', true),
    note: text(input.note, 140, 'Note'),
    price: Math.round(price * 100) / 100,
    tags: Array.isArray(input.tags) ? input.tags.filter((t) => TAGS.includes(t)) : [],
    soldOut: Boolean(input.soldOut)
  };
}

function applyAction(state, action, now = new Date()) {
  const next = JSON.parse(JSON.stringify(state));
  const p = action.payload || {};
  let summary;
  let kind;

  switch (action.type) {
    case 'night.save': {
      kind = 'night';
      const idx = p.id ? next.nights.findIndex((n) => n.id === p.id) : -1;
      if (p.id && idx < 0) fail('That night no longer exists');
      const night = cleanNight(p, idx >= 0 ? next.nights[idx] : null);
      if (idx >= 0) next.nights[idx] = night; else next.nights.push(night);
      summary = `${idx >= 0 ? 'Updated' : 'Added'} night: ${night.name}`;
      break;
    }
    case 'night.delete': {
      kind = 'night';
      const night = next.nights.find((n) => n.id === p.id) || fail('That night no longer exists');
      next.nights = next.nights.filter((n) => n.id !== p.id);
      summary = `Removed night: ${night.name}`;
      break;
    }
    case 'night.skip': {
      kind = 'night';
      const night = next.nights.find((n) => n.id === p.id) || fail('That night no longer exists');
      if (!isDate(p.date)) fail('Pick a date');
      night.skipped = Array.from(new Set([...(night.skipped || []), p.date])).sort();
      summary = `Cancelled ${night.name} on ${p.date}`;
      break;
    }
    case 'night.unskip': {
      kind = 'night';
      const night = next.nights.find((n) => n.id === p.id) || fail('That night no longer exists');
      night.skipped = (night.skipped || []).filter((d) => d !== p.date);
      summary = `Brought back ${night.name} on ${p.date}`;
      break;
    }
    case 'menu.save': {
      kind = 'menu';
      const idx = p.id ? next.menu.findIndex((m) => m.id === p.id) : -1;
      if (p.id && idx < 0) fail('That dish no longer exists');
      const item = cleanMenuItem(p, idx >= 0 ? next.menu[idx] : null);
      if (idx >= 0) {
        const before = next.menu[idx];
        next.menu[idx] = item;
        summary = before.price !== item.price ? `${item.name}: €${before.price} → €${item.price}` : `Updated ${item.name}`;
      } else {
        next.menu.push(item);
        summary = `Added ${item.name} at €${item.price}`;
      }
      break;
    }
    case 'menu.soldout': {
      kind = 'menu';
      const item = next.menu.find((m) => m.id === p.id) || fail('That dish no longer exists');
      item.soldOut = Boolean(p.soldOut);
      summary = `${item.name} ${item.soldOut ? 'sold out' : 'back on'}`;
      break;
    }
    case 'menu.delete': {
      kind = 'menu';
      const item = next.menu.find((m) => m.id === p.id) || fail('That dish no longer exists');
      next.menu = next.menu.filter((m) => m.id !== p.id);
      summary = `Removed ${item.name}`;
      break;
    }
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
      // Drop overrides that are more than a week old.
      const today = localNow(next.venue.timezone, now).date;
      for (const d of Object.keys(next.hours.overrides)) {
        if (Date.parse(d) < Date.parse(today) - 7 * 86400000) delete next.hours.overrides[d];
      }
      break;
    }
    case 'look.set': {
      kind = 'look';
      if (!LOOKS.includes(p.look)) fail('Unknown look');
      next.venue.look = p.look;
      summary = `Look changed to ${p.look}`;
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
      summary = 'Updated venue details';
      break;
    }
    default:
      fail('Unknown change');
  }

  return { state: next, change: { kind, summary, touchpoints: TOUCHPOINTS[kind] } };
}

module.exports = { applyAction, ActionError, TOUCHPOINTS, LOOKS, SECTIONS, TAGS };
