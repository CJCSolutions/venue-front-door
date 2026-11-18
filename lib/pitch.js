'use strict';

// The sales page for venues: the problems this solves, the four sample
// venues, how tracking works, and a way to get in touch.

const { MODULES } = require('./presets');
const { SAMPLES } = require('./samples');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const T = {
  en: {
    lang: 'en', other: 'es', otherLabel: 'Español',
    title: 'Venue websites, menus, events and social posts in one place · Food for Thought',
    brand: 'Food for Thought', navSamples: 'Sample venues', navTrack: 'Tracking', navContact: 'Get in touch',
    kicker: 'For cafés, restaurants, bars and beach clubs',
    h1: 'Update once. Seen everywhere. Know what works.',
    lede: 'One simple system for your website, menus, events and social posts. Change something on your phone and your site, Google, Instagram and your own guest list stay in step. Then see which channel brought people in, and what each event really earned.',
    ctaSamples: 'See the sample venues', ctaContact: 'Get in touch',
    solvesTitle: 'Five problems, one system',
    solves: [
      { k: 'menu', h: 'Menus that update in seconds', b: 'Change a price, mark a dish sold out, switch from lunch to dinner. The website and the QR menu on the tables change straight away.' },
      { k: 'events', h: 'Events posted once', b: 'Add it once. It appears on your site, repeats weekly if it repeats, takes bookings with a set number of places, and files itself away afterwards.' },
      { k: 'exposure', h: 'Seen on every channel', b: 'Every event and story comes with a ready-made post for Instagram, Google, Facebook and WhatsApp, in your style and in English and Spanish.' },
      { k: 'community', h: 'Your own community', b: 'Guests join your list from the site, a QR code or your bio. Members hear first and book first. The list is yours, not Instagram’s.' },
      { k: 'tracking', h: 'Know what works', b: 'See visits and bookings by channel, and what each event cost in marketing, talent and hours against what it took in.' }
    ],
    mock: {
      menuRow: 'Grilled octopus', soldOut: 'Sold out', on: 'On', live: 'Live on the site and the QR menu',
      evName: 'Taco Tuesday', evRepeat: 'Every Tuesday · 19:00', evBooked: '42 of 60 booked',
      channels: ['Website', 'Google', 'Instagram', 'Facebook', 'WhatsApp'], onePost: 'One post',
      members: 'members', month: '+96 this month', early: 'Members see new events 48 hours early',
      trackRows: [['Instagram', 38], ['Google', 27], ['The Circle', 18], ['Direct', 12], ['Facebook', 5]], trackLabel: 'Bookings by channel'
    },
    samplesTitle: 'Works for every kind of venue',
    samplesSub: 'Four sample venues, each with its own menus, events and style. Open one, then try the editor.',
    sampleText: {
      cafe: 'Menu by time of day, opening hours, directions, a little story and photos. No events needed.',
      restaurant: 'Menus, table requests, theme nights with bookings, private hire and a members’ list.',
      bar: 'Events lead, with bookings, stories by theme and a members’ list. The drinks menu sits underneath.',
      beach: 'Bookable daybeds, sunset sessions, menus for lunch and sunset, and photos of the place.'
    },
    open: 'Open sample',
    trackTitle: 'See where your guests come from, and what it cost to get them',
    trackSub: 'Most venues post everywhere and guess what worked. Here every link carries its channel, and every event carries its numbers.',
    trackPoints: [
      ['Every channel is tagged', 'Links shared to Instagram, Google, Facebook, WhatsApp, posters and your members’ list are each marked, so visits and bookings are counted by source.'],
      ['Every event has its own numbers', 'Add what it took and what it cost: talent, marketing spend, other costs and hours of work.'],
      ['Plain answers', 'Which nights earn their place, profit per hour of effort, and how much each euro of marketing brought back.']
    ],
    dash: { visits: 'website visits', bookings: 'bookings', members: 'members', profit: 'event profit', perEuro: 'back per €1 of marketing', perHour: 'profit per hour of work', rank: 'Which nights earn their place', avg: 'avg profit' },
    structureTitle: 'Set up once. Hard to break.',
    structureSub: 'We build the design and the structure. Your team only changes the facts, so the site always looks right. Switch on the parts you need.',
    core: 'Always included', optional: 'Switch on what you need',
    stylesTitle: 'Your own design',
    stylesSub: 'The samples use four starting styles. For your venue we design one around your brand.',
    styles: { poster: 'Poster wall', gallery: 'Gallery', beach: 'Beach club', dark: 'After dark' },
    howTitle: 'How it works',
    how: [['We set it up', 'Your menus, events, photos and story, in a design made for you.'], ['You update from your phone', 'Change a price, add an event, post a story. Seconds, not hours.'], ['Every channel follows', 'The site updates live. Posts for each channel are ready to share in one tap.'], ['You see what works', 'Visits, bookings, members and profit per event, by channel.']],
    formTitle: 'Get in touch',
    formSub: 'Tell us about your venue. We’ll show you how it would work for you and design it around your brand.',
    fName: 'Your name', fVenue: 'Venue name', fType: 'Kind of venue', fContact: 'Phone or email', fNeeds: 'What would help most?', fMsg: 'Anything else',
    types: { cafe: 'Café', restaurant: 'Restaurant', bar: 'Bar or events venue', beach: 'Beach club or day venue', other: 'Something else' },
    needs: { menus: 'Easier menu updates', events: 'Posting events and taking bookings', social: 'More exposure on every channel', circle: 'Building our own community', tracking: 'Knowing what our marketing brings in', design: 'A new website and look' },
    consent: 'You can contact me about this.', send: 'Send', thanks: 'Thanks. We’ll be in touch shortly.',
    errName: 'Please add your name and a phone or email.', errConsent: 'Please tick the box so we can contact you.',
    foot: 'Food for Thought · Ibiza'
  },
  es: {
    lang: 'es', other: 'en', otherLabel: 'English',
    title: 'Web, cartas, eventos y redes de tu local en un solo sitio · Food for Thought',
    brand: 'Food for Thought', navSamples: 'Locales de ejemplo', navTrack: 'Seguimiento', navContact: 'Contacto',
    kicker: 'Para cafeterías, restaurantes, bares y beach clubs',
    h1: 'Actualiza una vez. Que te vean en todas partes. Sabe qué funciona.',
    lede: 'Un sistema sencillo para tu web, tus cartas, tus eventos y tus publicaciones. Cambias algo desde el móvil y tu web, Google, Instagram y tu propia lista de clientes quedan al día. Y ves qué canal trajo a la gente y cuánto ganó de verdad cada evento.',
    ctaSamples: 'Ver los locales de ejemplo', ctaContact: 'Contacto',
    solvesTitle: 'Cinco problemas, un sistema',
    solves: [
      { k: 'menu', h: 'Cartas que se actualizan en segundos', b: 'Cambia un precio, marca un plato como agotado, pasa de comida a cena. La web y la carta QR de las mesas cambian al momento.' },
      { k: 'events', h: 'Eventos publicados una sola vez', b: 'Lo añades una vez. Aparece en tu web, se repite cada semana si toca, acepta reservas con aforo y se archiva solo después.' },
      { k: 'exposure', h: 'Visible en todos los canales', b: 'Cada evento e historia viene con una publicación lista para Instagram, Google, Facebook y WhatsApp, con tu estilo y en inglés y español.' },
      { k: 'community', h: 'Tu propia comunidad', b: 'Los clientes se apuntan desde la web, un QR o tu bio. Los miembros se enteran antes y reservan antes. La lista es tuya, no de Instagram.' },
      { k: 'tracking', h: 'Sabe qué funciona', b: 'Visitas y reservas por canal, y lo que costó cada evento en marketing, artistas y horas frente a lo que facturó.' }
    ],
    mock: {
      menuRow: 'Pulpo a la brasa', soldOut: 'Agotado', on: 'Activo', live: 'Al momento en la web y la carta QR',
      evName: 'Taco Tuesday', evRepeat: 'Cada martes · 19:00', evBooked: '42 de 60 reservados',
      channels: ['Web', 'Google', 'Instagram', 'Facebook', 'WhatsApp'], onePost: 'Una publicación',
      members: 'miembros', month: '+96 este mes', early: 'Los miembros ven los eventos 48 horas antes',
      trackRows: [['Instagram', 38], ['Google', 27], ['El Círculo', 18], ['Directo', 12], ['Facebook', 5]], trackLabel: 'Reservas por canal'
    },
    samplesTitle: 'Sirve para cualquier tipo de local',
    samplesSub: 'Cuatro locales de ejemplo, cada uno con sus cartas, eventos y estilo. Abre uno y prueba el editor.',
    sampleText: {
      cafe: 'Carta según la hora, horario, cómo llegar, un poco de historia y fotos. Sin eventos.',
      restaurant: 'Cartas, peticiones de mesa, noches temáticas con reservas, eventos privados y lista de miembros.',
      bar: 'Mandan los eventos, con reservas, historias por temas y lista de miembros. La carta de copas debajo.',
      beach: 'Camas reservables, sesiones al atardecer, cartas de comida y atardecer, y fotos del lugar.'
    },
    open: 'Abrir ejemplo',
    trackTitle: 'Mira de dónde vienen tus clientes y lo que costó traerlos',
    trackSub: 'Casi todos los locales publican en todas partes y adivinan qué funcionó. Aquí cada enlace lleva su canal y cada evento sus números.',
    trackPoints: [
      ['Cada canal queda marcado', 'Los enlaces de Instagram, Google, Facebook, WhatsApp, carteles y tu lista de miembros van marcados, así que visitas y reservas se cuentan por origen.'],
      ['Cada evento tiene sus números', 'Añade lo que facturó y lo que costó: artistas, inversión en marketing, otros gastos y horas de trabajo.'],
      ['Respuestas claras', 'Qué noches merecen la pena, beneficio por hora de trabajo y cuánto devolvió cada euro de marketing.']
    ],
    dash: { visits: 'visitas a la web', bookings: 'reservas', members: 'miembros', profit: 'beneficio de eventos', perEuro: 'por cada €1 de marketing', perHour: 'beneficio por hora de trabajo', rank: 'Qué noches merecen la pena', avg: 'beneficio medio' },
    structureTitle: 'Se monta una vez. Difícil de romper.',
    structureSub: 'Nosotros hacemos el diseño y la estructura. Tu equipo solo cambia los datos, así la web siempre se ve bien. Activa las partes que necesites.',
    core: 'Siempre incluido', optional: 'Activa lo que necesites',
    stylesTitle: 'Tu propio diseño',
    stylesSub: 'Los ejemplos usan cuatro estilos de partida. Para tu local diseñamos uno con tu marca.',
    styles: { poster: 'Cartelería', gallery: 'Galería', beach: 'Beach club', dark: 'Noche' },
    howTitle: 'Cómo funciona',
    how: [['Lo montamos nosotros', 'Tus cartas, eventos, fotos e historia, con un diseño hecho para ti.'], ['Tú actualizas desde el móvil', 'Cambia un precio, añade un evento, sube una historia. Segundos, no horas.'], ['Todos los canales se actualizan', 'La web cambia al momento. Las publicaciones de cada canal quedan listas para compartir.'], ['Ves lo que funciona', 'Visitas, reservas, miembros y beneficio por evento, por canal.']],
    formTitle: 'Contacto',
    formSub: 'Cuéntanos sobre tu local. Te enseñamos cómo funcionaría para ti y lo diseñamos con tu marca.',
    fName: 'Tu nombre', fVenue: 'Nombre del local', fType: 'Tipo de local', fContact: 'Teléfono o email', fNeeds: '¿Qué te ayudaría más?', fMsg: 'Algo más',
    types: { cafe: 'Cafetería', restaurant: 'Restaurante', bar: 'Bar o sala de eventos', beach: 'Beach club o local de día', other: 'Otro' },
    needs: { menus: 'Actualizar las cartas más fácil', events: 'Publicar eventos y aceptar reservas', social: 'Más visibilidad en todos los canales', circle: 'Crear nuestra propia comunidad', tracking: 'Saber qué nos trae el marketing', design: 'Una web y una imagen nuevas' },
    consent: 'Podéis contactarme sobre esto.', send: 'Enviar', thanks: 'Gracias. Te contactamos pronto.',
    errName: 'Añade tu nombre y un teléfono o email.', errConsent: 'Marca la casilla para que podamos contactarte.',
    foot: 'Food for Thought · Ibiza'
  }
};

const MODULE_ES = {
  hours: 'Horario y abierto ahora', visit: 'Cómo llegar y contacto', about: 'Quiénes somos', gallery: 'Galería', info: 'Info útil',
  menu: 'Cartas', offers: 'Ofertas', events: 'Eventos', bookings: 'Reservas de eventos', tables: 'Peticiones de mesa', hire: 'Eventos privados',
  order: 'Pedidos online', stories: 'Historias', circle: 'Lista de miembros', reviews: 'Reseñas'
};
const KIND_ES = { cafe: 'Cafetería', restaurant: 'Restaurante', bar: 'Bar y eventos', beach: 'Beach club' };

function mockFor(k, t) {
  const m = t.mock;
  if (k === 'menu') return `<div class="mk"><div class="mk-row"><b>${esc(m.menuRow)}</b><span class="mk-step">−</span><span>€19</span><span class="mk-step">+</span><span class="mk-pill on">${esc(m.on)}</span></div><div class="mk-row dim"><b>Paella</b><span>€42</span><span class="mk-pill off">${esc(m.soldOut)}</span></div><small>✓ ${esc(m.live)}</small></div>`;
  if (k === 'events') return `<div class="mk"><b class="mk-big">${esc(m.evName)}</b><small>${esc(m.evRepeat)}</small><div class="mk-bar"><i style="width:70%"></i></div><small>${esc(m.evBooked)}</small></div>`;
  if (k === 'exposure') return `<div class="mk mk-fan"><span class="mk-src">${esc(m.onePost)}</span><div>${m.channels.map((c) => `<span class="mk-chip">${esc(c)}</span>`).join('')}</div></div>`;
  if (k === 'community') return `<div class="mk"><b class="mk-big">1,284</b><small>${esc(m.members)} · ${esc(m.month)}</small><small>🔒 ${esc(m.early)}</small></div>`;
  return `<div class="mk"><small>${esc(m.trackLabel)}</small>${m.trackRows.slice(0, 4).map(([c, n]) => `<div class="mk-track"><span>${esc(c)}</span><i><b style="width:${Math.round(n / 38 * 100)}%"></b></i><em>${n}%</em></div>`).join('')}</div>`;
}

function pitchPage({ lang = 'en', sent = false, error = '', values = {} } = {}) {
  const t = T[lang] || T.en;
  const v = values;
  const es = lang === 'es';
  const moduleName = (k) => (es ? MODULE_ES[k] : MODULES[k].label);
  const core = Object.keys(MODULES).filter((k) => MODULES[k].core);
  const optional = Object.keys(MODULES).filter((k) => !MODULES[k].core);
  const d = t.dash;

  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.lede)}">
<meta property="og:title" content="${esc(t.h1)}">
<meta property="og:description" content="${esc(t.lede)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&family=Playfair+Display&family=Space+Grotesk:wght@700&display=swap">
<link rel="stylesheet" href="/pulse.css?v=3">
</head>
<body>
<header class="p-top"><div class="p-wrap p-row">
  <a class="p-logo" href="/for-venues${es ? '?lang=es' : ''}">${esc(t.brand)}</a>
  <nav><a href="#samples">${esc(t.navSamples)}</a><a href="#tracking">${esc(t.navTrack)}</a><a href="/for-venues?lang=${t.other}">${esc(t.otherLabel)}</a><a class="p-btn p-btn-lime" href="#contact">${esc(t.navContact)}</a></nav>
</div></header>

<section class="p-hero"><div class="p-wrap">
  <p class="p-kicker">${esc(t.kicker)}</p>
  <h1>${esc(t.h1)}</h1>
  <p class="p-lede">${esc(t.lede)}</p>
  <p class="p-actions"><a class="p-btn p-btn-lime" href="#samples">${esc(t.ctaSamples)} ↓</a><a class="p-btn p-btn-line" href="#contact">${esc(t.ctaContact)}</a></p>
</div></section>

<section class="p-sec"><div class="p-wrap">
  <h2>${esc(t.solvesTitle)}</h2>
  <div class="p-solves">${t.solves.map((x, i) => `<div class="p-solve p-solve-${x.k}"><span class="p-num">${i + 1}</span><b>${esc(x.h)}</b><p>${esc(x.b)}</p>${mockFor(x.k, t)}</div>`).join('')}</div>
</div></section>

<section class="p-sec p-soft" id="samples"><div class="p-wrap">
  <h2>${esc(t.samplesTitle)}</h2><p class="p-sub">${esc(t.samplesSub)}</p>
  <div class="p-grid4">${Object.keys(SAMPLES).map((k) => `<a class="p-sample p-style-${SAMPLES[k].look}" href="/?sample=${k}">
    <span class="p-sample-kind">${esc(es ? KIND_ES[k] : SAMPLES[k].kind)}</span>
    <span class="p-sample-name">${esc(SAMPLES[k].name)}</span>
    <span class="p-sample-text">${esc(t.sampleText[k])}</span>
    <span class="p-sample-go">${esc(t.open)} →</span></a>`).join('')}</div>
</div></section>

<section class="p-sec p-dark" id="tracking"><div class="p-wrap">
  <h2>${esc(t.trackTitle)}</h2><p class="p-sub">${esc(t.trackSub)}</p>
  <div class="p-track">
    <div class="p-track-points">${t.trackPoints.map(([h, b]) => `<div><b>${esc(h)}</b><p>${esc(b)}</p></div>`).join('')}</div>
    <div class="p-dash" aria-label="Example numbers">
      <div class="p-tiles"><div><b>2,754</b><span>${esc(d.visits)}</span></div><div><b>214</b><span>${esc(d.bookings)}</span></div><div><b>€34,700</b><span>${esc(d.profit)}</span></div><div><b>€21</b><span>${esc(d.perEuro)}</span></div></div>
      <small>${esc(t.mock.trackLabel)}</small>
      ${t.mock.trackRows.map(([c, n]) => `<div class="mk-track"><span>${esc(c)}</span><i><b style="width:${Math.round(n / 38 * 100)}%"></b></i><em>${n}%</em></div>`).join('')}
      <small style="margin-top:14px">${esc(d.rank)}</small>
      <table><tbody>${[['House Friday', '€2,887', '€289'], ['Sunset Sessions', '€2,520', '€315'], ['Taco Tuesday', '€1,550', '€155'], ['Quiz Night', '€1,300', '€163']].map((r) => `<tr><td>${esc(r[0])}</td><td>${r[1]} <span>${esc(d.avg)}</span></td><td>${r[2]} <span>/h</span></td></tr>`).join('')}</tbody></table>
    </div>
  </div>
</div></section>

<section class="p-sec"><div class="p-wrap">
  <h2>${esc(t.structureTitle)}</h2><p class="p-sub">${esc(t.structureSub)}</p>
  <div class="p-modules">
    <div><span class="p-tag">${esc(t.core)}</span>${core.map((k) => `<div class="p-mod core">${esc(moduleName(k))}</div>`).join('')}</div>
    <div><span class="p-tag">${esc(t.optional)}</span><div class="p-modgrid">${optional.map((k) => `<div class="p-mod">${esc(moduleName(k))}</div>`).join('')}</div></div>
  </div>
</div></section>

<section class="p-sec p-soft"><div class="p-wrap">
  <h2>${esc(t.stylesTitle)}</h2><p class="p-sub">${esc(t.stylesSub)}</p>
  <div class="p-grid4">${Object.keys(t.styles).map((k) => `<a class="p-style p-style-${k}" href="/?look=${k}"><span>${k === 'gallery' ? 'Sol' : k === 'dark' ? 'Lunar' : k === 'beach' ? 'Cala Blanca' : 'Marea'}</span><b>${esc(t.styles[k])}</b></a>`).join('')}</div>
</div></section>

<section class="p-sec"><div class="p-wrap">
  <h2>${esc(t.howTitle)}</h2>
  <div class="p-grid4">${t.how.map(([h, b], i) => `<div class="p-card"><span class="p-num">${i + 1}</span><b>${esc(h)}</b><p>${esc(b)}</p></div>`).join('')}</div>
</div></section>

<section class="p-sec p-dark" id="contact"><div class="p-wrap p-narrow">
  <h2>${esc(t.formTitle)}</h2><p class="p-sub">${esc(t.formSub)}</p>
  ${sent ? `<div class="p-ok" role="status">${esc(t.thanks)}</div>` : `
  ${error ? `<div class="p-err" role="alert">${esc(error)}</div>` : ''}
  <form class="p-form" method="post" action="/for-venues#contact">
    <input type="hidden" name="lang" value="${t.lang}">
    <div class="p-row2"><label>${esc(t.fName)}<input name="name" required maxlength="80" autocomplete="name" value="${esc(v.name)}"></label>
    <label>${esc(t.fVenue)}<input name="venue" maxlength="80" value="${esc(v.venue)}"></label></div>
    <div class="p-row2"><label>${esc(t.fContact)}<input name="contact" required maxlength="120" autocomplete="email" value="${esc(v.contact)}"></label>
    <label>${esc(t.fType)}<select name="type">${Object.entries(t.types).map(([k, l]) => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
    <fieldset><legend>${esc(t.fNeeds)}</legend><div class="p-checks">${Object.entries(t.needs).map(([k, l]) => `<label class="p-check"><input type="checkbox" name="needs" value="${k}" ${(v.needs || []).includes(k) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></fieldset>
    <label>${esc(t.fMsg)}<textarea name="message" rows="3" maxlength="1000">${esc(v.message)}</textarea></label>
    <label class="p-consent"><input type="checkbox" name="consent" value="1" required> ${esc(t.consent)}</label>
    <label class="p-hp" aria-hidden="true">Leave empty<input name="website" tabindex="-1" autocomplete="off"></label>
    <button class="p-btn p-btn-lime p-big" type="submit">${esc(t.send)}</button>
  </form>`}
</div></section>

<footer class="p-foot"><div class="p-wrap">${esc(t.foot)}</div></footer>
</body>
</html>`;
}

function leadsPage({ leads = null, error = '' } = {}) {
  const rows = leads || [];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Enquiries</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap"><link rel="stylesheet" href="/pulse.css?v=3"></head>
<body class="p-leads"><div class="p-wrap p-narrow">
<h1>Enquiries from venues</h1>
${leads === null ? `${error ? `<div class="p-err">${esc(error)}</div>` : ''}<form class="p-form p-light" method="post" action="/leads"><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button class="p-btn p-btn-dark" type="submit">Open</button></form>` :
  `<p>${rows.length} enquir${rows.length === 1 ? 'y' : 'ies'}. <a href="/leads.csv">Download CSV</a></p>` + rows.map((l) => `<div class="p-lead"><div><b>${esc(l.name)}</b>${l.venue ? ` · ${esc(l.venue)}` : ''} <span class="p-pill">${esc(l.type)}</span></div>
  <div><a href="${String(l.contact).includes('@') ? 'mailto:' : 'tel:'}${esc(String(l.contact).replace(/\s/g, ''))}">${esc(l.contact)}</a> · ${esc(String(l.created_at).slice(0, 16).replace('T', ' '))} · ${esc(l.lang)}</div>
  ${l.needs ? `<div class="p-muted">${esc(l.needs)}</div>` : ''}${l.message ? `<p>${esc(l.message)}</p>` : ''}</div>`).join('')}
</div></body></html>`;
}

module.exports = { pitchPage, leadsPage, T };
