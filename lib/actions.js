'use strict';

const crypto = require('crypto');
const { isDate, isTime, DAY_KEYS, localNow } = require('./time');
const { MODULES, SECTIONS, PRESETS } = require('./presets');

// Every edit from the phone goes through applyAction. It checks the input,
// changes one copy of the venue record and says what changed, so the site,
// the menus, the search data and the share kit can never disagree.

const LOOKS = ['poster', 'gallery', 'beach', 'dark'];
const TYPES = Object.keys(PRESETS);
const REPEATS = ['none', 'weekly', 'monthly'];
const TAGS = ['vegan', 'vegetarian', 'gluten free'];

// What each kind of change reaches. "auto" updates by itself,
// "share" is a ready-made post the venue taps to send from its own phone.
const TOUCHPOINTS = {
  event: { auto: ['Website home', "What's on page", 'Event page', 'Booking form', 'Search listing data', 'Ibiza Playbook'], share: ['Instagram post', 'Instagram story', 'Google profile post', 'Facebook'] },
  menu: { auto: ['Website home', 'Menu page', 'QR menu on the tables', 'Search listing data', 'Ibiza Playbook'], share: [] },
  story: { auto: ['Stories on the website', 'Event archive'], share: ['Instagram story', 'WhatsApp'] },
  hours: { auto: ['Website header', 'Visit section', 'Search listing data', 'Ibiza Playbook'], share: ['Google profile hours'] },
  look: { auto: ['Every page', 'Share images'], share: [] },
  venue: { auto: ['Every page', 'Search listing data'], share: [] },
  ledger: { auto: ['Stats'], share: [] },
  site: { auto: ['Every page', 'Navigation', 'Search listing data'], share: [] },
  content: { auto: ['Website home', 'About and Visit pages', 'Search listing data'], share: [] },
  offer: { auto: ['Website home', 'Menu page', 'Ibiza Playbook'], share: ['Instagram story', 'Google profile post'] },
  preorder: { auto: ['Website home', 'Pre-order page', 'Order form', 'Ibiza Playbook'], share: ['Instagram story', 'WhatsApp'] },
  tables: { auto: ['Book page', 'Booking times and covers', 'Inbox'], share: [] },
  collect: { auto: ['Order page', 'Website navigation', 'Inbox'], share: ['Instagram story', 'WhatsApp'] },
  alerts: { auto: ['Email alerts'], share: [] }
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

const PO_MODES = ['sitin', 'takeaway', 'collect'];
function findPreorder(state, id) { return (state.preorders || []).find((x) => x.id === id) || fail('That pre-order no longer exists'); }

function cleanPreorder(input, existing) {
  const days = Array.isArray(input.days) ? DAY_KEYS.filter((d) => input.days.includes(d)) : [];
  if (!days.length) fail('Pick at least one day');
  if (!isTime(input.from) || !isTime(input.to)) fail('Times must look like 13:00');
  if (input.from > input.to) fail('The first time must be before the last');
  if (!isTime(input.cutoffTime)) fail('Cut-off time must look like 20:00');
  const cutoffDays = parseInt(input.cutoffDays, 10);
  if (!(cutoffDays >= 0 && cutoffDays <= 7)) fail('Cut-off must be 0 to 7 days before');
  const every = parseInt(input.every, 10);
  if (![15, 30, 60].includes(every)) fail('Slots must be every 15, 30 or 60 minutes');
  const modes = Array.isArray(input.modes) ? PO_MODES.filter((m) => input.modes.includes(m)) : [];
  if (!modes.length) fail('Pick eat in, take away or collect');
  return {
    id: existing ? existing.id : newId('po'),
    name: text(input.name, 60, 'Name', true),
    blurb: text(input.blurb, 280, 'Description'),
    open: existing ? existing.open : true,
    days, from: input.from, to: input.to, every, cutoffDays, cutoffTime: input.cutoffTime, modes,
    items: existing ? existing.items : []
  };
}

function cleanPoItem(input, existing) {
  const price = money(input.price, 'Price');
  if (price === null) fail('Add a price');
  let limit = null;
  if (input.limit !== '' && input.limit != null) {
    limit = parseInt(input.limit, 10);
    if (!(limit >= 0 && limit <= 10000)) fail('Limit must be a number, or leave it empty');
  }
  return {
    id: existing ? existing.id : newId('pi'),
    name: text(input.name, 80, 'Name', true),
    note: text(input.note, 140, 'Note'),
    price, limit,
    soldOut: existing ? Boolean(existing.soldOut) : false
  };
}

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
      const theme = text(p.theme, 24, 'Theme', true);
      next.storyThemes = next.storyThemes || [];
      if (!next.storyThemes.includes(theme)) {
        if (next.storyThemes.length >= 10) fail('You have 10 themes already. Use one of them or remove one.');
        next.storyThemes.push(theme);
      }
      next.stories = next.stories || [];
      next.stories.push({ id: newId('st'), theme, photo, caption, eventKey: p.eventKey || null, circleOnly: Boolean(p.circleOnly), at: now.toISOString() });
      // Each theme keeps its latest 12 stories; anything older than 90 days drops off.
      const cutoff = now.getTime() - 90 * 86400000;
      const kept = [];
      const perTheme = {};
      for (const st of next.stories.slice().reverse()) {
        perTheme[st.theme] = (perTheme[st.theme] || 0) + 1;
        if (Date.parse(st.at) > cutoff && perTheme[st.theme] <= 12) kept.unshift(st);
      }
      next.stories = kept;
      summary = `Posted to ${theme}${p.circleOnly ? ' (Circle only)' : ''}`;
      break;
    }
    case 'theme.rename': {
      kind = 'story';
      const from = String(p.from || '');
      const to = text(p.to, 24, 'Theme', true);
      const i = (next.storyThemes || []).indexOf(from);
      if (i < 0) fail('That theme no longer exists');
      if (from !== to && next.storyThemes.includes(to)) fail('There is already a theme with that name');
      next.storyThemes[i] = to;
      for (const st of next.stories || []) if (st.theme === from) st.theme = to;
      summary = `Renamed theme ${from} to ${to}`;
      break;
    }
    case 'theme.delete': {
      kind = 'story';
      next.storyThemes = (next.storyThemes || []).filter((t) => t !== p.theme);
      next.stories = (next.stories || []).filter((st) => st.theme !== p.theme);
      summary = `Removed the ${p.theme} theme`;
      break;
    }
    case 'theme.move': {
      kind = 'story';
      const t = next.storyThemes || [];
      const i = t.indexOf(p.theme);
      const j = i + (p.dir === 'up' ? -1 : 1);
      if (i < 0 || j < 0 || j >= t.length) fail('Cannot move that way');
      [t[i], t[j]] = [t[j], t[i]];
      summary = 'Reordered story themes';
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
      summary = 'Updated venue details';
      break;
    }

    // ---- use case and modules ----
    case 'preset.set': {
      kind = 'site';
      if (!TYPES.includes(p.type)) fail('Unknown use case');
      next.venue.type = p.type;
      next.venue.modules = { ...PRESETS[p.type].modules };
      next.venue.home = null;
      summary = `Use case: ${PRESETS[p.type].label}`;
      break;
    }
    case 'module.toggle': {
      kind = 'site';
      const m = MODULES[p.module] || fail('Unknown module');
      if (m.core) fail(`${m.label} is always on: every venue needs it`);
      next.venue.modules[p.module] = !next.venue.modules[p.module];
      summary = `${m.label} ${next.venue.modules[p.module] ? 'on' : 'off'}`;
      break;
    }
    case 'home.move': {
      kind = 'site';
      const order = (next.venue.home && next.venue.home.length ? next.venue.home : PRESETS[next.venue.type].home).slice();
      for (const k of Object.keys(SECTIONS)) if (!order.includes(k)) order.push(k);
      const i = order.indexOf(p.section);
      if (i < 0) fail('Unknown section');
      const j = i + (p.dir === 'up' ? -1 : 1);
      if (j < 0 || j >= order.length) fail('Cannot move that way');
      [order[i], order[j]] = [order[j], order[i]];
      next.venue.home = order;
      summary = `Moved ${SECTIONS[p.section].label} ${p.dir}`;
      break;
    }

    // ---- page content ----
    case 'about.save': {
      kind = 'content';
      next.about = { title: text(p.title, 80, 'Headline'), text: text(p.text, 900, 'Story'), photo: photoId(p.photo) };
      summary = 'Updated About';
      break;
    }
    case 'gallery.add': {
      kind = 'content';
      const photo = photoId(p.photo) || fail('Add a photo');
      next.gallery = next.gallery || [];
      if (next.gallery.length >= 24) fail('The gallery holds 24 photos. Remove one first.');
      next.gallery.push({ id: newId('g'), photo, caption: text(p.caption, 80, 'Caption') });
      summary = 'Added a photo to the gallery';
      break;
    }
    case 'gallery.update': {
      kind = 'content';
      const g = (next.gallery || []).find((x) => x.id === p.id) || fail('That photo no longer exists');
      g.caption = text(p.caption, 80, 'Caption');
      if (p.photo !== undefined) g.photo = photoId(p.photo);
      summary = 'Updated a gallery photo';
      break;
    }
    case 'gallery.delete': {
      kind = 'content';
      next.gallery = (next.gallery || []).filter((x) => x.id !== p.id);
      summary = 'Removed a gallery photo';
      break;
    }
    case 'gallery.move': {
      kind = 'content';
      const i = next.gallery.findIndex((x) => x.id === p.id);
      const j = i + (p.dir === 'up' ? -1 : 1);
      if (i < 0 || j < 0 || j >= next.gallery.length) fail('Cannot move that way');
      [next.gallery[i], next.gallery[j]] = [next.gallery[j], next.gallery[i]];
      summary = 'Reordered the gallery';
      break;
    }
    case 'info.save': {
      kind = 'content';
      const rows = Array.isArray(p.info) ? p.info : [];
      next.info = rows.slice(0, 20).map((r) => ({ q: text(r && r.q, 40, 'Topic'), a: text(r && r.a, 300, 'Answer') })).filter((r) => r.q && r.a);
      summary = `Updated Good to know (${next.info.length} items)`;
      break;
    }
    case 'offer.save': {
      kind = 'offer';
      next.offers = next.offers || [];
      const idx = p.id ? next.offers.findIndex((o) => o.id === p.id) : -1;
      if (p.id && idx < 0) fail('That offer no longer exists');
      if (!isTime(p.from) || !isTime(p.to) || p.from === p.to) fail('Offer times must look like 18:00 and be different');
      const days = Array.isArray(p.days) ? DAY_KEYS.filter((d) => p.days.includes(d)) : [];
      if (!days.length) fail('Pick at least one day');
      const offer = { id: idx >= 0 ? next.offers[idx].id : newId('of'), name: text(p.name, 50, 'Offer name', true), detail: text(p.detail, 160, 'Details'), days, from: p.from, to: p.to };
      if (idx >= 0) next.offers[idx] = offer; else next.offers.push(offer);
      summary = `${idx >= 0 ? 'Updated' : 'Added'} offer: ${offer.name}`;
      break;
    }
    case 'offer.delete': {
      kind = 'offer';
      const o = (next.offers || []).find((x) => x.id === p.id) || fail('That offer no longer exists');
      next.offers = next.offers.filter((x) => x.id !== p.id);
      summary = `Removed offer: ${o.name}`;
      break;
    }
    case 'links.save': {
      kind = 'content';
      const url = (v, f) => { const u = text(v, 300, f); if (u && !/^https:\/\//.test(u)) fail(`${f} must start with https://`); return u; };
      const wa = text(p.whatsapp, 20, 'WhatsApp number').replace(/[^\d+]/g, '');
      const order = Array.isArray(p.order) ? p.order.slice(0, 6).map((o) => ({ label: text(o && o.label, 40, 'Link name'), url: url(o && o.url, 'Link') })).filter((o) => o.label && o.url) : [];
      next.links = { whatsapp: wa, googleReview: url(p.googleReview, 'Google review link'), tripadvisor: url(p.tripadvisor, 'TripAdvisor link'), order, bookingUrl: url(p.bookingUrl, 'Booking system link'), bookingName: text(p.bookingName, 40, 'Booking system name') };
      summary = 'Updated links';
      break;
    }
    case 'hire.save': {
      kind = 'content';
      const spaces = Array.isArray(p.spaces) ? p.spaces.slice(0, 8).map((x) => {
        const name = text(x && x.name, 40, 'Space name');
        const cap = parseInt(x && x.capacity, 10);
        return name ? { name, capacity: cap > 0 && cap < 100000 ? cap : null } : null;
      }).filter(Boolean) : [];
      next.hire = { text: text(p.text, 500, 'Description'), spaces };
      summary = 'Updated Private hire';
      break;
    }
    case 'tables.save': {
      kind = 'tables';
      const times = [...new Set((Array.isArray(p.times) ? p.times : String(p.times || '').split(/[\s,]+/)).map((t) => String(t).trim()).filter(Boolean))];
      for (const t of times) if (!isTime(t)) fail(`Booking times must look like 20:30 (check "${String(t).slice(0, 8)}")`);
      const late = times.find((t) => t < '06:00');
      if (late) fail(`Online booking times run from 06:00 to 23:59 (${late} is after midnight). Take later tables by request`);
      if (times.length > 48) fail('Up to 48 booking times');
      const int = (v, lo, hi, field) => { const n = parseInt(v, 10); if (!(n >= lo && n <= hi)) fail(`${field} must be between ${lo} and ${hi}`); return n; };
      next.tableBooking = {
        mode: p.mode === 'manual' ? 'manual' : 'auto',
        times: times.sort(),
        covers: int(p.covers, 1, 1000, 'Guests per booking time'),
        maxParty: int(p.maxParty, 1, 50, 'Biggest party'),
        notice: int(p.notice, 0, 2880, 'Notice in minutes'),
        daysAhead: int(p.daysAhead, 1, 180, 'Days ahead')
      };
      summary = `Table bookings: ${times.length} times, ${next.tableBooking.covers} guests each, ${next.tableBooking.mode === 'auto' ? 'confirmed automatically' : 'you confirm each one'}`;
      break;
    }
    case 'collect.save': {
      kind = 'collect';
      if (!isTime(p.from) || !isTime(p.to)) fail('Pickup times must look like 12:00');
      if (p.to <= p.from) fail('Pickup ends before it starts');
      const every = [10, 15, 20, 30].includes(Number(p.every)) ? Number(p.every) : 15;
      const notice = parseInt(p.notice, 10);
      if (!(notice >= 0 && notice <= 240)) fail('Notice must be between 0 and 240 minutes');
      next.collect = { open: Boolean(p.open), from: p.from, to: p.to, every, notice };
      summary = `Order ahead ${next.collect.open ? 'open' : 'closed'}, pickup ${p.from} to ${p.to}`;
      break;
    }
    case 'alerts.save': {
      kind = 'alerts';
      const email = text(p.email, 120, 'Alert email');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('That email address does not look right');
      next.alerts = { email };
      summary = email ? `Alerts go to ${email}` : 'Alerts go to the venue email';
      break;
    }
    // ---- pre-orders ----
    case 'preorder.save': {
      kind = 'preorder';
      next.preorders = next.preorders || [];
      const existing = p.id ? findPreorder(next, p.id) : null;
      const po = cleanPreorder(p, existing);
      if (existing) next.preorders[next.preorders.indexOf(existing)] = po; else next.preorders.push(po);
      summary = `${existing ? 'Updated' : 'New'} pre-order: ${po.name}`;
      break;
    }
    case 'preorder.delete': {
      kind = 'preorder';
      const po = findPreorder(next, p.id);
      next.preorders = next.preorders.filter((x) => x !== po);
      summary = `Removed pre-order: ${po.name}`;
      break;
    }
    case 'preorder.open': {
      kind = 'preorder';
      const po = findPreorder(next, p.id);
      po.open = Boolean(p.open);
      summary = `${po.name} ${po.open ? 'taking orders' : 'paused'}`;
      break;
    }
    case 'preorder.item.save': {
      kind = 'preorder';
      const po = findPreorder(next, p.preorderId);
      const existing = p.id ? po.items.find((x) => x.id === p.id) || fail('That item no longer exists') : null;
      const it = cleanPoItem(p, existing);
      if (existing) po.items[po.items.indexOf(existing)] = it; else { if (po.items.length >= 30) fail('That is the most items for one pre-order'); po.items.push(it); }
      summary = `${existing ? 'Updated' : 'Added'} ${it.name} in ${po.name}`;
      break;
    }
    case 'preorder.item.soldout': {
      kind = 'preorder';
      const po = findPreorder(next, p.preorderId);
      const it = po.items.find((x) => x.id === p.id) || fail('That item no longer exists');
      it.soldOut = Boolean(p.soldOut);
      summary = `${it.name} ${it.soldOut ? 'sold out' : 'back on'}`;
      break;
    }
    case 'preorder.item.delete': {
      kind = 'preorder';
      const po = findPreorder(next, p.preorderId);
      const it = po.items.find((x) => x.id === p.id) || fail('That item no longer exists');
      po.items = po.items.filter((x) => x !== it);
      summary = `Removed ${it.name} from ${po.name}`;
      break;
    }
    default:
      fail('Unknown change');
  }

  return { state: next, change: { kind, summary, touchpoints: TOUCHPOINTS[kind] } };
}

module.exports = { applyAction, ActionError, TOUCHPOINTS, LOOKS, TYPES, TAGS };
