'use strict';

const { formatDate } = require('./time');
const { weekHours, whenWord } = require('./schedule');
const { PRESETS, homeSections } = require('./presets');
const { LOOKS } = require('./actions');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = (n) => `€${Number.isInteger(n) ? n : Number(n).toFixed(2)}`;
const enc = encodeURIComponent;
const LOOK_NAMES = { poster: 'Poster wall', gallery: 'Gallery', beach: 'Beach club', dark: 'After dark' };
const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&family=Libre+Franklin:wght@400;500;600&family=Playfair+Display:wght@400;500&family=Space+Grotesk:wght@400;500;700&display=swap';

// ---------- small parts ----------

function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#141210' : '#fbf7ef';
}

function brandStyle(venue) {
  if (!venue.accent) return '';
  const a = venue.accent;
  const ink = inkFor(a);
  return `<style>body[data-look]{--accent:${a};--accent-ink:${ink};--price:${a};--hero-btn:${ink === '#141210' ? '#141210' : '#fbf7ef'};}
body[data-look="poster"],body[data-look="beach"]{--hero-bg:${a};--hero-ink:${ink};--hero-btn:${ink};--hero-btn-ink:${a};}
body[data-look="dark"]{--hero-btn:${a};--hero-btn-ink:${ink};}
body[data-look="gallery"]{--hero-btn:${a};--hero-btn-ink:${ink};}</style>`;
}

function photoBlock(o, cls = '') {
  if (o && o.photo) return `<img class="photo ${cls}" src="/photos/${esc(o.photo)}" alt="${esc(o.name)}" loading="lazy">`;
  const letter = o ? esc(o.name.trim().charAt(0).toUpperCase()) : '·';
  return `<div class="photo photo-empty ${cls}" aria-hidden="true"><span>${letter}</span></div>`;
}

function lineup(o, label) {
  if (!o.lineup.length) return '';
  return `<p class="lineup-label">${esc(label)}</p><ul class="lineup">${o.lineup.map((d) => `<li><span>${esc(d.name)}</span>${d.time ? `<span>${esc(d.time)}</span>` : ''}</li>`).join('')}</ul>`;
}

function placesLeft(o, counts) {
  if (!o.bookable || !o.capacity) return null;
  const taken = (counts[o.key] || {}).guests || 0;
  return Math.max(0, o.capacity - taken);
}

function bookingBadge(o, counts) {
  if (!o.bookable) return '';
  const left = placesLeft(o, counts);
  if (left === 0) return '<span class="badge full">Fully booked</span>';
  if (left !== null && left <= Math.max(6, o.capacity * 0.2)) return `<span class="badge low">${left} left</span>`;
  return `<span class="badge">${o.price ? euro(o.price) : 'Book'}</span>`;
}

// Stories are grouped by theme, like highlights: Tonight, From the kitchen…
function liveStories(ctx) {
  return (ctx.state.stories || []).filter((s) => !s.circleOnly || ctx.member);
}

function storyThemes(ctx) {
  const all = ctx.state.stories || [];
  const order = (ctx.state.storyThemes || []).concat([...new Set(all.map((s) => s.theme))]);
  const seen = new Set();
  const out = [];
  for (const t of order) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    const list = all.filter((s) => s.theme === t).sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
    if (!list.length) continue;
    const visible = list.filter((s) => !s.circleOnly || ctx.member);
    const fresh = list.some((s) => Date.now() - Date.parse(s.at) < 24 * 3600 * 1000);
    out.push({ theme: t, stories: visible, locked: !visible.length, fresh, cover: [...visible].reverse().find((s) => s.photo) || null });
  }
  return out;
}

function storyPayload(groups, ctx) {
  return groups.filter((g) => !g.locked).map((g) => ({
    theme: g.theme,
    stories: g.stories.map((s) => {
      const ev = s.eventKey ? ctx.state.events.find((e) => e.id === s.eventKey.split('@')[0]) : null;
      return { photo: s.photo ? `/photos/${s.photo}` : null, caption: s.caption, circle: s.circleOnly, link: ev ? `/event/${enc(s.eventKey)}` : null, linkText: ev ? ev.name : null };
    })
  }));
}

function storiesRail(ctx) {
  if (!ctx.state.venue.modules.stories) return '';
  const groups = storyThemes(ctx).filter((g) => !g.locked || ctx.state.venue.modules.circle);
  if (!groups.length) return '';
  const json = JSON.stringify(storyPayload(groups, ctx)).replace(/</g, '\\u003c');
  let n = 0;
  return `<section class="wrap stories" aria-label="Stories">
    <div class="rail">
      ${groups.map((g) => g.locked
        ? `<a class="ring ring-locked" href="/circle"><span class="ring-in"><span class="ring-text">🔒</span></span><span class="ring-label">${esc(g.theme)}</span></a>`
        : `<button type="button" class="ring ${g.fresh ? 'ring-new' : 'ring-seen'}" data-story="${n++}" aria-label="Open ${esc(g.theme)} stories">
        <span class="ring-in">${g.cover ? `<img src="/photos/${esc(g.cover.photo)}" alt="">` : `<span class="ring-text">${esc(g.theme.charAt(0))}</span>`}</span>
        <span class="ring-label">${esc(g.theme)}</span></button>`).join('')}
    </div>
    <script type="application/json" id="story-data">${json}</script>
  </section>`;
}

function ago(isoTime) {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(isoTime)) / 60000));
  return mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`;
}

function jsonLd(ctx) {
  const { state, schedule, baseUrl } = ctx;
  const v = state.venue;
  const dayMap = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const types = { cafe: ['CafeOrCoffeeShop'], restaurant: ['Restaurant'], bar: ['BarOrPub'] }[v.type] || ['LocalBusiness'];
  const place = {
    '@context': 'https://schema.org', '@type': types, name: v.name, description: v.tagline, url: baseUrl + '/',
    telephone: v.phone || undefined, email: v.email || undefined,
    address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: v.city, addressCountry: 'ES' },
    openingHoursSpecification: Object.entries(state.hours.weekly).filter(([, s]) => s).map(([k, s]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: dayMap[k], opens: s.open, closes: s.close })),
    hasMenu: v.modules.menu ? state.menus.map((m) => ({
      '@type': 'Menu', name: m.name, url: `${baseUrl}/menu#${m.id}`,
      hasMenuSection: m.sections.map((sec) => ({ '@type': 'MenuSection', name: sec.name,
        hasMenuItem: sec.items.filter((i) => !i.soldOut).map((i) => ({ '@type': 'MenuItem', name: i.name, description: i.note || undefined, offers: { '@type': 'Offer', price: i.price, priceCurrency: 'EUR' } })) }))
    })) : undefined
  };
  const events = [...schedule.tonight, ...schedule.upcoming].filter((o) => !o.circleFirst).slice(0, 12).map((o) => ({
    '@context': 'https://schema.org', '@type': 'Event', name: o.name, description: o.blurb || undefined,
    startDate: `${o.date}T${o.doors || '20:00'}:00`, eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', url: `${baseUrl}/event/${enc(o.key)}`,
    image: o.photo ? `${baseUrl}/photos/${o.photo}` : undefined,
    location: { '@type': 'Place', name: v.name, address: v.address },
    performer: o.lineup.length ? o.lineup.map((d) => ({ '@type': 'Person', name: d.name })) : undefined,
    offers: o.bookable ? { '@type': 'Offer', price: o.price || 0, priceCurrency: 'EUR', url: `${baseUrl}/event/${enc(o.key)}#book` } : undefined
  }));
  return `<script type="application/ld+json">${JSON.stringify([place, ...events]).replace(/</g, '\\u003c')}</script>`;
}

function layout(ctx, { title, description, body, ogImage }) {
  const { state, status, look, demo, version, L } = ctx;
  const v = state.venue;
  const M = v.modules;
  const nav = [['/', 'Home']];
  if (M.events) nav.push(['/whats-on', L.whatsOn]);
  if (M.menu) nav.push(['/menu', 'Menu']);
  if (M.about || M.gallery) nav.push(['/about', 'About']);
  if (M.circle) nav.push(['/circle', ctx.member ? 'Circle ✓' : 'The Circle']);
  nav.push(['/visit', 'Visit']);
  const path = ctx.path.split('?')[0];
  const q = (k, val) => { const p = new URLSearchParams({ look, usecase: v.type }); p.set(k, val); return `${esc(path)}?${p.toString()}`; };
  const demoBar = demo ? `
  <div class="demo-bar" role="region" aria-label="Demo controls">
    <div class="demo-row"><span class="demo-label">Use case</span>
    ${Object.keys(PRESETS).map((k) => `<a href="${q('usecase', k)}" class="${k === v.type ? 'on' : ''}" aria-current="${k === v.type}">${esc(PRESETS[k].label)}</a>`).join('')}</div>
    <div class="demo-row"><span class="demo-label">Style</span>
    ${LOOKS.map((l) => `<a href="${q('look', l)}" class="${l === look ? 'on' : ''}" aria-current="${l === look}">${LOOK_NAMES[l]}</a>`).join('')}
    <a class="demo-edit" href="/admin" target="_blank" rel="noopener">Open the editor ↗</a></div>
  </div>` : '';
  const bookBtn = M.tables ? '<a class="btn btn-accent" href="/book">Book</a>' : M.events ? `<a class="btn btn-accent" href="/whats-on">${esc(L.whatsOn)}</a>` : `<a class="btn btn-accent" href="/visit">Find us</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || v.tagline)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description || v.tagline)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_URL}">
<link rel="stylesheet" href="/site.css?v=7">
${jsonLd(ctx)}
</head>
<body data-look="${esc(look)}" data-version="${version}">
${brandStyle(v)}
${demo ? `<div class="pulse-banner" role="region" aria-label="About this demo"><div class="row"><span><b>Sample venue.</b> Marea shows what Pulse can do. We design yours around your brand and keep every channel in step.</span><a href="/pulse">Get this for your venue →</a></div></div>` : ''}
${demoBar}
<header class="masthead">
  <div class="wrap masthead-row">
    <a class="logo" href="/">${esc(v.name)}</a>
    <nav aria-label="Main">${nav.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join('')}</nav>
    <span class="status ${status.open ? 'is-open' : 'is-closed'}" data-live="status"><i></i>${esc(status.label)}</span>
    ${bookBtn}
  </div>
</header>
<main id="main" data-live="main">
${body}
</main>
<footer class="foot">
  <div class="wrap foot-row">
    <span>${esc(v.name)} · ${esc(v.address)}</span>
    <span>${v.instagram ? `<a href="https://instagram.com/${esc(v.instagram)}" rel="noopener">@${esc(v.instagram)}</a> · ` : ''}${v.email ? `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>` : ''}</span>
  </div>
</footer>
<div class="toast" data-toast hidden>Updated just now</div>
<div class="viewer" data-viewer hidden></div>
<script src="/site.js?v=5" defer></script>
</body>
</html>`;
}

function eventCard(o, i, ctx) {
  return `<a class="card card-${i % 4}" href="/event/${enc(o.key)}">
    <span class="kicker">${esc(whenWord(o, ctx.schedule.today) || formatDate(o.date, 'en', 'short'))}${o.doors ? ` · ${esc(o.doors)}` : ''}${o.circleFirst ? ' · Circle first' : ''}</span>
    <span class="card-title">${esc(o.name)}</span>
    ${o.lineup.length ? `<span class="card-meta">${esc(o.lineup.map((d) => d.name).join(', '))}</span>` : o.blurb ? `<span class="card-meta">${esc(o.blurb)}</span>` : ''}
    ${bookingBadge(o, ctx.counts)}
  </a>`;
}

function itemRows(items) {
  return items.map((m) => `<li class="dish ${m.soldOut ? 'sold' : ''}" data-tags="${esc(m.tags.join(','))}">
    <span class="dish-main"><span class="dish-name">${esc(m.name)}</span>${m.note || m.tags.length ? `<span class="dish-note">${esc(m.note)}${m.tags.length ? ` <span class="tags">${m.tags.map((t) => `<b>${esc(t)}</b>`).join('')}</span>` : ''}</span>` : ''}</span>
    <span class="dish-price">${m.soldOut ? 'Sold out' : euro(m.price)}</span>
  </li>`).join('');
}

function menuTimes(m) {
  if (m.allDay) return 'All day';
  const days = m.days.length === 7 ? 'Every day' : m.days.map((d) => DAY_SHORT[d]).join(', ');
  return `${days} · ${m.from} to ${m.to}`;
}

function visitBlock(ctx) {
  const { state, status } = ctx;
  const v = state.venue;
  const today = status.today;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${enc(v.name + ' ' + v.address)}`;
  return `<section class="wrap section visit" id="visit">
    <h2 class="label">Visit</h2>
    <div class="visit-grid">
      <div>
        <p class="big">${status.special ? (today ? `Today only: ${esc(today.open)} to ${esc(today.close)}` : 'Closed today') : esc(status.label)}</p>
        <ul class="hours">${weekHours(state).map((h) => `<li><span>${h.day}</span><span>${esc(h.text)}</span></li>`).join('')}</ul>
      </div>
      <div>
        <p class="big">${esc(v.address)}</p>
        <p class="actions"><a class="btn btn-line" href="${esc(mapUrl)}" rel="noopener">Directions</a>${v.phone ? `<a class="btn btn-line" href="tel:${esc(v.phone.replace(/\s/g, ''))}">Call</a>` : ''}</p>
      </div>
    </div>
  </section>`;
}

function circleBand(ctx, src = 'home') {
  if (!ctx.state.venue.modules.circle) return '';
  if (ctx.member) {
    return `<section class="wrap section"><div class="circle-band"><div><span class="kicker">The Circle</span><p class="big">You're in, ${esc(ctx.member.name)}. You see new events and stories first.</p></div><a class="btn btn-hero" href="/circle">Circle page</a></div></section>`;
  }
  return `<section class="wrap section"><div class="circle-band">
    <div><span class="kicker">The Circle</span><p class="big">Hear first. Book first.</p><p>New events reach members before anyone else, plus stories only the Circle sees. Free.</p></div>
    <form class="circle-form" method="post" action="/circle">
      <label class="sr">Your name<input name="name" placeholder="Your name" required maxlength="80" autocomplete="name"></label>
      <label class="sr">Email<input name="email" type="email" placeholder="Email" required maxlength="120" autocomplete="email"></label>
      <label class="consent"><input type="checkbox" name="consent" value="1" required> Email me about new events. I can leave any time.</label>
      <input type="hidden" name="src" value="${esc(src)}">
      <label class="hp" aria-hidden="true">Leave empty<input name="website" tabindex="-1" autocomplete="off"></label>
      <button class="btn btn-hero" type="submit">Join the Circle</button>
    </form>
  </div></section>`;
}

// ---------- pages ----------

// ---------- home sections ----------

function placePhoto(state) {
  if (state.about && state.about.photo) return { photo: state.about.photo, name: state.venue.name };
  const g = (state.gallery || []).find((x) => x.photo);
  return g ? { photo: g.photo, name: state.venue.name } : { photo: null, name: state.venue.name };
}

function mapsUrl(v) { return `https://www.google.com/maps/search/?api=1&query=${enc(v.name + ' ' + v.address)}`; }

const SECTION = {
  hero(ctx) {
    const { state, schedule, L } = ctx;
    const v = state.venue, M = v.modules;
    const next = M.events ? schedule.tonight[0] || schedule.upcoming[0] : null;
    const presetHero = (PRESETS[v.type] || PRESETS.bar).hero;
    if (presetHero === 'event' && next) {
      ctx.heroEvent = next;
      const label = schedule.tonight[0] ? `${whenWord(next, schedule.today)} · ${formatDate(next.date)}` : `Next up · ${formatDate(next.date)}`;
      return `<section class="wrap hero"><div class="hero-card"><div class="hero-text">
        <span class="kicker">${esc(label)}</span><h1>${esc(next.name)}</h1>
        <p class="lede">${next.doors ? `From ${esc(next.doors)}. ` : ''}${esc(next.blurb)}</p>${lineup(next, L.lineup)}
        <p class="actions">${next.bookable && M.bookings ? `<a class="btn btn-hero" href="/event/${enc(next.key)}#book">${placesLeft(next, ctx.counts) === 0 ? 'Fully booked' : 'Book this'}</a>` : M.tables ? '<a class="btn btn-hero" href="/book">Book a table</a>' : ''}<a class="btn btn-line" href="/event/${enc(next.key)}">Details</a></p>
      </div>${photoBlock(next, 'hero-photo')}</div></section>`;
    }
    const serving = ctx.menus.find((m) => m.active);
    const offer = M.offers ? ctx.offers.find((o) => o.active) : null;
    return `<section class="wrap hero"><div class="hero-card"><div class="hero-text">
      <span class="kicker">${esc(ctx.status.label)}${serving ? ` · Serving ${esc(serving.name.toLowerCase())}` : ''}</span>
      <h1>${esc(v.name)}</h1>
      <p class="lede">${esc(v.tagline)}</p>
      ${offer ? `<p class="hero-offer"><b>On now:</b> ${esc(offer.name)}. ${esc(offer.detail)}</p>` : ''}
      <p class="actions">${M.menu ? `<a class="btn btn-hero" href="/menu">See the menu</a>` : ''}${M.tables ? '<a class="btn btn-line" href="/book">Book a table</a>' : ''}<a class="btn btn-line" href="${esc(mapsUrl(v))}" rel="noopener">Directions</a></p>
    </div>${photoBlock(placePhoto(state), 'hero-photo')}</div></section>`;
  },
  stories(ctx) { return storiesRail(ctx); },
  events(ctx) {
    const { schedule, L } = ctx;
    const list = [...schedule.tonight, ...schedule.upcoming].filter((o) => o !== ctx.heroEvent).slice(0, 4);
    if (!list.length) return '';
    return `<section class="wrap section"><div class="section-head"><h2 class="label">Coming up</h2><a href="/whats-on">All ${esc(L.events.toLowerCase())} →</a></div>
      <div class="cards">${list.map((o, i) => eventCard(o, i, ctx)).join('')}</div></section>`;
  },
  menu(ctx) {
    const now = ctx.menus.find((m) => m.active) || ctx.menus.find((m) => m.laterToday);
    if (!now) return '';
    const items = now.sections.flatMap((x) => x.items).slice(0, 6);
    return `<section class="wrap section"><div class="section-head"><h2 class="label">${now.active ? 'Serving now' : 'Later today'} · ${esc(now.name)} <span class="when">${now.allDay ? 'all day' : `${esc(now.from)}–${esc(now.to)}`}</span></h2><a href="/menu#${esc(now.id)}">Full menu →</a></div>
      <ul class="menu-list two-col">${itemRows(items)}</ul></section>`;
  },
  offers(ctx) {
    const list = ctx.offers.filter((o) => o.today).concat(ctx.offers.filter((o) => !o.today)).slice(0, 4);
    if (!list.length) return '';
    return `<section class="wrap section"><h2 class="label">Offers</h2><div class="offers">${list.map((o) => `<div class="offer ${o.active ? 'on' : ''}">
      <span class="kicker">${o.active ? 'On now' : o.today ? `Today ${esc(o.from)}–${esc(o.to)}` : `${esc(dayList(o.days))} · ${esc(o.from)}–${esc(o.to)}`}</span>
      <b>${esc(o.name)}</b><span>${esc(o.detail)}</span></div>`).join('')}</div></section>`;
  },
  about(ctx) {
    const a = ctx.state.about || {};
    if (!a.text && !a.title) return '';
    return `<section class="wrap section"><div class="about">
      <div><h2 class="label">About</h2>${a.title ? `<p class="about-title">${esc(a.title)}</p>` : ''}<p class="about-text">${esc(a.text)}</p>
      <p><a href="/about">More about us →</a></p></div>
      ${photoBlock({ photo: a.photo, name: ctx.state.venue.name }, 'about-photo')}</div></section>`;
  },
  gallery(ctx) {
    const g = (ctx.state.gallery || []).slice(0, 6);
    if (!g.length) return '';
    return `<section class="wrap section"><div class="section-head"><h2 class="label">Gallery</h2><a href="/about#gallery">All photos →</a></div>${galleryGrid(g)}</section>`;
  },
  hire(ctx) {
    const h = ctx.state.hire || {};
    if (!h.text) return '';
    return `<section class="wrap section"><div class="hire"><div><h2 class="label">Private hire</h2><p class="big">${esc(h.text)}</p>
      <p class="actions"><a class="btn btn-accent" href="/book?type=private">Ask about a date</a></p></div>
      ${h.spaces && h.spaces.length ? `<ul class="hours">${h.spaces.map((x) => `<li><span>${esc(x.name)}</span><span>${x.capacity ? `up to ${x.capacity}` : ''}</span></li>`).join('')}</ul>` : ''}</div></section>`;
  },
  order(ctx) {
    const links = ((ctx.state.links || {}).order || []);
    if (!links.length) return '';
    return `<section class="wrap section"><h2 class="label">Order and gifts</h2><p class="actions">${links.map((l) => `<a class="btn btn-line" href="${esc(l.url)}" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</p></section>`;
  },
  circle(ctx) { return circleBand(ctx); },
  reviews(ctx) {
    const l = ctx.state.links || {};
    if (!l.googleReview && !l.tripadvisor) return '';
    return `<section class="wrap section"><div class="reviews"><p class="big">Been in? A review helps more than you think.</p><p class="actions">
      ${l.googleReview ? `<a class="btn btn-line" href="${esc(l.googleReview)}" rel="noopener">Review on Google ↗</a>` : ''}${l.tripadvisor ? `<a class="btn btn-line" href="${esc(l.tripadvisor)}" rel="noopener">Review on TripAdvisor ↗</a>` : ''}</p></div></section>`;
  },
  visit(ctx) { return visitBlock(ctx); },
  info(ctx) {
    const rows = ctx.state.info || [];
    if (!rows.length) return '';
    return `<section class="wrap section" id="info"><h2 class="label">Good to know</h2><dl class="info">${rows.map((r) => `<div><dt>${esc(r.q)}</dt><dd>${esc(r.a)}</dd></div>`).join('')}</dl></section>`;
  }
};

function dayList(days) {
  if (days.length === 7) return 'Every day';
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const idx = days.map((d) => order.indexOf(d)).sort((x, y) => x - y);
  const run = idx.every((n, i) => i === 0 || n === idx[i - 1] + 1);
  return run && idx.length > 2 ? `${DAY_SHORT[order[idx[0]]]}–${DAY_SHORT[order[idx[idx.length - 1]]]}` : idx.map((n) => DAY_SHORT[order[n]]).join(', ');
}

function galleryGrid(items) {
  return `<div class="gallery">${items.map((g, i) => `<figure class="g g-${i % 6}">${g.photo ? `<img src="/photos/${esc(g.photo)}" alt="${esc(g.caption)}" loading="lazy">` : `<div class="photo-empty"><span>${esc((g.caption || '·').charAt(0))}</span></div>`}${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`;
}

function homePage(ctx) {
  const v = ctx.state.venue;
  ctx.heroEvent = null;
  const body = homeSections(v).map((k) => SECTION[k] ? SECTION[k](ctx) : '').join('\n');
  return layout(ctx, { title: `${v.name} · ${v.tagline}`, body });
}

function aboutPage(ctx) {
  const { state } = ctx;
  const a = state.about || {};
  const M = state.venue.modules;
  const body = `<section class="wrap section page-top"><h1 class="page-title">About ${esc(state.venue.name)}</h1>
    ${M.about ? `<div class="about"><div>${a.title ? `<p class="about-title">${esc(a.title)}</p>` : ''}<p class="about-text">${esc(a.text)}</p></div>${photoBlock({ photo: a.photo, name: state.venue.name }, 'about-photo')}</div>` : ''}</section>
    ${M.gallery && (state.gallery || []).length ? `<section class="wrap section" id="gallery"><h2 class="label">Gallery</h2>${galleryGrid(state.gallery)}</section>` : ''}
    ${M.hire ? SECTION.hire(ctx) : ''}`;
  return layout(ctx, { title: `About · ${state.venue.name}`, body });
}

function visitPage(ctx) {
  const { state } = ctx;
  const v = state.venue, M = v.modules, l = state.links || {};
  const body = `<section class="wrap section page-top"><h1 class="page-title">Visit</h1>
    <p class="actions">
      <a class="btn btn-accent" href="${esc(mapsUrl(v))}" rel="noopener">Directions</a>
      ${v.phone ? `<a class="btn btn-line" href="tel:${esc(v.phone.replace(/\s/g, ''))}">Call</a>` : ''}
      ${l.whatsapp ? `<a class="btn btn-line" href="https://wa.me/${esc(l.whatsapp.replace(/\D/g, ''))}" rel="noopener">WhatsApp</a>` : ''}
      ${v.email ? `<a class="btn btn-line" href="mailto:${esc(v.email)}">Email</a>` : ''}
    </p></section>
    ${visitBlock(ctx)}
    ${M.info ? SECTION.info(ctx) : ''}
    ${M.order ? SECTION.order(ctx) : ''}
    ${M.reviews ? SECTION.reviews(ctx) : ''}`;
  return layout(ctx, { title: `Visit · ${state.venue.name}`, body });
}

function whatsOnPage(ctx) {
  const { state, schedule, L } = ctx;
  const upcoming = [...schedule.tonight, ...schedule.upcoming];
  const body = `
<section class="wrap section page-top">
  <h1 class="page-title">${esc(L.whatsOn)}</h1>
  ${upcoming.length ? `<div class="cards">${upcoming.map((o, i) => eventCard(o, i, ctx)).join('')}</div>` : '<p>Nothing announced yet. Check back soon.</p>'}
</section>
${circleBand(ctx, 'whatson')}
${schedule.past.length ? `<section class="wrap section archive">
  <h2 class="label">Past ${esc(L.events.toLowerCase())}</h2>
  <ul class="archive-list">${schedule.past.slice(0, 16).map((o) => {
    const n = (state.stories || []).filter((s) => s.eventKey === o.key && !s.circleOnly).length;
    return `<li><a href="/event/${enc(o.key)}"><span>${esc(formatDate(o.date, 'en', 'short'))}</span><span>${esc(o.name)}</span><span>${n ? `${n} moment${n > 1 ? 's' : ''}` : esc(o.lineup.map((d) => d.name).join(', '))}</span></a></li>`;
  }).join('')}</ul>
</section>` : ''}`;
  return layout(ctx, { title: `${L.whatsOn} · ${state.venue.name}`, body });
}

function menuPage(ctx) {
  const { state } = ctx;
  const menus = ctx.menus;
  const first = menus.find((m) => m.active) || menus[0];
  const body = `
<section class="wrap section page-top">
  <h1 class="page-title">Menu</h1>
  <div class="menu-tabs" role="tablist" aria-label="Menus">
    ${menus.map((m) => `<a role="tab" href="#${esc(m.id)}" class="menu-tab ${m === first ? 'on' : ''}" aria-selected="${m === first}" data-menu-tab="${esc(m.id)}">${esc(m.name)}${m.active ? ' <i>now</i>' : ''}</a>`).join('')}
  </div>
  <div class="filters" role="group" aria-label="Filter the menu">
    <button type="button" class="chip on" data-filter="">Everything</button>
    <button type="button" class="chip" data-filter="vegan">Vegan</button>
    <button type="button" class="chip" data-filter="vegetarian">Vegetarian</button>
    <button type="button" class="chip" data-filter="gluten free">Gluten free</button>
  </div>
  ${menus.map((m) => `<div class="menu-panel" id="${esc(m.id)}" data-menu-panel="${esc(m.id)}" ${m === first ? '' : 'hidden'}>
    <p class="menu-when">${m.active ? '<b class="now">Serving now</b> · ' : ''}${esc(menuTimes(m))}</p>
    ${m.sections.filter((s) => s.items.length).map((s) => `<h2 class="label menu-sec">${esc(s.name)}</h2><ul class="menu-list">${itemRows(s.items)}</ul>`).join('')}
  </div>`).join('')}
  <p class="small">Allergies? Ask us and we will check every dish.</p>
</section>`;
  return layout(ctx, { title: `Menu · ${state.venue.name}`, body });
}

function bookPage(ctx, { sent = false, error = '', values = {} } = {}) {
  const { state } = ctx;
  const body = `
<section class="wrap section page-top narrow">
  <h1 class="page-title">Book</h1>
  ${sent ? `<div class="notice ok" role="status"><b>Thanks, we have it.</b> We reply within a few hours, usually sooner.</div>` : `
  <p class="lede">Tables, groups and private hire. Every request lands in one place and gets a reply.${ctx.state.venue.modules.events ? " For an event, book on the event's own page so your place is held." : ''}</p>
  ${error ? `<div class="notice bad" role="alert">${esc(error)}</div>` : ''}
  <form class="form" method="post" action="/book">
    <fieldset class="types"><legend>What for?</legend>
      ${[['table', 'A table'], ['private', 'Private hire'], ['other', 'Something else']].map(([k, l], i) => `<label><input type="radio" name="type" value="${k}" ${values.type === k || (!values.type && i === 0) ? 'checked' : ''}> <span>${l}</span></label>`).join('')}
    </fieldset>
    <label>Your name<input name="name" required maxlength="80" autocomplete="name" value="${esc(values.name)}"></label>
    <label>Phone or email<input name="contact" required maxlength="120" autocomplete="email" value="${esc(values.contact)}"></label>
    <div class="row2">
      <label>Date<input type="date" name="date" value="${esc(values.date)}"></label>
      <label>Guests<input type="number" name="guests" min="1" max="500" inputmode="numeric" value="${esc(values.guests)}"></label>
    </div>
    <label>Anything else<textarea name="message" rows="3" maxlength="1000">${esc(values.message)}</textarea></label>
    <label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
    <input type="hidden" name="src" value="${esc(values.src || '')}">
    <button class="btn btn-accent btn-big" type="submit">Send request</button>
  </form>`}
</section>`;
  return layout(ctx, { title: `Book · ${state.venue.name}`, body });
}

function eventBooking(ctx, o, form) {
  if (!o.bookable || !ctx.state.venue.modules.bookings || o.status === 'past') return '';
  const left = placesLeft(o, ctx.counts);
  if (form.sent) return `<div class="notice ok" id="book" role="status"><b>You're booked, ${esc(form.sent.name)}.</b> ${esc(form.sent.guests)} ${form.sent.guests > 1 ? 'places' : 'place'} for ${esc(o.name)} on ${esc(formatDate(o.date))}.${o.price ? ` Pay ${euro(o.price * form.sent.guests)} on the day.` : ''}</div>`;
  if (left === 0) return `<div class="notice bad" id="book">Fully booked. <a href="/book">Ask about the waiting list</a>.</div>`;
  const v = form.values || {};
  return `<form class="form booking" method="post" action="/event/${enc(o.key)}#book" id="book">
    <h2 class="label">Book your place${o.price ? ` · ${euro(o.price)} each, pay on the day` : ''}${left !== null ? ` · ${left} left` : ''}</h2>
    ${form.error ? `<div class="notice bad" role="alert">${esc(form.error)}</div>` : ''}
    <div class="row2">
      <label>Your name<input name="name" required maxlength="80" autocomplete="name" value="${esc(v.name || (ctx.member ? ctx.member.name : ''))}"></label>
      <label>Guests<input type="number" name="guests" min="1" max="${Math.min(20, left || 20)}" value="${esc(v.guests || 2)}" inputmode="numeric" required></label>
    </div>
    <label>Phone or email<input name="contact" required maxlength="120" autocomplete="email" value="${esc(v.contact || (ctx.member ? ctx.member.email : ''))}"></label>
    <label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
    <input type="hidden" name="src" value="${esc(v.src || '')}">
    <button class="btn btn-accent btn-big" type="submit">Book</button>
  </form>`;
}

function eventPage(ctx, o, form = {}) {
  const { state, baseUrl, L, schedule } = ctx;
  const label = o.status === 'past' ? 'Past' : whenWord(o, schedule.today) || formatDate(o.date);
  const moments = (state.stories || []).filter((s) => s.eventKey === o.key && (!s.circleOnly || ctx.member));
  const body = `
<section class="wrap hero">
  <div class="hero-card">
    <div class="hero-text">
      <span class="kicker">${esc(label)} · ${esc(formatDate(o.date))}${o.circleFirst ? ' · Circle first' : ''}</span>
      <h1>${esc(o.name)}</h1>
      <p class="lede">${o.doors ? `From ${esc(o.doors)}. ` : ''}${esc(o.blurb)}</p>
      ${lineup(o, L.lineup)}
      ${o.status === 'past' ? '<p class="small">This has finished. See what is coming up next.</p><p class="actions"><a class="btn btn-hero" href="/whats-on">What\'s on</a></p>' : ''}
    </div>
    ${photoBlock(o, 'hero-photo')}
  </div>
</section>
<section class="wrap section narrow">${eventBooking(ctx, o, form)}</section>
${moments.length ? `<section class="wrap section"><h2 class="label">Moments from the ${esc(L.event.toLowerCase())}</h2>
  <div class="moments">${moments.map((s) => `<figure class="moment">${s.photo ? `<img src="/photos/${esc(s.photo)}" alt="" loading="lazy">` : ''}<figcaption>${esc(s.caption)}</figcaption></figure>`).join('')}</div></section>` : ''}`;
  return layout(ctx, {
    title: `${o.name} · ${formatDate(o.date, 'en', 'short')} · ${state.venue.name}`,
    description: `${formatDate(o.date)}${o.doors ? `, from ${o.doors}` : ''}. ${o.blurb}`,
    ogImage: o.photo ? `${baseUrl}/photos/${o.photo}` : null, body
  });
}

function circlePage(ctx, { joined = false, error = '' } = {}) {
  const { state, schedule } = ctx;
  let body;
  if (ctx.member) {
    const early = [...schedule.tonight, ...schedule.upcoming].filter((o) => o.circleFirst);
    const circleStories = (state.stories || []).filter((s) => s.circleOnly).slice(-6).reverse();
    body = `<section class="wrap section page-top narrow">
      <h1 class="page-title">The Circle</h1>
      ${joined ? '<div class="notice ok" role="status"><b>Welcome in.</b> Keep this page: it is your key. We have also remembered you on this phone.</div>' : ''}
      <p class="lede">Hi ${esc(ctx.member.name)}. Here is what members see first.</p>
    </section>
    <section class="wrap section"><h2 class="label">Before everyone else</h2>
      ${early.length ? `<div class="cards">${early.map((o, i) => eventCard(o, i, ctx)).join('')}</div>` : '<p>Nothing secret right now. You will see new events here first.</p>'}
    </section>
    ${circleStories.length ? `<section class="wrap section"><h2 class="label">Circle stories</h2><div class="moments">${circleStories.map((s) => `<figure class="moment">${s.photo ? `<img src="/photos/${esc(s.photo)}" alt="">` : ''}<figcaption>${esc(s.caption)}</figcaption></figure>`).join('')}</div></section>` : ''}`;
  } else {
    body = `<section class="wrap section page-top narrow">
      <h1 class="page-title">The Circle</h1>
      ${error ? `<div class="notice bad" role="alert">${esc(error)}</div>` : ''}
    </section>${circleBand(ctx, 'circle')}`;
  }
  return layout(ctx, { title: `The Circle · ${state.venue.name}`, body });
}

function notFoundPage(ctx) {
  return layout(ctx, { title: 'Not found', body: '<section class="wrap section page-top"><h1 class="page-title">Not found</h1><p><a href="/">Back to the home page</a></p></section>' });
}

module.exports = { homePage, aboutPage, visitPage, whatsOnPage, menuPage, bookPage, eventPage, circlePage, notFoundPage, esc, liveStories };
