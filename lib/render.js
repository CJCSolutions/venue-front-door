'use strict';

const { formatDate } = require('./time');
const { weekHours } = require('./schedule');
const { LOOKS } = require('./actions');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = (n) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&family=Libre+Franklin:wght@400;500;600&family=Playfair+Display:wght@400;500&family=Space+Grotesk:wght@400;500;700&display=swap';

function photoBlock(o, cls = '') {
  if (o && o.photo) return `<img class="photo ${cls}" src="/photos/${esc(o.photo)}" alt="${esc(o.name)}" loading="lazy">`;
  const letter = o ? esc(o.name.trim().charAt(0).toUpperCase()) : 'M';
  return `<div class="photo photo-empty ${cls}" aria-hidden="true"><span>${letter}</span></div>`;
}

function lineup(o) {
  if (!o.djs.length) return '';
  return `<ul class="lineup">${o.djs.map((d) => `<li><span>${esc(d.name)}</span>${d.time ? `<span>${esc(d.time)}</span>` : ''}</li>`).join('')}</ul>`;
}

function jsonLd(ctx) {
  const { state, schedule, baseUrl } = ctx;
  const v = state.venue;
  const dayMap = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const place = {
    '@context': 'https://schema.org',
    '@type': ['Restaurant', 'BarOrPub'],
    name: v.name,
    description: v.tagline,
    url: baseUrl + '/',
    telephone: v.phone || undefined,
    email: v.email || undefined,
    address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: v.city, addressCountry: 'ES' },
    openingHoursSpecification: Object.entries(state.hours.weekly).filter(([, s]) => s).map(([k, s]) => ({
      '@type': 'OpeningHoursSpecification', dayOfWeek: dayMap[k], opens: s.open, closes: s.close
    })),
    hasMenu: {
      '@type': 'Menu',
      url: baseUrl + '/menu',
      hasMenuSection: ['Food', 'Drinks', 'Specials'].map((sec) => ({
        '@type': 'MenuSection', name: sec,
        hasMenuItem: state.menu.filter((m) => m.section === sec && !m.soldOut).map((m) => ({
          '@type': 'MenuItem', name: m.name, description: m.note || undefined,
          offers: { '@type': 'Offer', price: m.price, priceCurrency: 'EUR' }
        }))
      })).filter((s) => s.hasMenuItem.length)
    }
  };
  const events = [...schedule.tonight, ...schedule.upcoming].slice(0, 10).map((o) => ({
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: o.name,
    description: o.blurb || undefined,
    startDate: `${o.date}T${o.doors || '20:00'}:00`,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: `${baseUrl}/night/${encodeURIComponent(o.key)}`,
    image: o.photo ? `${baseUrl}/photos/${o.photo}` : undefined,
    location: { '@type': 'Place', name: v.name, address: v.address },
    performer: o.djs.map((d) => ({ '@type': 'Person', name: d.name }))
  }));
  const json = JSON.stringify([place, ...events]).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function layout(ctx, { title, description, body, path, ogImage }) {
  const { state, status, look, demo, version } = ctx;
  const v = state.venue;
  const nav = [['/', 'Home'], ['/whats-on', "What's on"], ['/menu', 'Menu'], ['/#visit', 'Visit']];
  const demoBar = demo ? `
  <div class="demo-bar" role="region" aria-label="Demo controls">
    <span class="demo-label">Demo · look</span>
    ${LOOKS.map((l) => `<a href="${esc(path.split('?')[0])}?look=${l}" class="${l === look ? 'on' : ''}" aria-current="${l === look ? 'true' : 'false'}">${{ poster: 'Poster wall', gallery: 'Gallery', beach: 'Beach club', dark: 'After dark' }[l]}</a>`).join('')}
    <a class="demo-edit" href="/admin" target="_blank" rel="noopener">Open the editor ↗</a>
  </div>` : '';
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
<link rel="stylesheet" href="/site.css?v=3">
${jsonLd(ctx)}
</head>
<body data-look="${esc(look)}" data-version="${version}">
${demoBar}
<header class="masthead">
  <div class="wrap masthead-row">
    <a class="logo" href="/">${esc(v.name)}</a>
    <nav aria-label="Main">${nav.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav>
    <span class="status ${status.open ? 'is-open' : 'is-closed'}" data-live="status"><i></i>${esc(status.label)}</span>
    <a class="btn btn-accent" href="/book">Book a table</a>
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
<script src="/site.js?v=3" defer></script>
</body>
</html>`;
}

function nightCard(o, i, { showDate = true } = {}) {
  return `<a class="card card-${i % 4}" href="/night/${encodeURIComponent(o.key)}">
    <span class="kicker">${showDate ? esc(formatDate(o.date, 'en', 'short')) : ''}${o.doors ? ` · ${esc(o.doors)}` : ''}</span>
    <span class="card-title">${esc(o.name)}</span>
    ${o.djs.length ? `<span class="card-meta">${esc(o.djs.map((d) => d.name).join(', '))}</span>` : o.blurb ? `<span class="card-meta">${esc(o.blurb)}</span>` : ''}
  </a>`;
}

function menuRows(items) {
  return items.map((m) => `<li class="dish ${m.soldOut ? 'sold' : ''}" data-tags="${esc(m.tags.join(','))}">
    <span class="dish-main"><span class="dish-name">${esc(m.name)}</span>${m.note || m.tags.length ? `<span class="dish-note">${esc(m.note)}${m.tags.length ? ` <span class="tags">${m.tags.map((t) => `<b>${esc(t)}</b>`).join('')}</span>` : ''}</span>` : ''}</span>
    <span class="dish-price">${m.soldOut ? 'Sold out' : euro(m.price)}</span>
  </li>`).join('');
}

function visitBlock(ctx) {
  const { state, status } = ctx;
  const v = state.venue;
  const today = status.today;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name + ' ' + v.address)}`;
  return `<section class="wrap section visit" id="visit">
    <h2 class="label">Visit</h2>
    <div class="visit-grid">
      <div>
        <p class="big">${status.special ? (today ? `Today only: ${esc(today.open)} to ${esc(today.close)}` : 'Closed today') : esc(status.label)}</p>
        <ul class="hours">${weekHours(state).map((h) => `<li><span>${h.day}</span><span>${esc(h.text)}</span></li>`).join('')}</ul>
      </div>
      <div>
        <p class="big">${esc(v.address)}</p>
        <p><a class="btn btn-line" href="${esc(mapUrl)}" rel="noopener">Directions</a> ${v.phone ? `<a class="btn btn-line" href="tel:${esc(v.phone.replace(/\s/g, ''))}">Call</a>` : ''}</p>
      </div>
    </div>
  </section>`;
}

function homePage(ctx) {
  const { state, schedule } = ctx;
  const v = state.venue;
  const hero = schedule.tonight[0];
  const next = hero || schedule.upcoming[0];
  const heroLabel = hero ? `Tonight · ${formatDate(hero.date)}` : next ? `Next up · ${formatDate(next.date)}` : 'Coming soon';
  const week = schedule.upcoming.filter((o) => o !== next).slice(0, 4);
  const teaser = state.menu.filter((m) => m.section !== 'Drinks').slice(0, 6);

  const body = `
<section class="wrap hero">
  <div class="hero-card">
    <div class="hero-text">
      <span class="kicker">${esc(heroLabel)}</span>
      <h1>${next ? esc(next.name) : esc(v.tagline)}</h1>
      ${next ? `<p class="lede">${next.doors ? `Doors ${esc(next.doors)}. ` : ''}${esc(next.blurb)}</p>${lineup(next)}` : ''}
      <p class="actions"><a class="btn btn-hero" href="/book">Book a table</a>${next ? `<a class="btn btn-line" href="/night/${encodeURIComponent(next.key)}">See the night</a>` : ''}</p>
    </div>
    ${photoBlock(next, 'hero-photo')}
  </div>
</section>

${week.length ? `<section class="wrap section">
  <div class="section-head"><h2 class="label">Coming up</h2><a href="/whats-on">Full listings →</a></div>
  <div class="cards">${week.map((o, i) => nightCard(o, i)).join('')}</div>
</section>` : ''}

<section class="wrap section">
  <div class="section-head"><h2 class="label">From the menu</h2><a href="/menu">Full menu →</a></div>
  <ul class="menu-list two-col">${menuRows(teaser)}</ul>
</section>

${visitBlock(ctx)}`;
  return layout(ctx, { title: `${v.name} · ${v.tagline}`, body, path: ctx.path });
}

function whatsOnPage(ctx) {
  const { state, schedule } = ctx;
  const upcoming = [...schedule.tonight, ...schedule.upcoming];
  const body = `
<section class="wrap section page-top">
  <h1 class="page-title">What's on</h1>
  ${upcoming.length ? `<div class="cards">${upcoming.map((o, i) => nightCard(o, i)).join('')}</div>` : '<p>Nothing announced yet. Check back soon.</p>'}
</section>
${schedule.past.length ? `<section class="wrap section archive">
  <h2 class="label">Played here</h2>
  <ul class="archive-list">${schedule.past.slice(0, 16).map((o) => `<li><a href="/night/${encodeURIComponent(o.key)}"><span>${esc(formatDate(o.date, 'en', 'short'))}</span><span>${esc(o.name)}</span><span>${esc(o.djs.map((d) => d.name).join(', '))}</span></a></li>`).join('')}</ul>
</section>` : ''}`;
  return layout(ctx, { title: `What's on · ${state.venue.name}`, body, path: ctx.path });
}

function menuPage(ctx) {
  const { state } = ctx;
  const sections = ['Specials', 'Food', 'Drinks'].map((s) => ({ s, items: state.menu.filter((m) => m.section === s) })).filter((x) => x.items.length);
  const body = `
<section class="wrap section page-top">
  <h1 class="page-title">Menu</h1>
  <div class="filters" role="group" aria-label="Filter the menu">
    <button type="button" class="chip on" data-filter="">Everything</button>
    <button type="button" class="chip" data-filter="vegan">Vegan</button>
    <button type="button" class="chip" data-filter="vegetarian">Vegetarian</button>
    <button type="button" class="chip" data-filter="gluten free">Gluten free</button>
  </div>
  ${sections.map(({ s, items }) => `<h2 class="label menu-sec">${esc(s)}</h2><ul class="menu-list">${menuRows(items)}</ul>`).join('')}
  <p class="small">Allergies? Ask us and we will check every dish.</p>
</section>`;
  return layout(ctx, { title: `Menu · ${state.venue.name}`, body, path: ctx.path });
}

function bookPage(ctx, { sent = false, error = '', values = {} } = {}) {
  const { state, schedule } = ctx;
  const options = [...schedule.tonight, ...schedule.upcoming].slice(0, 10);
  const body = `
<section class="wrap section page-top narrow">
  <h1 class="page-title">Book a table</h1>
  ${sent ? `<div class="notice ok" role="status"><b>Thanks, we have it.</b> We reply within a few hours, usually sooner.</div>` : `
  <p class="lede">Tables, events and private hire. Every request lands in one place and gets a reply.</p>
  ${error ? `<div class="notice bad" role="alert">${esc(error)}</div>` : ''}
  <form class="form" method="post" action="/book">
    <fieldset class="types"><legend>What for?</legend>
      ${[['table', 'A table'], ['event', 'A night'], ['private', 'Private hire']].map(([k, l], i) => `<label><input type="radio" name="type" value="${k}" ${values.type === k || (!values.type && i === 0) ? 'checked' : ''}> <span>${l}</span></label>`).join('')}
    </fieldset>
    <label>Your name<input name="name" required maxlength="80" autocomplete="name" value="${esc(values.name)}"></label>
    <label>Phone or email<input name="contact" required maxlength="120" autocomplete="email" value="${esc(values.contact)}"></label>
    <div class="row2">
      <label>Date<input type="date" name="date" value="${esc(values.date)}"></label>
      <label>Guests<input type="number" name="guests" min="1" max="500" inputmode="numeric" value="${esc(values.guests)}"></label>
    </div>
    ${options.length ? `<label>For a night? (optional)<select name="night"><option value="">No, just a table</option>${options.map((o) => `<option value="${esc(o.name + ' · ' + o.date)}">${esc(formatDate(o.date, 'en', 'short'))} · ${esc(o.name)}</option>`).join('')}</select></label>` : ''}
    <label>Anything else<textarea name="message" rows="3" maxlength="1000">${esc(values.message)}</textarea></label>
    <label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
    <input type="hidden" name="src" value="${esc(values.src || '')}">
    <button class="btn btn-accent btn-big" type="submit">Send request</button>
  </form>`}
</section>`;
  return layout(ctx, { title: `Book · ${state.venue.name}`, body, path: ctx.path });
}

function nightPage(ctx, o) {
  const { state, baseUrl } = ctx;
  const label = o.status === 'tonight' ? 'Tonight' : o.status === 'past' ? 'Played here' : formatDate(o.date);
  const body = `
<section class="wrap hero">
  <div class="hero-card">
    <div class="hero-text">
      <span class="kicker">${esc(label)}${o.status !== 'upcoming' ? ` · ${esc(formatDate(o.date))}` : ''}</span>
      <h1>${esc(o.name)}</h1>
      <p class="lede">${o.doors ? `Doors ${esc(o.doors)}. ` : ''}${esc(o.blurb)}</p>
      ${lineup(o)}
      ${o.status === 'past' ? '<p class="small">This night has finished. See what is coming up next.</p><p class="actions"><a class="btn btn-hero" href="/whats-on">What\'s on</a></p>' : '<p class="actions"><a class="btn btn-hero" href="/book">Book for this night</a></p>'}
    </div>
    ${photoBlock(o, 'hero-photo')}
  </div>
</section>`;
  return layout(ctx, {
    title: `${o.name} · ${formatDate(o.date, 'en', 'short')} · ${state.venue.name}`,
    description: `${formatDate(o.date)}${o.doors ? `, doors ${o.doors}` : ''}. ${o.blurb}`,
    ogImage: o.photo ? `${baseUrl}/photos/${o.photo}` : null,
    body, path: ctx.path
  });
}

function notFoundPage(ctx) {
  return layout(ctx, { title: 'Not found', body: '<section class="wrap section page-top"><h1 class="page-title">Not found</h1><p><a href="/">Back to the home page</a></p></section>', path: ctx.path });
}

module.exports = { homePage, whatsOnPage, menuPage, bookPage, nightPage, notFoundPage, esc };
