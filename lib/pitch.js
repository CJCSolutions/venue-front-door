'use strict';

// The Pulse sales page: what it is, why it matters, and a way to get in touch.
// Marea is the sample venue; this page sells the system behind it.

const { PRESETS, MODULES } = require('./presets');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const T = {
  en: {
    lang: 'en', other: 'es', otherLabel: 'Español',
    title: 'Pulse · one update, every channel',
    navDemo: 'See the sample', navContact: 'Get in touch',
    kicker: 'Pulse by Food for Thought',
    h1: 'Your venue’s front door, always up to date.',
    lede: 'Change tonight’s event, a price or your hours once, on your phone. Your website, menus, Google, Instagram, Facebook and your own guest list follow.',
    ctaDemo: 'See a live sample', ctaContact: 'Get in touch',
    sampleNote: 'Marea is a sample venue. Everything you see can be shaped to yours: your content, your brand, your own design.',
    problemTitle: 'The problem',
    problems: [
      ['Every channel says something different', 'Old hours on Google, last week’s line-up on Instagram, a PDF menu from last season.'],
      ['Updating takes too long', 'One change means five logins. When it’s busy, nobody does it.'],
      ['Bookings leak', 'DMs, calls and WhatsApps with no single place to see them.'],
      ['You don’t own your audience', 'Followers belong to Instagram. You can’t tell your best guests first.']
    ],
    flowTitle: 'One update. Every channel.',
    flowSub: 'Write it once. Pulse turns it into everything else.',
    flowIn: 'You, on your phone',
    flowInItems: ['Tonight’s event', 'A price or a sold-out dish', 'Today’s hours', 'A story'],
    flowOut: [['Website', 'auto'], ['QR menu', 'auto'], ['Google search data', 'auto'], ['The Circle', 'auto'], ['Stories', 'auto'], ['Instagram', 'share'], ['Google profile', 'share'], ['Facebook', 'share'], ['WhatsApp', 'share']],
    auto: 'Updates by itself', share: 'Ready-made post, one tap',
    structTitle: 'Structure that doesn’t break',
    structSub: 'The design and layout are set by us. Your team only changes the facts, so the site always looks right and stays consistent.',
    core: 'Always included', optional: 'Switch on what you need',
    casesTitle: 'Built for how you trade',
    casesSub: 'Start from the use case closest to yours. Tap one to see it live.',
    stylesTitle: 'Your look, or ours',
    stylesSub: 'Four starting styles in the sample. For your venue we design your own, to your brand.',
    styles: { poster: 'Poster wall', gallery: 'Gallery', beach: 'Beach club', dark: 'After dark' },
    howTitle: 'How it works',
    how: [['We set it up', 'Your content, menus, events and photos, in a design made for you.'], ['You update from your phone', 'Add an event, change a price, post a story. Seconds, not hours.'], ['Pulse pushes it everywhere', 'The site updates live; posts for each channel are ready to share.'], ['You see what works', 'Bookings, visits, Circle growth and profit per event, in one place.']],
    alsoTitle: 'Also included',
    also: ['Event bookings with capacity', 'Table and private hire requests', 'Menus by time of day', 'Offers that show when they’re on', 'English and Spanish captions', 'Stats per event and channel'],
    formTitle: 'Get in touch',
    formSub: 'Tell us about your venue. We’ll show you what Pulse would look like for you and design it around your brand.',
    fName: 'Your name', fVenue: 'Venue name', fType: 'Kind of venue', fContact: 'Phone or email', fNeeds: 'What would help most?', fMsg: 'Anything else',
    types: { cafe: 'Café', restaurant: 'Restaurant', bar: 'Bar or events venue', beach: 'Beach club or day venue', other: 'Something else' },
    needs: { website: 'A website that stays up to date', menus: 'Menus', events: 'Events and bookings', social: 'Posting to every channel', circle: 'Our own guest list', design: 'A new look' },
    consent: 'You can contact me about this.', send: 'Send', thanks: 'Thanks. We’ll be in touch shortly.',
    errName: 'Please add your name and a phone or email.', errConsent: 'Please tick the box so we can contact you.',
    foot: 'Pulse by Food for Thought · Ibiza'
  },
  es: {
    lang: 'es', other: 'en', otherLabel: 'English',
    title: 'Pulse · una actualización, todos los canales',
    navDemo: 'Ver el ejemplo', navContact: 'Contacto',
    kicker: 'Pulse por Food for Thought',
    h1: 'La puerta de entrada de tu local, siempre al día.',
    lede: 'Cambia el evento de esta noche, un precio o tu horario una sola vez, desde el móvil. Tu web, tus cartas, Google, Instagram, Facebook y tu propia lista de clientes se actualizan.',
    ctaDemo: 'Ver un ejemplo en vivo', ctaContact: 'Contacto',
    sampleNote: 'Marea es un local de ejemplo. Todo lo que ves se adapta al tuyo: tu contenido, tu marca y un diseño propio.',
    problemTitle: 'El problema',
    problems: [
      ['Cada canal dice algo distinto', 'Horarios viejos en Google, el cartel de la semana pasada en Instagram, una carta en PDF de la temporada anterior.'],
      ['Actualizar lleva demasiado tiempo', 'Un cambio son cinco accesos distintos. Cuando hay lío, nadie lo hace.'],
      ['Se pierden reservas', 'Mensajes, llamadas y WhatsApps sin un sitio donde verlos todos.'],
      ['Tu público no es tuyo', 'Los seguidores son de Instagram. No puedes avisar primero a tus mejores clientes.']
    ],
    flowTitle: 'Una actualización. Todos los canales.',
    flowSub: 'Lo escribes una vez. Pulse lo convierte en todo lo demás.',
    flowIn: 'Tú, desde el móvil',
    flowInItems: ['El evento de esta noche', 'Un precio o un plato agotado', 'El horario de hoy', 'Una historia'],
    flowOut: [['Web', 'auto'], ['Carta QR', 'auto'], ['Datos para Google', 'auto'], ['El Círculo', 'auto'], ['Historias', 'auto'], ['Instagram', 'share'], ['Perfil de Google', 'share'], ['Facebook', 'share'], ['WhatsApp', 'share']],
    auto: 'Se actualiza solo', share: 'Publicación lista, un toque',
    structTitle: 'Una estructura que no se rompe',
    structSub: 'El diseño y la estructura los fijamos nosotros. Tu equipo solo cambia los datos, así que la web siempre se ve bien y es coherente.',
    core: 'Siempre incluido', optional: 'Activa lo que necesites',
    casesTitle: 'Pensado para tu manera de trabajar',
    casesSub: 'Empieza por el caso más parecido al tuyo. Toca uno para verlo en vivo.',
    stylesTitle: 'Tu estilo, o el nuestro',
    stylesSub: 'Cuatro estilos de partida en el ejemplo. Para tu local diseñamos uno propio, con tu marca.',
    styles: { poster: 'Cartelería', gallery: 'Galería', beach: 'Beach club', dark: 'Noche' },
    howTitle: 'Cómo funciona',
    how: [['Lo montamos nosotros', 'Tu contenido, cartas, eventos y fotos, con un diseño hecho para ti.'], ['Tú actualizas desde el móvil', 'Añade un evento, cambia un precio, sube una historia. Segundos, no horas.'], ['Pulse lo lleva a todas partes', 'La web se actualiza al momento; las publicaciones de cada canal quedan listas.'], ['Ves lo que funciona', 'Reservas, visitas, crecimiento del Círculo y beneficio por evento, en un sitio.']],
    alsoTitle: 'También incluye',
    also: ['Reservas para eventos con aforo', 'Peticiones de mesa y eventos privados', 'Cartas según la hora del día', 'Ofertas que aparecen cuando están activas', 'Textos en inglés y español', 'Estadísticas por evento y canal'],
    formTitle: 'Contacto',
    formSub: 'Cuéntanos sobre tu local. Te enseñamos cómo quedaría Pulse para ti y lo diseñamos con tu marca.',
    fName: 'Tu nombre', fVenue: 'Nombre del local', fType: 'Tipo de local', fContact: 'Teléfono o email', fNeeds: '¿Qué te ayudaría más?', fMsg: 'Algo más',
    types: { cafe: 'Cafetería', restaurant: 'Restaurante', bar: 'Bar o sala de eventos', beach: 'Beach club o local de día', other: 'Otro' },
    needs: { website: 'Una web siempre al día', menus: 'Cartas', events: 'Eventos y reservas', social: 'Publicar en todos los canales', circle: 'Nuestra propia lista de clientes', design: 'Una imagen nueva' },
    consent: 'Podéis contactarme sobre esto.', send: 'Enviar', thanks: 'Gracias. Te contactamos pronto.',
    errName: 'Añade tu nombre y un teléfono o email.', errConsent: 'Marca la casilla para que podamos contactarte.',
    foot: 'Pulse por Food for Thought · Ibiza'
  }
};

const MODULE_ES = {
  hours: 'Horario y abierto ahora', visit: 'Cómo llegar y contacto', about: 'Quiénes somos', gallery: 'Galería', info: 'Info útil',
  menu: 'Cartas', offers: 'Ofertas', events: 'Eventos', bookings: 'Reservas de eventos', tables: 'Peticiones de mesa', hire: 'Eventos privados',
  order: 'Pedidos online', stories: 'Historias', circle: 'El Círculo', reviews: 'Reseñas'
};
const PRESET_ES = { cafe: ['Cafetería', 'Carta, horario y cómo llegar primero, con un poco de historia y fotos.'], restaurant: ['Restaurante con noches temáticas', 'Cartas y reservas primero; noches temáticas, eventos privados y el Círculo llenan mesas.'], bar: ['Bar con eventos', 'Los eventos mandan, con reservas, historias y el Círculo; la carta de copas debajo.'], beach: ['Beach club o local de día', 'Camas y mesas, la carta, sesiones al atardecer y fotos del lugar.'] };

function pitchPage({ lang = 'en', sent = false, error = '', values = {} } = {}) {
  const t = T[lang] || T.en;
  const v = values;
  const moduleName = (k) => (lang === 'es' ? MODULE_ES[k] : MODULES[k].label);
  const core = Object.keys(MODULES).filter((k) => MODULES[k].core);
  const optional = Object.keys(MODULES).filter((k) => !MODULES[k].core);
  const presetText = (k) => (lang === 'es' ? PRESET_ES[k] : [PRESETS[k].label, PRESETS[k].pitch]);
  const looks = { cafe: 'gallery', restaurant: 'beach', bar: 'poster', beach: 'dark' };

  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.lede)}">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.lede)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&family=Libre+Franklin:wght@500&family=Playfair+Display&family=Space+Grotesk:wght@700&display=swap">
<link rel="stylesheet" href="/pulse.css?v=1">
</head>
<body>
<header class="p-top"><div class="p-wrap p-row">
  <a class="p-logo" href="/pulse${lang === 'es' ? '?lang=es' : ''}"><span>Pulse</span></a>
  <nav><a href="/">${esc(t.navDemo)}</a><a href="/pulse?lang=${t.other}">${esc(t.otherLabel)}</a><a class="p-btn p-btn-lime" href="#contact">${esc(t.navContact)}</a></nav>
</div></header>

<section class="p-hero"><div class="p-wrap">
  <p class="p-kicker">${esc(t.kicker)}</p>
  <h1>${esc(t.h1)}</h1>
  <p class="p-lede">${esc(t.lede)}</p>
  <p class="p-actions"><a class="p-btn p-btn-lime" href="/">${esc(t.ctaDemo)} →</a><a class="p-btn p-btn-line" href="#contact">${esc(t.ctaContact)}</a></p>
  <p class="p-note">${esc(t.sampleNote)}</p>
</div></section>

<section class="p-sec"><div class="p-wrap">
  <h2>${esc(t.problemTitle)}</h2>
  <div class="p-grid4">${t.problems.map(([h, b], i) => `<div class="p-card"><span class="p-num">0${i + 1}</span><b>${esc(h)}</b><p>${esc(b)}</p></div>`).join('')}</div>
</div></section>

<section class="p-sec p-dark"><div class="p-wrap">
  <h2>${esc(t.flowTitle)}</h2><p class="p-sub">${esc(t.flowSub)}</p>
  <div class="p-flow">
    <div class="p-in"><span class="p-tag">${esc(t.flowIn)}</span>${t.flowInItems.map((x) => `<div class="p-chip">${esc(x)}</div>`).join('')}</div>
    <div class="p-arrow" aria-hidden="true"><span>Pulse</span></div>
    <div class="p-out">${t.flowOut.map(([x, k]) => `<div class="p-chip ${k}"><i></i>${esc(x)}</div>`).join('')}</div>
  </div>
  <p class="p-legend"><span class="auto"><i></i>${esc(t.auto)}</span><span class="share"><i></i>${esc(t.share)}</span></p>
</div></section>

<section class="p-sec"><div class="p-wrap">
  <h2>${esc(t.structTitle)}</h2><p class="p-sub">${esc(t.structSub)}</p>
  <div class="p-modules">
    <div><span class="p-tag">${esc(t.core)}</span>${core.map((k) => `<div class="p-mod core">${esc(moduleName(k))}</div>`).join('')}</div>
    <div><span class="p-tag">${esc(t.optional)}</span><div class="p-modgrid">${optional.map((k) => `<div class="p-mod">${esc(moduleName(k))}</div>`).join('')}</div></div>
  </div>
</div></section>

<section class="p-sec p-soft"><div class="p-wrap">
  <h2>${esc(t.casesTitle)}</h2><p class="p-sub">${esc(t.casesSub)}</p>
  <div class="p-grid4">${Object.keys(PRESETS).map((k) => { const [name, pitch] = presetText(k); return `<a class="p-card p-case" href="/?usecase=${k}&look=${looks[k]}"><b>${esc(name)}</b><p>${esc(pitch)}</p><span class="p-go">→</span></a>`; }).join('')}</div>
</div></section>

<section class="p-sec"><div class="p-wrap">
  <h2>${esc(t.stylesTitle)}</h2><p class="p-sub">${esc(t.stylesSub)}</p>
  <div class="p-grid4">${Object.keys(t.styles).map((k) => `<a class="p-style p-style-${k}" href="/?look=${k}"><span>Marea</span><b>${esc(t.styles[k])}</b></a>`).join('')}</div>
</div></section>

<section class="p-sec p-soft"><div class="p-wrap">
  <h2>${esc(t.howTitle)}</h2>
  <div class="p-grid4">${t.how.map(([h, b], i) => `<div class="p-card"><span class="p-num">${i + 1}</span><b>${esc(h)}</b><p>${esc(b)}</p></div>`).join('')}</div>
  <h3>${esc(t.alsoTitle)}</h3>
  <ul class="p-also">${t.also.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
</div></section>

<section class="p-sec p-dark" id="contact"><div class="p-wrap p-narrow">
  <h2>${esc(t.formTitle)}</h2><p class="p-sub">${esc(t.formSub)}</p>
  ${sent ? `<div class="p-ok" role="status">${esc(t.thanks)}</div>` : `
  ${error ? `<div class="p-err" role="alert">${esc(error)}</div>` : ''}
  <form class="p-form" method="post" action="/pulse#contact">
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
<title>Pulse leads</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap"><link rel="stylesheet" href="/pulse.css?v=1"></head>
<body class="p-leads"><div class="p-wrap p-narrow">
<h1>Pulse leads</h1>
${leads === null ? `${error ? `<div class="p-err">${esc(error)}</div>` : ''}<form class="p-form p-light" method="post" action="/pulse/leads"><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button class="p-btn p-btn-dark" type="submit">Open</button></form>` :
  `<p>${rows.length} enquir${rows.length === 1 ? 'y' : 'ies'}. <a href="/pulse/leads.csv">Download CSV</a></p>` + rows.map((l) => `<div class="p-lead"><div><b>${esc(l.name)}</b>${l.venue ? ` · ${esc(l.venue)}` : ''} <span class="p-pill">${esc(l.type)}</span></div>
  <div><a href="${String(l.contact).includes('@') ? 'mailto:' : 'tel:'}${esc(String(l.contact).replace(/\s/g, ''))}">${esc(l.contact)}</a> · ${esc(String(l.created_at).slice(0, 16).replace('T', ' '))} · ${esc(l.lang)}</div>
  ${l.needs ? `<div class="p-muted">${esc(l.needs)}</div>` : ''}${l.message ? `<p>${esc(l.message)}</p>` : ''}</div>`).join('')}
</div></body></html>`;
}

module.exports = { pitchPage, leadsPage, T };
