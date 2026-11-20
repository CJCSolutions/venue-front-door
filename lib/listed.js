'use strict';

// The free "Listed" tier of the Ibiza Playbook. A venue without a front door
// sends one thing that's on through a short form: a food offer (menú del día,
// set menu, a special, a food festival), a night (DJ, live music, tardeo), or
// both together. Christopher checks it, then it shows in the guide labelled
// LISTED, with a link to the venue's own page. Verified venues (on the venue
// platform) always come first and are never replaced by a Listed copy.

const { addDays, dowOf, isDate, isTime } = require('./time');

const AREAS = ['Ibiza Town', 'Sant Antoni', 'Santa Eulària', 'West coast', 'North'];
const KINDS = ['Restaurant', 'Bar', 'Café', 'Beach club', 'Club', 'Other'];
const TAGS = { food: ['Comida', 'Food'], dj: ['DJ', 'DJ'], live: ['Música en directo', 'Live music'], sunset: ['Atardecer', 'Sunset'], late: ['Hasta tarde', 'Open late'], family: ['Familias', 'Family'] };
const TYPES = { food: ['Comida', 'Food'], night: ['Una noche', 'A night'], both: ['Las dos', 'Both'] };
const DAYS = [['L', 'Mon', 1], ['M', 'Tue', 2], ['X', 'Wed', 3], ['J', 'Thu', 4], ['V', 'Fri', 5], ['S', 'Sat', 6], ['D', 'Sun', 0]];
const EN_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKS = 8; // a repeating listing with no end date runs this many weeks, then needs sending again
const MAX_DAYS = 60; // furthest start date, and longest a repeating listing can run

// Food, night or both. Entries sent before the type existed are read from their tags.
function typeOf(l) {
  if (TYPES[l.type]) return l.type;
  const food = (l.tags || []).includes('food'), music = (l.tags || []).some((t) => t === 'dj' || t === 'live');
  return food && music ? 'both' : food ? 'food' : 'night';
}

// Which weekdays it repeats on (0 = Sunday), and its last date. Old weekly entries repeat on their own weekday.
function repeatDays(l) {
  if (Array.isArray(l.days) && l.days.length) return l.days;
  return l.weekly ? [dowOf(l.date)] : [];
}
function lastDate(l) {
  if (!repeatDays(l).length) return l.date;
  return l.until || addDays(l.date, WEEKS * 7 - 1);
}
const short = (d) => `${Number(d.slice(8))} ${EN_MON[Number(d.slice(5, 7)) - 1]}`;
// "Mon to Fri until 8 Dec", "Every Sat until 16 Jan", or "" for a one-off.
function repeatLabel(l) {
  const days = repeatDays(l);
  if (!days.length) return '';
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  const idx = order.map((d) => (d + 6) % 7);
  const run = idx.length > 2 && idx.every((x, i) => !i || x === idx[i - 1] + 1);
  const label = days.length === 7 ? 'Every day' : run ? `${EN_DOW[order[0]]} to ${EN_DOW[order.at(-1)]}` : `Every ${order.map((d) => EN_DOW[d]).join(', ')}`;
  return `${label} until ${short(lastDate(l))}`;
}

const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Check a form post. Returns { values, errors }.
function validate(body, today) {
  const b = body || {};
  const v = {
    type: str(b.type, 10),
    venue: str(b.venue, 80), area: str(b.area, 30), kind: str(b.kind, 20),
    title: str(b.title, 80), what: str(b.what, 200), price: str(b.price, 40),
    date: str(b.date, 10),
    days: [...new Set([].concat(b.days || []).filter((d) => String(d).trim() !== '').map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))],
    until: str(b.until, 10),
    start: str(b.start, 5), end: str(b.end, 5),
    tags: Object.keys(TAGS).filter((k) => [].concat(b.tags || []).includes(k)),
    link: str(b.link, 200), contact: str(b.contact, 120), name: str(b.name, 80)
  };
  // the old "every week on this day" box still works
  if ((b.weekly === 'on' || b.weekly === '1') && !v.days.length && isDate(v.date)) v.days = [dowOf(v.date)];
  if (!TYPES[v.type]) v.type = typeOf(v);
  if (v.type !== 'night' && !v.tags.includes('food')) v.tags.unshift('food');
  // a food offer with a DJ or live music ticked, or a night with food ticked, is both
  if (v.type !== 'both' && typeOf({ tags: v.tags }) === 'both') v.type = 'both';
  // an end date with no days ticked means every day until then (a food festival, a week long special)
  if (v.until && !v.days.length) v.days = [0, 1, 2, 3, 4, 5, 6];
  const e = [];
  if (v.venue.length < 2) e.push('venue');
  if (!AREAS.includes(v.area)) e.push('area');
  if (!KINDS.includes(v.kind)) e.push('kind');
  if (v.title.length < 2) e.push('title');
  if (!isDate(v.date) || v.date < today || v.date > addDays(today, MAX_DAYS)) e.push('date');
  if (v.until && (!isDate(v.until) || !isDate(v.date) || v.until < v.date || v.until > addDays(v.date, MAX_DAYS))) e.push('until');
  if (v.days.length && isDate(v.date) && !v.days.some((d) => runsOn(v, addDays(v.date, (d - dowOf(v.date) + 7) % 7)))) e.push('until');
  if (!isTime(v.start)) e.push('start');
  if (!isTime(v.end) || v.end === v.start) e.push('end');
  if (!v.tags.length) e.push('tags');
  if (v.link && !/^https:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(v.link)) e.push('link');
  if (v.contact.length < 5) e.push('contact');
  return { values: v, errors: e };
}

// Does this listing run on this date?
function runsOn(l, date) {
  const days = repeatDays(l);
  if (!days.length) return l.date === date;
  return date >= l.date && date <= lastDate(l) && days.includes(dowOf(date));
}

// Approved listings as Playbook venues, for today and tomorrow.
function toVenues(rows, today) {
  const days = [today, addDays(today, 1)];
  const byVenue = new Map();
  for (const r of rows.filter((x) => x.status === 'live')) {
    const l = r.data;
    for (const date of days.filter((d) => runsOn(l, d))) {
      const start = mins(l.start), e0 = mins(l.end), end = e0 <= start ? e0 + 1440 : e0;
      const tags = l.tags.slice();
      if (end >= 1500 && !tags.includes('late')) tags.push('late');
      const id = `${l.venue}|${l.area}`.toLowerCase();
      if (!byVenue.has(id)) byVenue.set(id, { key: `listed/${r.id}`, name: l.venue, kind: l.kind, area: l.area, url: l.link || '', listed: true, source: 'listed', listings: [] });
      byVenue.get(id).listings.push({
        id: `listed/${r.id}@${date}`, kind: 'listed', type: typeOf(l), date, start, end, title: l.title, what: l.what, lineup: '', food: '', offer: '',
        price: l.price || '', runs: repeatLabel(l), tags,
        action: l.link ? { label: 'Their page', href: l.link } : null
      });
    }
  }
  return [...byVenue.values()];
}

// ---------- pages ----------

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
:root { --paper:#f6f7f9; --card:#fff; --ink:#14202e; --muted:#5c6878; --line:#dde2e9; --pink:#d9416c; --pink-soft:#fbe6ec; --sea:#0f7d79; --sea-soft:#def2f0; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.45 "Figtree", system-ui, sans-serif; }
.wrap { max-width: 520px; margin: 0 auto; padding: 20px 16px 60px; }
h1 { font: 700 28px/1.05 "Bricolage Grotesque", system-ui, sans-serif; margin: 0 0 6px; letter-spacing: -0.02em; }
h1 span { color: var(--pink); }
h2 { font: 700 20px/1.2 "Bricolage Grotesque", system-ui, sans-serif; margin: 22px 0 8px; }
p { margin: 0 0 10px; } .muted { color: var(--muted); font-size: 14px; }
.en { color: var(--muted); font-weight: 400; }
label { display: block; font-weight: 600; font-size: 14px; margin: 14px 0 6px; }
input[type=text], input[type=url], input[type=date], input[type=time], select, textarea { width: 100%; height: 46px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); padding: 0 12px; font: inherit; color: inherit; }
textarea { height: 84px; padding: 10px 12px; resize: vertical; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.checks { display: flex; flex-wrap: wrap; gap: 8px; }
.checks label { margin: 0; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--card); border-radius: 99px; padding: 8px 12px; }
.inline { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.err { color: var(--pink); font-size: 13px; margin-top: 4px; }
.box { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px; margin: 14px 0; }
button, .btn { display: inline-flex; align-items: center; justify-content: center; height: 48px; padding: 0 20px; border: 0; border-radius: 12px; background: var(--pink); color: #fff; font-family: inherit; font-size: 16px; font-weight: 600; text-decoration: none; cursor: pointer; }
.btn.line, button.line { background: none; color: var(--ink); border: 1px solid var(--line); height: 38px; padding: 0 12px; font-size: 14px; }
.hp { position: absolute; left: -9999px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.badge { font-weight: 700; font-size: 11px; letter-spacing: .02em; padding: 3px 8px; border-radius: 6px; background: var(--pink-soft); color: var(--pink); }
.badge.live { background: var(--sea-soft); color: var(--sea); }
`;

function shell(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=Figtree:wght@400;500;600&display=swap">
<style>${CSS}</style></head><body><main class="wrap">${body}</main></body></html>`;
}

const MSG = {
  until: 'El último día debe ser el primer día o después, hasta 60 días, e incluir uno de los días marcados. / The last day must be the first day or later, up to 60 days, and include one of the ticked days.',
  venue: 'Pon el nombre del local. / Add the venue name.', area: 'Elige la zona. / Pick the area.', kind: 'Elige el tipo de local. / Pick the type of place.',
  title: 'Dinos qué hay. / Say what\'s on.', date: 'Elige una fecha de hoy a 60 días. / Pick a date from today up to 60 days ahead.',
  start: 'Hora de inicio. / Start time.', end: 'Hora de fin, distinta del inicio. / End time, different from the start.',
  tags: 'Marca al menos uno. / Tick at least one.', link: 'Un enlace que empiece por https://. / A link starting with https://.',
  contact: 'Un email o WhatsApp para dudas. / An email or WhatsApp for questions.'
};

function formPage({ values = {}, errors = [], today }) {
  const v = { type: '', area: '', kind: '', tags: [], days: [], date: today, ...values };
  const err = (k) => (errors.includes(k) ? `<div class="err">${MSG[k]}</div>` : '');
  const opt = (list, cur) => `<option value="">Elige / Choose</option>` + list.map((x) => `<option${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join('');
  return shell('Sal en The Ibiza Playbook', `
<h1>The Ibiza <span>Playbook</span></h1>
<h2>Sal en la guía, gratis <span class="en">/ Get listed, free</span></h2>
<p class="muted">Cuéntanos qué hay en tu local: un menú del día, un menú especial, un DJ, música en directo. Lo revisamos y sale en la guía como LISTED. Los locales con su propia web en la plataforma salen como Verified, en directo.<br>Tell us what's on at your place: a set menu, a special, a DJ, live music. We check it, then it shows in the guide as LISTED.</p>
${errors.length ? '<div class="box"><b>Revisa los campos marcados. / Please check the marked fields.</b></div>' : ''}
<form method="post" action="/playbook/add" novalidate>
<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<label>¿Qué quieres anunciar? <span class="en">/ What do you want to list?</span></label>
<div class="checks">${Object.entries(TYPES).map(([k, [es, en]]) => `<label><input type="radio" name="type" value="${k}"${v.type === k ? ' checked' : ''} required> ${es} <span class="en">/ ${en}</span></label>`).join('')}</div>
<p class="muted" style="margin-top:6px">Comida: menú del día, menú especial, una jornada gastronómica. Una noche: DJ, música en directo, tardeo. / Food: a set menu, a special, a food festival. A night: DJ, live music, tardeo.</p>${err('type')}
<label for="venue">Nombre del local <span class="en">/ Venue name</span></label><input id="venue" name="venue" type="text" maxlength="80" value="${esc(v.venue)}" required>${err('venue')}
<div class="two"><div><label for="area">Zona <span class="en">/ Area</span></label><select id="area" name="area" required>${opt(AREAS, v.area)}</select>${err('area')}</div>
<div><label for="kind">Tipo <span class="en">/ Type</span></label><select id="kind" name="kind" required>${opt(KINDS, v.kind)}</select>${err('kind')}</div></div>
<label for="title">Qué hay <span class="en">/ What's on</span></label><input id="title" name="title" type="text" maxlength="80" placeholder="Menú del día · Tardeo con DJ Toni" value="${esc(v.title)}" required>${err('title')}
<label for="what">Más detalles <span class="en">/ More detail (optional)</span></label><textarea id="what" name="what" maxlength="200" placeholder="Tres platos con pan y bebida · Paella desde las 14:00, DJ hasta las 21:00">${esc(v.what)}</textarea>
<label for="price">Precio <span class="en">/ Price (optional)</span></label><input id="price" name="price" type="text" maxlength="40" placeholder="15 €" value="${esc(v.price)}">
<label for="date">Fecha, o primer día <span class="en">/ Date, or first day</span></label><input id="date" name="date" type="date" min="${today}" value="${esc(v.date)}" required>${err('date')}
<label>Se repite <span class="en">/ Repeats on (optional)</span></label>
<div class="checks">${DAYS.map(([es, en, n]) => `<label><input type="checkbox" name="days" value="${n}"${v.days.includes(n) ? ' checked' : ''}> ${es} <span class="en">${en}</span></label>`).join('')}</div>
<label for="until">Último día <span class="en">/ Last day (optional; with no days ticked it runs every day until then; with days and no last day, ${WEEKS} weeks)</span></label><input id="until" name="until" type="date" min="${today}" value="${esc(v.until)}">${err('until')}
<div class="two"><div><label for="start">Desde <span class="en">/ From</span></label><input id="start" name="start" type="time" value="${esc(v.start)}" required>${err('start')}</div>
<div><label for="end">Hasta <span class="en">/ Until</span></label><input id="end" name="end" type="time" value="${esc(v.end)}" required>${err('end')}</div></div>
<label>Qué encontrarás <span class="en">/ What guests get</span></label>
<div class="checks">${Object.entries(TAGS).map(([k, [es, en]]) => `<label><input type="checkbox" name="tags" value="${k}"${v.tags.includes(k) ? ' checked' : ''}> ${es}${es !== en ? ` <span class="en">/ ${en}</span>` : ''}</label>`).join('')}</div>${err('tags')}
<label for="link">Enlace a tu web o Instagram <span class="en">/ Link to your site or Instagram (optional)</span></label><input id="link" name="link" type="url" placeholder="https://" value="${esc(v.link)}">${err('link')}
<label for="contact">Email o WhatsApp <span class="en">/ Email or WhatsApp (only for us, never shown)</span></label><input id="contact" name="contact" type="text" maxlength="120" value="${esc(v.contact)}" required>${err('contact')}
<label for="name">Tu nombre <span class="en">/ Your name (optional)</span></label><input id="name" name="name" type="text" maxlength="80" value="${esc(v.name)}">
<div class="row"><button type="submit">Enviar <span style="font-weight:400">&nbsp;/ Send</span></button></div>
<p class="muted" style="margin-top:12px">Gratis para locales y para quien busca. Sin rankings de pago. / Free for venues and guests. No paid ranking.</p>
</form>`);
}

function thanksPage() {
  return shell('Gracias', `
<h1>The Ibiza <span>Playbook</span></h1>
<div class="box"><h2 style="margin-top:0">¡Gracias! <span class="en">/ Thank you!</span></h2>
<p>Lo revisamos y sale en la guía como LISTED. Si tenemos dudas, te escribimos.</p><p class="muted">We check it, then it shows in the guide as LISTED. If we have a question, we'll get in touch.</p></div>
<div class="row"><a class="btn" href="/playbook/add">Enviar otro <span style="font-weight:400">&nbsp;/ Send another</span></a><a class="btn line" href="/">Ver la guía / See the guide</a></div>`);
}

function adminPage({ rows, allowed }) {
  if (!allowed) return shell('Listed', '<h1>Listed</h1><p>Log in at <a href="/leads">/leads</a> first (same password), then come back to <a href="/playbook/listed">/playbook/listed</a>.</p>');
  const when = (l) => `${repeatDays(l).length ? `${repeatLabel(l)}, from ${l.date}` : l.date}, ${l.start} to ${l.end}`;
  const item = (r) => {
    const l = r.data;
    const btn = (status, label) => `<form method="post" action="/playbook/listed/${r.id}" style="display:inline"><input type="hidden" name="status" value="${status}"><button class="line" type="submit">${label}</button></form>`;
    return `<div class="box"><span class="badge${r.status === 'live' ? ' live' : ''}">${r.status.toUpperCase()}</span>
<h2 style="margin:8px 0 4px">${esc(l.venue)}: ${esc(l.title)}</h2>
<p class="muted">${esc(TYPES[typeOf(l)][1])} · ${esc(l.kind)} · ${esc(l.area)} · ${esc(when(l))}${l.price ? ` · ${esc(l.price)}` : ''} · ${esc(l.tags.join(', '))}</p>
${l.what ? `<p>${esc(l.what)}</p>` : ''}
<p class="muted">Link: ${l.link ? `<a href="${esc(l.link)}" rel="noopener" target="_blank">${esc(l.link)}</a>` : 'none'}<br>Contact: ${esc(l.contact)}${l.name ? ` (${esc(l.name)})` : ''}<br>Sent ${esc(String(r.created_at).slice(0, 16).replace('T', ' '))}</p>
<div class="row">${r.status !== 'live' ? btn('live', 'Show in the guide') : ''}${r.status !== 'hidden' ? btn('hidden', 'Hide') : ''}${btn('deleted', 'Delete')}</div></div>`;
  };
  const pending = rows.filter((r) => r.status === 'pending'), live = rows.filter((r) => r.status === 'live'), hidden = rows.filter((r) => r.status === 'hidden');
  return shell('Listed: check before it shows', `
<h1>Listed <span>check</span></h1>
<p class="muted">Free listings sent by venues. Nothing shows in the guide until you press Show. Form for venues: <a href="/playbook/add">/playbook/add</a> (also on ibizaplaybook.com/playbook/add).</p>
<h2>Waiting (${pending.length})</h2>${pending.map(item).join('') || '<p class="muted">Nothing waiting.</p>'}
<h2>In the guide (${live.length})</h2>${live.map(item).join('') || '<p class="muted">None yet.</p>'}
${hidden.length ? `<h2>Hidden (${hidden.length})</h2>${hidden.map(item).join('')}` : ''}`);
}

module.exports = { validate, toVenues, runsOn, typeOf, repeatLabel, formPage, thanksPage, adminPage, AREAS, KINDS, TAGS, TYPES, WEEKS };
