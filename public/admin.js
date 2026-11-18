/* Venue editor: phone-first. Every save goes to /api/admin/action, which
   returns what changed and which touchpoints it reached. */
(function () {
  'use strict';

  var S = { data: null, tab: 'today', menuId: null, inbox: 'bookings', lastChange: null };
  var view = document.getElementById('view');
  var sheet = document.getElementById('sheet');
  var tabs = document.getElementById('tabs');

  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var DAY_NAME = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  var EN_D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var EN_M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ES_D = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var ES_M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // ---------- helpers ----------
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function d(date) { return new Date(date + 'T12:00:00Z'); }
  function shortDate(date) { var x = d(date); return EN_D[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + EN_M[x.getUTCMonth()]; }
  function esDate(date) { var x = d(date); return ES_D[x.getUTCDay()] + ' ' + x.getUTCDate() + ' de ' + ES_M[x.getUTCMonth()]; }
  function euro(n) { if (n == null) return '–'; n = Number(n); return '€' + (Number.isInteger(n) ? n.toLocaleString('en') : n.toFixed(2)); }
  function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.add('hidden'); }, 3200); }
  function L() { return S.data.labels; }
  function V() { return S.data.state.venue; }
  function allUpcoming() { return S.data.schedule.tonight.concat(S.data.schedule.upcoming); }
  function whenWord(o) { if (o.date !== S.data.schedule.today) return shortDate(o.date); return o.doors && o.doors < '17:00' ? 'Today' : 'Tonight'; }

  function api(url, opts) {
    opts = opts || {};
    return fetch(url, { method: opts.method || 'GET', headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && url !== '/api/login') { showLogin(); throw new Error(j.error || 'Please log in'); }
          if (!r.ok) throw new Error(j.error || 'Something went wrong');
          return j;
        });
      });
  }

  function load() {
    return api('/api/admin/state').then(function (j) {
      S.data = j;
      document.getElementById('title').textContent = j.state.venue.name;
      if (!S.menuId || !j.state.menus.some(function (m) { return m.id === S.menuId; })) S.menuId = j.state.menus[0] ? j.state.menus[0].id : null;
      var Mo = j.state.venue.modules;
      var vis = { events: Mo.events, menu: Mo.menu || Mo.offers || Mo.preorder, inbox: Mo.tables || Mo.hire || Mo.bookings || Mo.preorder || Mo.collect, circle: Mo.circle };
      Object.keys(vis).forEach(function (k) { tabs.querySelector('[data-tab="' + k + '"]').classList.toggle('hidden', !vis[k]); });
      if (vis[S.tab] === false) S.tab = 'today';
      var waiting = j.enquiries.filter(function (e) { return e.status === 'new'; }).length + j.orders.filter(function (o) { return o.status === 'new' && o.date >= j.schedule.today; }).length + j.reservations.filter(function (r) { return r.status === 'pending'; }).length;
      if (!S.inboxSet) { S.inbox = j.tablesOn ? 'tables' : Mo.bookings ? 'bookings' : (Mo.preorder || Mo.collect) ? 'orders' : 'requests'; S.inboxSet = true; }
      document.title = (waiting ? '(' + waiting + ') ' : '') + j.state.venue.name + ' · Editor';
      var btn = tabs.querySelector('[data-tab="inbox"]'), badge = btn.querySelector('.badge');
      if (waiting) { if (!badge) { badge = document.createElement('i'); badge.className = 'badge'; btn.appendChild(badge); } badge.textContent = waiting; }
      else if (badge) badge.remove();
      render();
    });
  }

  function act(type, payload) {
    return api('/api/admin/action', { method: 'POST', body: { action: { type: type, payload: payload } } }).then(function (j) {
      S.lastChange = j.change;
      return load().then(function () { return j; });
    });
  }
  function fail(err) { toast(err.message); }

  // ---------- login ----------
  function showLogin() {
    tabs.classList.add('hidden');
    api('/api/editor-info').catch(function () { return {}; }).then(function (info) {
      view.innerHTML = '<div class="login"><p class="muted">Venue editor</p><h2>Log in to update your venue</h2>' +
        '<p class="muted">Change an event, the menu or the hours. The website and every touchpoint follow.</p>' +
        (info.demo ? '<div class="card"><b>Demo password:</b> ' + esc(info.demoPassword) + '<br><span class="muted">This demo edits <b>Marea</b>, the sample restaurant. Sol, Lunar and Cala Blanca are showcases. It is public, so anyone can edit; reset it under More.</span></div>' : '') +
        '<form id="loginForm"><label class="f">Password<input type="password" name="password" autocomplete="current-password" required></label>' +
        '<div id="loginErr"></div><button class="btn dark block" type="submit">Log in</button></form></div>';
      $('#loginForm').addEventListener('submit', function (e) {
        e.preventDefault();
        api('/api/login', { method: 'POST', body: { password: e.target.password.value } })
          .then(function () { tabs.classList.remove('hidden'); return load().then(startPulse); })
          .catch(function (err) { $('#loginErr').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; });
      });
    });
  }

  // ---------- render ----------
  function render() {
    $$('button', tabs).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === S.tab); });
    ({ today: viewToday, events: viewEvents, menu: viewMenu, inbox: viewInbox, circle: viewCircle, stats: viewStats, more: viewMore })[S.tab]();
  }
  function go(tab) { S.tab = tab; render(); window.scrollTo(0, 0); }

  function touchpointsHtml(change) {
    if (!change) return '';
    return '<div class="card"><b>' + esc(change.summary) + '</b><div class="tp">' +
      change.touchpoints.auto.map(function (t) { return '<span class="a">✓ ' + esc(t) + '</span>'; }).join('') +
      change.touchpoints.share.map(function (t) { return '<span class="s">↗ ' + esc(t) + '</span>'; }).join('') + '</div>' +
      '<span class="muted">Green updated by itself. Amber is ready to share in one tap.</span></div>';
  }

  function bookedLine(o) {
    if (!o.bookable) return '';
    var c = S.data.counts[o.key] || { guests: 0 };
    return o.capacity ? c.guests + '/' + o.capacity + ' booked' : c.guests + ' booked';
  }

  function dateBox(date) { var x = d(date); return '<div class="datebox">' + EN_D[x.getUTCDay()] + '<span>' + x.getUTCDate() + '</span></div>'; }

  // ---------- Today ----------
  function viewToday() {
    var j = S.data, sc = j.schedule, st = j.status, v = V();
    var serving = j.menus.find(function (m) { return m.active; });
    var live = (j.state.storyThemes || []);
    var html = '<p class="muted">' + esc(shortDate(sc.today)) + ' · ' + esc(S.data.catalog.presets[v.type].label) + '</p><h2>Today</h2>';
    html += '<div class="card"><span class="pill ' + (st.open ? 'ok' : 'bad') + '">' + esc(st.label) + '</span>' +
      (serving ? ' <span class="pill plain">Serving ' + esc(serving.name) + '</span>' : '') +
      (sc.tonight.length ? sc.tonight.map(function (o) {
        return '<div style="margin-top:12px"><b style="font-size:20px">' + esc(o.name) + '</b><div class="muted">From ' + esc(o.doors || '–') + (bookedLine(o) ? ' · ' + bookedLine(o) : '') + '</div>' +
          '<div class="btnrow"><button class="btn small dark" data-share="' + esc(o.key) + '">Share ↗</button><button class="btn small" data-results="' + esc(o.key) + '">Bookings & results</button><button class="btn small" data-edit-event="' + esc(o.eventId) + '">Edit</button></div></div>';
      }).join('') : '<p style="margin:10px 0 0">Nothing on today. The site leads with the next ' + esc(L().event.toLowerCase()) + ' and what is on the menu.</p>') + '</div>';
    html += todayList();
    html += '<div class="quick">' +
      (v.modules.events ? '<button class="dark" data-go="newevent"><span>＋</span><span>Add ' + esc(L().event.toLowerCase()) + '</span></button>' : '') +
      (v.modules.offers ? '<button data-go="newoffer"><span>%</span><span>Add an offer</span></button>' : '') +
      (v.modules.stories ? '<button data-go="story"><span>◐</span><span>Post a story' + (live.length ? ' <small>(' + live.length + ' live)</small>' : '') + '</span></button>' : '') +
      (v.modules.menu ? '<button data-go="menu"><span>≡</span><span>Edit menu</span></button>' : '') +
      '<button data-go="closetoday"><span>✕</span><span>' + (st.special && !st.today ? 'Open today after all' : 'Close today') + '</span></button></div>';
    if (v.modules.preorder && j.prep.length) html += '<h3>Pre-orders to make</h3>' + j.prep.slice(0, 2).map(prepCard).join('');
    if (S.lastChange) html += '<h3>Your last change</h3>' + touchpointsHtml(S.lastChange);
    html += '<h3>Coming up</h3>' + sc.upcoming.slice(0, 6).map(function (o) {
      return '<div class="row">' + dateBox(o.date) + '<div class="grow"><b>' + esc(o.name) + '</b><span class="muted">' + (o.circleFirst ? 'Circle first · ' : '') + (bookedLine(o) || (o.repeat !== 'none' ? 'Repeats ' + o.repeat : 'One-off')) + (o.photo ? '' : ' · no photo') + '</span></div><button class="btn small" data-share="' + esc(o.key) + '">Share</button></div>';
    }).join('');
    html += '<h3>Recent changes</h3>' + j.changes.map(function (c) {
      return '<div class="row"><div class="grow">' + esc(c.summary) + '<div class="muted">' + esc(new Date(c.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })) + '</div></div></div>';
    }).join('');
    view.innerHTML = html;
  }

  // ---------- Events ----------
  function nextOf(ev) { return allUpcoming().find(function (x) { return x.eventId === ev.id; }); }

  function viewEvents() {
    var evs = S.data.state.events.slice().sort(function (a, b) { var x = nextOf(a), y = nextOf(b); return (x ? x.date : '9').localeCompare(y ? y.date : '9'); });
    view.innerHTML = '<h2>' + esc(L().events) + '</h2><button class="btn dark block" data-go="newevent">＋ Add ' + esc(L().event.toLowerCase()) + '</button>' +
      '<p class="muted" style="margin-top:10px">Set it once. It appears on the site, takes bookings if you want, repeats if it repeats, and files itself into the archive afterwards.</p>' +
      evs.map(function (ev) {
        var nx = nextOf(ev);
        return '<div class="row"><div class="grow"><b>' + esc(ev.name) + '</b><span class="muted">' +
          (ev.repeat === 'weekly' ? 'Every ' + EN_D[d(ev.start).getUTCDay()] : ev.repeat === 'monthly' ? 'Monthly' : 'One-off') +
          ' · ' + (nx ? 'next ' + shortDate(nx.date) : 'finished') + (ev.bookable ? ' · bookable' : '') + (nx && nx.circleFirst ? ' · Circle first' : '') + '</span></div>' +
          (nx ? '<button class="btn small" data-share="' + esc(nx.key) + '">Share</button>' : '') +
          '<button class="btn small" data-edit-event="' + esc(ev.id) + '">Edit</button></div>';
      }).join('') +
      '<h3>Past dates</h3><p class="muted">Add takings and costs so Stats can show what each one earned.</p>' +
      S.data.schedule.past.slice(0, 10).map(function (o) {
        var led = (S.data.state.ledger || {})[o.key];
        return '<div class="row">' + dateBox(o.date) + '<div class="grow"><b>' + esc(o.name) + '</b><span class="muted">' + (led ? euro(led.revenue) + ' taken · ' + euro(led.revenue - led.talent - led.marketing - led.other) + ' profit' : 'No results yet') + '</span></div><button class="btn small" data-results="' + esc(o.key) + '">' + (led ? 'Edit' : 'Add results') + '</button></div>';
      }).join('');
  }

  // ---------- Menu builder ----------
  function curMenu() { return S.data.state.menus.find(function (m) { return m.id === S.menuId; }); }
  function menuTimes(m) {
    if (m.allDay) return 'All day';
    return (m.days.length === 7 ? 'Every day' : m.days.map(function (k) { return DAY_NAME[k]; }).join(', ')) + ' · ' + m.from + '–' + m.to;
  }

  function viewMenu() {
    var menus = S.data.state.menus, m = curMenu();
    var active = S.data.menus.filter(function (x) { return x.active; }).map(function (x) { return x.id; });
    var html = '';
    if (V().modules.offers) {
      html += '<h2>Offers</h2><p class="muted">Show on the site only while they are on, with a badge.</p>' + S.data.offers.map(function (o) {
        return '<div class="row"><div class="grow"><b>' + esc(o.name) + '</b>' + (o.active ? ' <span class="pill ok">On now</span>' : '') + '<span class="muted">' + esc(o.days.map(function (k) { return DAY_NAME[k]; }).join(', ')) + ' · ' + esc(o.from) + '–' + esc(o.to) + '</span></div><button class="btn small" data-edit-offer="' + esc(o.id) + '">Edit</button></div>';
      }).join('') + '<button class="btn small" style="margin:10px 0 18px" data-go="newoffer">＋ Add an offer</button>';
    }
    if (V().modules.preorder) html += preorderSection();
    if (!V().modules.menu) { view.innerHTML = html; return; }
    html += '<h2>Menus</h2><div class="chips">' + menus.map(function (x) {
      return '<button data-menu="' + esc(x.id) + '" class="' + (x.id === S.menuId ? 'on' : '') + '">' + esc(x.name) + (active.indexOf(x.id) >= 0 ? ' •' : '') + '</button>';
    }).join('') + '<button data-new-menu>＋ Menu</button></div>';
    if (!m) { view.innerHTML = html + '<p class="muted">No menus yet. Add one: breakfast, lunch, dinner, drinks, brunch…</p>'; return; }
    html += '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><b style="font-size:18px">' + esc(m.name) + '</b>' + (active.indexOf(m.id) >= 0 ? ' <span class="pill ok">Serving now</span>' : '') + '<div class="muted">' + esc(menuTimes(m)) + '</div></div><button class="btn small" data-edit-menu>Times & days</button></div>' +
      '<p class="muted" style="margin:8px 0 0">The site shows this menu during these times and switches by itself.</p></div>';
    m.sections.forEach(function (sec) {
      html += '<div class="sec-head"><h3>' + esc(sec.name) + '</h3><button class="link" data-edit-section="' + esc(sec.id) + '">Rename</button></div>';
      sec.items.forEach(function (it, i) {
        html += '<div class="row item"><div class="grow"><b class="tap" data-edit-item="' + esc(sec.id) + '|' + esc(it.id) + '">' + esc(it.name) + '</b>' + (it.tags.length ? '<span class="muted">' + esc(it.tags.join(' · ')) + '</span>' : '') +
          '<span class="mover"><button aria-label="Move up" data-move="' + esc(sec.id) + '|' + esc(it.id) + '|up" ' + (i === 0 ? 'disabled' : '') + '>↑</button><button aria-label="Move down" data-move="' + esc(sec.id) + '|' + esc(it.id) + '|down" ' + (i === sec.items.length - 1 ? 'disabled' : '') + '>↓</button></span></div>' +
          '<div class="stepper"><button aria-label="Lower price" data-price="' + esc(sec.id) + '|' + esc(it.id) + '|-1">−</button><output>' + euro(it.price) + '</output><button aria-label="Raise price" data-price="' + esc(sec.id) + '|' + esc(it.id) + '|1">+</button></div>' +
          '<button class="toggle ' + (it.soldOut ? 'off' : 'on') + '" data-sold="' + esc(sec.id) + '|' + esc(it.id) + '">' + (it.soldOut ? 'Sold out' : 'On') + '</button></div>';
      });
      html += '<button class="btn small" style="margin:10px 0 4px" data-new-item="' + esc(sec.id) + '">＋ Add to ' + esc(sec.name) + '</button>';
    });
    html += '<div style="display:grid;gap:10px;margin-top:20px"><button class="btn block" data-new-section>＋ Add a section</button></div>' +
      '<p class="muted" style="margin-top:14px">Every change shows on the website and the QR menu straight away.</p>';
    view.innerHTML = html;
  }

  // ---------- Inbox ----------
  function viewInbox() {
    var j = S.data;
    var Mo = V().modules;
    var pend = j.reservations.filter(function (r) { return r.status === 'pending'; }).length;
    var html = '<h2>Inbox</h2>' + alertsLine() + '<div class="chips">' +
      (j.tablesOn ? '<button data-inbox="tables" class="' + (S.inbox === 'tables' ? 'on' : '') + '">Tables' + (pend ? ' (' + pend + ' to confirm)' : '') + '</button>' : '') +
      (Mo.bookings ? '<button data-inbox="bookings" class="' + (S.inbox === 'bookings' ? 'on' : '') + '">Event bookings</button>' : '') +
      (Mo.preorder || Mo.collect ? '<button data-inbox="orders" class="' + (S.inbox === 'orders' ? 'on' : '') + '">Orders</button>' : '') +
      '<button data-inbox="requests" class="' + (S.inbox === 'requests' ? 'on' : '') + '">' + (j.tablesOn ? 'Requests' : 'Table & hire requests') + '</button></div>';
    if (S.inbox === 'tables') {
      html += tablesInbox();
    } else if (S.inbox === 'orders') {
      html += ordersInbox();
    } else if (S.inbox === 'bookings') {
      var upcoming = allUpcoming().filter(function (o) { return o.bookable; });
      html += upcoming.length ? upcoming.slice(0, 12).map(function (o) {
        var list = j.bookings.filter(function (b) { return b.event_key === o.key; });
        return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(o.name) + '</b><span class="pill plain">' + esc(whenWord(o)) + '</span></div><div class="muted">' + esc(bookedLine(o)) + (o.price ? ' · ' + euro(o.price) + ' each' : '') + '</div>' +
          (list.length ? list.map(bookingRow).join('') : '<p class="muted" style="margin:8px 0 0">No bookings yet. Share it to get some.</p>') + '</div>';
      }).join('') : '<div class="card">No bookable events coming up. Turn on bookings when you add or edit an event.</div>';
    } else {
      html += j.enquiries.length ? j.enquiries.map(function (e) {
        return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(e.name) + '</b><span class="pill ' + (e.status === 'new' ? 'warn' : e.status === 'booked' ? 'ok' : 'plain') + '">' + esc(e.status) + '</span></div>' +
          '<div class="muted">' + esc(e.type) + (e.date ? ' · ' + esc(shortDate(e.date)) : '') + (e.guests ? ' · ' + esc(e.guests) + ' guests' : '') + ' · from ' + esc(e.source || 'direct') + '</div>' +
          '<div style="margin:8px 0"><a href="' + (e.contact.indexOf('@') > 0 ? 'mailto:' : 'tel:') + esc(e.contact.replace(/\s/g, '')) + '">' + esc(e.contact) + '</a></div>' +
          (e.message ? '<div style="white-space:pre-wrap;margin-bottom:8px">' + esc(e.message) + '</div>' : '') +
          '<div class="chips" style="margin:0">' + ['replied', 'booked', 'declined'].map(function (s) { return '<button data-enq="' + e.id + '" data-status="' + s + '" class="' + (e.status === s ? 'on' : '') + '">' + s[0].toUpperCase() + s.slice(1) + '</button>'; }).join('') + '</div></div>';
      }).join('') : '<div class="card">No requests yet.</div>';
    }
    view.innerHTML = html;
  }

  function contactLinks(c) {
    var mail = c.indexOf('@') > 0;
    return '<a href="' + (mail ? 'mailto:' : 'tel:') + esc(c.replace(/\s/g, '')) + '">' + esc(c) + '</a>';
  }
  function waLink(c, msg) {
    var digits = String(c || '').replace(/[^\d+]/g, '');
    if (c.indexOf('@') > 0 || digits.replace('+', '').length < 8) return '';
    var n = digits.charAt(0) === '+' ? digits.slice(1) : digits.indexOf('00') === 0 ? digits.slice(2) : digits.length === 9 ? '34' + digits : digits;
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg);
  }
  function resRow(r, withDate) {
    var v = V().name, when = shortDate(r.date) + ' at ' + r.time;
    var wa = waLink(r.contact, 'Hi ' + r.name + ', about your table for ' + r.guests + ' at ' + v + ' on ' + when + ': ');
    var pill = { pending: 'warn', confirmed: 'ok', arrived: 'ok', declined: 'bad', cancelled: 'plain', 'no-show': 'bad' }[r.status] || 'plain';
    return '<div class="row" style="align-items:flex-start"><div class="grow"><b>' + esc(r.time) + ' · ' + esc(r.name) + ' · ' + esc(r.guests) + '</b>' + (r.status === 'pending' ? ' <span class="pill ' + pill + '">to confirm</span>' : '') +
      (withDate ? '<div class="muted">' + esc(shortDate(r.date)) + '</div>' : '') +
      '<div class="muted">' + contactLinks(r.contact) + (wa ? ' · <a href="' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') + ' · ' + esc(r.source || 'direct') + '</div>' +
      (r.note ? '<div class="muted">“' + esc(r.note) + '”</div>' : '') +
      (r.status === 'pending' ? '<div class="btnrow"><button class="btn small dark" data-res="' + r.id + '" data-status="confirmed">Confirm</button><button class="btn small" data-res="' + r.id + '" data-status="declined">Decline</button></div>' : '') + '</div>' +
      (r.status !== 'pending' ? '<select data-res-sel="' + r.id + '" aria-label="Booking status">' + ['confirmed', 'arrived', 'no-show', 'cancelled', 'declined'].map(function (s) { return '<option ' + (r.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' : '') + '</div>';
  }
  function tablesInbox() {
    var j = S.data, t = j.tables;
    var list = j.reservations.filter(function (r) { return r.date >= j.localToday; });
    var head = '<p class="muted">' + t.times.length + ' booking times, ' + t.covers + ' guests each, up to ' + t.maxParty + ' per table. ' + (t.mode === 'auto' ? 'Confirmed automatically while there is space.' : 'You confirm each booking.') + ' <a href="#" data-content="tables">Change</a></p>' +
      '<button class="btn small dark" data-content="addres" style="margin-bottom:12px">＋ Add a phone booking</button>';
    if (!list.length) return head + '<div class="card">No table bookings coming up. Share your booking link: <b>' + esc(j.baseUrl) + '/book</b></div>';
    var by = {};
    list.forEach(function (r) { (by[r.date] = by[r.date] || []).push(r); });
    return head + Object.keys(by).sort().map(function (date) {
      var rows = by[date], guests = rows.filter(function (r) { return ['pending', 'confirmed', 'arrived'].indexOf(r.status) >= 0; }).reduce(function (a, r) { return a + r.guests; }, 0);
      return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(date === j.localToday ? 'Today' : shortDate(date)) + '</b><span class="pill plain">' + guests + ' guests</span></div>' + rows.map(function (r) { return resRow(r, false); }).join('') + '</div>';
    }).join('');
  }
  function alertsLine() {
    var a = S.data.alerts;
    if (!a.to) return '<p class="muted">Email alerts are off: add an email in <a href="#" data-content="alerts">Alerts</a>. This page rings while it is open.</p>';
    return '<p class="muted">New bookings and orders ' + (a.mailbox ? 'are emailed to <b>' + esc(a.to) + '</b>' : 'will be emailed to <b>' + esc(a.to) + '</b> once the mailbox is set up') + '. This page also rings while it is open. <a href="#" data-content="alerts">Change</a></p>';
  }
  function todayList() {
    var j = S.data, today = j.localToday;
    var res = j.reservations.filter(function (r) { return r.date === today && ['declined', 'cancelled'].indexOf(r.status) < 0; });
    var ords = j.orders.filter(function (o) { return o.date === today && o.status !== 'cancelled'; });
    if (!res.length && !ords.length) return '';
    var items = res.map(function (r) { return { t: r.time, html: resRow(r, false) }; }).concat(ords.map(function (o) { return { t: o.slot, html: orderRow(o) }; }));
    items.sort(function (a, b) { return a.t.localeCompare(b.t); });
    return '<h3>Today’s tables and orders</h3><div class="card">' + items.map(function (x) { return x.html; }).join('') + '</div>';
  }

  function bookingRow(b) {
    return '<div class="row"><div class="grow"><b>' + esc(b.name) + ' · ' + esc(b.guests) + '</b><span class="muted"><a href="' + (b.contact.indexOf('@') > 0 ? 'mailto:' : 'tel:') + esc(b.contact.replace(/\s/g, '')) + '">' + esc(b.contact) + '</a> · ' + esc(b.source || 'direct') + '</span></div>' +
      '<select data-booking="' + b.id + '" aria-label="Booking status">' + ['confirmed', 'arrived', 'no-show', 'cancelled'].map(function (s) { return '<option ' + (b.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>';
  }

  // ---------- Circle ----------
  function viewCircle() {
    var j = S.data, st = j.stats, v = V();
    if (!v.modules.circle) { view.innerHTML = '<h2>The Circle</h2><div class="card">The Circle is switched off. Turn it on under More → Modules.</div>'; return; }
    var early = allUpcoming().filter(function (o) { return o.circleFirst; });
    var stories = (j.state.stories || []).filter(function (s) { return s.circleOnly; }).slice(-5).reverse();
    var joinUrl = j.baseUrl + '/circle?src=print';
    view.innerHTML = '<h2>The Circle</h2><p class="muted">Your own list. People who hear first and book first. It belongs to you, not to Instagram.</p>' +
      '<div class="tiles"><div class="tile"><b>' + st.headline.members + '</b><span>members</span></div><div class="tile"><b>+' + st.headline.newMembers + '</b><span>last 30 days</span></div></div>' +
      '<h3>Give them something first</h3>' +
      '<div class="quick"><button class="dark" data-go="newevent-circle"><span>＋</span><span>Circle-first ' + esc(L().event.toLowerCase()) + '</span></button>' +
      (v.modules.stories ? '<button data-go="story-circle"><span>◐</span><span>Circle-only story</span></button>' : '') + '</div>' +
      (early.length ? '<div class="card"><b>Members see these now</b>' + early.map(function (o) { return '<div class="row"><div class="grow">' + esc(o.name) + '<span class="muted">' + esc(shortDate(o.date)) + ' · public ' + esc(new Date(o.publicFrom).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })) + '</span></div></div>'; }).join('') + '</div>' : '') +
      (stories.length ? '<div class="card"><b>Circle stories</b>' + stories.map(function (s) { return '<div class="row"><div class="grow">' + esc(s.caption || 'Photo') + '</div></div>'; }).join('') + '</div>' : '') +
      '<h3>Ways in</h3><div class="card"><b>Join link</b><div class="muted" style="word-break:break-all">' + esc(joinUrl) + '</div><div class="btnrow"><button class="btn small" data-copy="' + esc(joinUrl) + '">Copy link</button></div><p class="muted" style="margin:8px 0 0">Put it on posters, the menu QR, your Instagram bio and receipts. Every signup is tagged with where it came from.</p></div>' +
      '<div class="card"><b>Where members came from</b>' + bars(st.memberSources) + '</div>' +
      '<h3>Members</h3><div class="btnrow" style="margin-bottom:8px"><a class="btn small" href="/api/admin/members.csv">Download list (CSV)</a></div>' +
      '<p class="muted">Use the list with your email tool to send news. Everyone ticked a box agreeing to hear from you.</p>' +
      j.members.slice(0, 30).map(function (m) { return '<div class="row"><div class="grow"><b>' + esc(m.name) + '</b><span class="muted">' + esc(m.email) + ' · ' + esc(m.source || 'direct') + '</span></div><span class="muted">' + esc(String(m.created_at).slice(5, 10).split('-').reverse().join('/')) + '</span></div>'; }).join('');
  }

  // ---------- Stats ----------
  function bars(list) {
    var max = Math.max.apply(null, list.map(function (x) { return x.n; }).concat([1]));
    return list.map(function (x) { return '<div class="bar"><span>' + esc(x.source) + '</span><i><b style="width:' + Math.round(x.n / max * 100) + '%"></b></i><em>' + x.n + '</em></div>'; }).join('') || '<p class="muted">Nothing yet.</p>';
  }

  function viewStats() {
    var st = S.data.stats, h = st.headline;
    var maxV = Math.max.apply(null, st.days.map(function (x) { return x.views; }).concat([1]));
    view.innerHTML = '<h2>Stats</h2><p class="muted">Last 30 days. Takings and costs come from the results you add for each date.</p>' +
      '<div class="tiles">' +
      tile(h.visits.toLocaleString('en'), 'website visits') + tile(h.bookings, 'event bookings') + tile(h.guests, 'guests booked') + tile(h.members, 'Circle members') +
      tile(euro(h.revenue), 'event takings') + tile(euro(h.profit), 'event profit') +
      (V().modules.preorder ? tile(h.orders, 'pre-orders') + tile(euro(h.orderValue), 'pre-order value') : '') + '</div>' +
      '<h3>Visits, last 14 days</h3><div class="spark">' + st.days.map(function (x) { var dd = d(x.day); return '<div title="' + esc(shortDate(x.day)) + ': ' + x.views + '"><b style="height:' + Math.max(3, Math.round(x.views / maxV * 100)) + '%"></b><span>' + EN_D[dd.getUTCDay()][0] + '</span></div>'; }).join('') + '</div>' +
      '<h3>Which ' + esc(L().events.toLowerCase()) + ' earn their place</h3>' +
      (st.ranking.length ? '<table class="tbl"><thead><tr><th>' + esc(L().event) + '</th><th>Avg takings</th><th>Avg profit</th><th>Per hour</th></tr></thead><tbody>' +
        st.ranking.map(function (r) { return '<tr><td>' + esc(r.name) + '<span class="muted"> ×' + r.dates + '</span></td><td>' + euro(r.avgRevenue) + '</td><td class="' + (r.avgProfit < 0 ? 'neg' : '') + '">' + euro(r.avgProfit) + '</td><td>' + (r.profitPerHour != null ? euro(r.profitPerHour) : '–') + '</td></tr>'; }).join('') + '</tbody></table>'
        : '<p class="muted">Add results to past dates to see this.</p>') +
      '<h3>Where visits come from</h3><div class="card">' + bars(st.visitSources) + '</div>' +
      '<h3>Where bookings come from</h3><div class="card">' + bars(st.bookingSources) + '</div>' +
      (V().modules.preorder ? '<h3>Where pre-orders come from</h3><div class="card">' + bars(st.orderSources) + '</div>' : '') +
      '<h3>Date by date</h3>' + st.events.slice(0, 20).map(function (r) {
        return '<div class="row">' + dateBox(r.date) + '<div class="grow"><b>' + esc(r.name) + '</b><span class="muted">' +
          (r.capacity ? r.guests + '/' + r.capacity + ' booked · ' : r.guests ? r.guests + ' booked · ' : '') +
          (r.revenue != null ? euro(r.revenue) + ' in · ' + euro(r.cost) + ' out' + (r.perMarketingEuro ? ' · ' + euro(r.perMarketingEuro) + ' per € of marketing' : '') : r.past ? 'no results added' : 'coming up') + '</span></div>' +
          '<button class="btn small" data-results="' + esc(r.key) + '">' + (r.revenue != null ? euro(r.profit) : r.past ? 'Add' : 'View') + '</button></div>';
      }).join('');
  }
  function tile(n, label) { return '<div class="tile"><b>' + esc(n) + '</b><span>' + esc(label) + '</span></div>'; }

  // ---------- More ----------
  function viewMore() {
    var v = V(), st = S.data.state;
    var w = st.hours.weekly;
    var C = S.data.catalog, P = C.presets;
    var order = (v.home && v.home.length ? v.home : P[v.type].home).slice();
    Object.keys(C.sections).forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    var shows = function (k) { var mod = C.sections[k].module; return !mod || v.modules[mod]; };
    view.innerHTML = '<h2>Your site</h2>' +
      '<h3>Use case</h3><p class="muted">A starting point: which modules are on and what the home page leads with. Change any of it below.</p>' +
      '<div class="presets">' + Object.keys(P).map(function (k) {
        return '<button class="preset ' + (v.type === k ? 'on' : '') + '" data-preset="' + k + '"><b>' + esc(P[k].label) + '</b><span>' + esc(P[k].pitch) + '</span></button>';
      }).join('') + '</div>' +
      '<h3>Modules</h3>' + Object.keys(C.modules).map(function (k) {
        var m = C.modules[k];
        return '<div class="row"><div class="grow"><b>' + esc(m.label) + '</b><span class="muted">' + esc(m.about) + '</span></div>' +
          (m.core ? '<span class="pill plain">Always on</span>' : '<button class="toggle ' + (v.modules[k] ? 'on' : 'off') + '" data-module="' + k + '">' + (v.modules[k] ? 'On' : 'Off') + '</button>') + '</div>';
      }).join('') +
      '<h3>Home page order</h3><p class="muted">Top to bottom. Greyed-out sections belong to modules that are off.</p>' + order.map(function (k, i) {
        return '<div class="row' + (shows(k) ? '' : ' dim') + '"><div class="grow"><b>' + esc(C.sections[k].label) + '</b></div><span class="mover"><button aria-label="Move up" data-home-move="' + k + '|up" ' + (i === 0 ? 'disabled' : '') + '>↑</button><button aria-label="Move down" data-home-move="' + k + '|down" ' + (i === order.length - 1 ? 'disabled' : '') + '>↓</button></span></div>';
      }).join('') +
      '<h3>Page content</h3><div class="quick">' +
      [['tables', 'Table bookings', '▤'], ['collect', 'Order ahead', '⧉'], ['alerts', 'Alerts', '!'], ['about', 'About', '✎'], ['gallery', 'Gallery', '▦'], ['info', 'Good to know', 'i'], ['hire', 'Private hire', '◇'], ['links', 'Links, ordering, reviews', '↗']].filter(function (c) { return c[0] === 'links' || c[0] === 'alerts' || v.modules[c[0]]; }).map(function (c) {
        return '<button data-content="' + c[0] + '"><span>' + c[2] + '</span><span>' + c[1] + '</span></button>';
      }).join('') + '</div>' +
      '<h3>Hours</h3><div class="card"><b>Today</b> <span class="pill ' + (S.data.status.open ? 'ok' : 'bad') + '">' + esc(S.data.status.label) + '</span>' +
      '<div class="chips" style="margin-top:12px"><button data-today="normal">Normal hours</button><button data-today="closed">Closed today</button><button data-today="custom">Different times</button></div>' +
      '<div id="customToday" class="hidden"><div class="grid2"><label class="f">Open<input type="time" id="tOpen" value="18:00"></label><label class="f">Close<input type="time" id="tClose" value="02:00"></label></div><button class="btn dark block" data-today="save">Save today’s hours</button></div></div>' +
      '<form id="weekForm">' + DAYS.map(function (k) {
        var s = w[k];
        return '<div class="day"><label style="font-weight:700"><input type="checkbox" name="' + k + '_on" ' + (s ? 'checked' : '') + '> ' + DAY_NAME[k] + '</label>' +
          '<div class="times"><input type="time" name="' + k + '_open" value="' + esc(s ? s.open : '18:00') + '" aria-label="' + DAY_NAME[k] + ' opens"><span>to</span><input type="time" name="' + k + '_close" value="' + esc(s ? s.close : '00:00') + '" aria-label="' + DAY_NAME[k] + ' closes"></div></div>';
      }).join('') + '<div id="weekErr"></div><button class="btn dark block" style="margin-top:12px" type="submit">Save weekly hours</button></form>' +

      '<h3>Look and brand</h3><div class="looks">' + Object.keys(Share.LOOKS).map(function (k) {
        var Lk = Share.LOOKS[k], acc = v.accent || Lk.accent;
        return '<button data-look="' + k + '" class="' + (v.look === k ? 'on' : '') + '"><div class="sw" style="background:' + Lk.bg + ';color:' + Lk.text + ';font-family:\'' + Lk.head + '\';font-weight:' + Lk.weight + ';' + (Lk.upper ? 'text-transform:uppercase;' : '') + '"><span style="display:inline-block;width:28px;height:8px;background:' + acc + ';margin-bottom:8px"></span>' + esc(v.name) + '</div><div class="nm">' + Lk.name + '</div></button>';
      }).join('') + '</div>' +
      '<div class="card" style="margin-top:12px"><label class="f" style="margin:0">Brand colour<span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><input type="color" id="accent" value="' + esc(v.accent || '#e9b52f') + '" style="width:64px;padding:4px"><button class="btn small" data-accent="set">Use this colour</button>' + (v.accent ? '<button class="btn small" data-accent="clear">Use the look’s own</button>' : '') + '</span></label></div>' +

      '<h3>Venue details</h3><form id="venueForm">' +
      [['name', 'Name'], ['tagline', 'Tagline'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Email'], ['instagram', 'Instagram handle'], ['googleProfileUrl', 'Google profile link']].map(function (f) {
        return '<label class="f">' + f[1] + '<input name="' + f[0] + '" value="' + esc(v[f[0]]) + '"></label>';
      }).join('') + '<div id="venueErr"></div><button class="btn dark block" type="submit">Save details</button></form>' +
      '<h3>Account</h3><div style="display:grid;gap:10px">' + (S.data.demo ? '<button class="btn danger block" data-reset>Reset the demo data</button>' : '') + '<button class="btn block" data-logout>Log out</button></div>' +
      '<p class="muted" style="margin-top:20px;text-align:center">One update, every channel</p>';

    $('#weekForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, weekly = {};
      DAYS.forEach(function (k) { weekly[k] = f[k + '_on'].checked ? { open: f[k + '_open'].value, close: f[k + '_close'].value } : null; });
      act('hours.weekly', { weekly: weekly }).then(function () { toast('Hours saved. Site updated.'); }).catch(function (err) { $('#weekErr').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; });
    });
    $('#venueForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var p = {}; $$('input', e.target).forEach(function (el) { if (el.name) p[el.name] = el.value; });
      act('venue.save', p).then(function () { toast('Details saved'); }).catch(function (err) { $('#venueErr').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; });
    });
  }

  function venuePayload(extra) {
    var v = V();
    return Object.assign({ name: v.name, tagline: v.tagline, address: v.address, phone: v.phone, email: v.email, instagram: v.instagram, googleProfileUrl: v.googleProfileUrl }, extra);
  }

  // ---------- Pre-orders ----------
  var MODE_NAME = { sitin: 'Eat in', takeaway: 'Take away', collect: 'Collect' };
  function findPo(id) { return (S.data.state.preorders || []).find(function (x) { return x.id === id; }); }
  function nowPo(id) { return (S.data.preorders || []).find(function (x) { return x.id === id; }); }

  function prepCard(g) {
    var items = Object.keys(g.items).map(function (k) { return [k, g.items[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(g.name) + '</b><span class="pill plain">' + esc(shortDate(g.date)) + '</span></div>' +
      '<div class="muted">' + g.orders + ' orders · ' + euro(g.total) + ' · ' + Object.keys(g.modes).map(function (m) { return g.modes[m] + ' ' + MODE_NAME[m].toLowerCase(); }).join(', ') + '</div>' +
      items.map(function (x) { return '<div class="row"><div class="grow">' + esc(x[0]) + '</div><b style="font-size:20px">' + x[1] + '</b></div>'; }).join('') +
      '<div class="btnrow"><button class="btn small" data-go-orders>See the orders</button></div></div>';
  }

  function preorderSection() {
    var list = S.data.state.preorders || [];
    return '<h2>Pre-orders</h2><p class="muted">Guests order ahead for set days. Limits stop you taking more than you can make.</p>' + list.map(function (po) {
      var n = nowPo(po.id), next = n && n.dates[0];
      return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><b style="font-size:18px">' + esc(po.name) + '</b>' + (po.open ? ' <span class="pill ok">Taking orders</span>' : ' <span class="pill plain">Paused</span>') +
        '<div class="muted">' + esc(po.days.map(function (k) { return DAY_NAME[k]; }).join(', ')) + ' · ' + esc(po.from) + '–' + esc(po.to) + ' · ' + esc(po.modes.map(function (m) { return MODE_NAME[m]; }).join(' or ')) + '</div>' +
        '<div class="muted">' + (next ? 'Next: ' + esc(shortDate(next.date)) + ', orders close ' + esc(shortDate(next.cutoff.date)) + ' ' + esc(next.cutoff.time) : 'No open dates') + '</div></div></div>' +
        '<div class="btnrow"><button class="btn small" data-po-edit="' + esc(po.id) + '">Days & times</button><button class="btn small" data-po-open="' + esc(po.id) + '">' + (po.open ? 'Pause' : 'Start taking orders') + '</button>' +
        '<button class="btn small" data-copy="' + esc(S.data.baseUrl + '/order/' + encodeURIComponent(po.id) + '?src=whatsapp') + '">Copy order link</button></div>' +
        po.items.map(function (it) {
          return '<div class="row item"><div class="grow"><b class="tap" data-po-item="' + esc(po.id) + '|' + esc(it.id) + '">' + esc(it.name) + '</b><span class="muted">' + euro(it.price) + (it.limit != null ? ' · up to ' + it.limit + ' a day' : ' · no limit') + '</span></div>' +
            '<button class="toggle ' + (it.soldOut ? 'off' : 'on') + '" data-po-sold="' + esc(po.id) + '|' + esc(it.id) + '">' + (it.soldOut ? 'Sold out' : 'On') + '</button></div>';
        }).join('') +
        '<button class="btn small" style="margin:10px 0 0" data-po-item="' + esc(po.id) + '|">＋ Add an item</button></div>';
    }).join('') + '<button class="btn small" style="margin:6px 0 18px" data-po-edit="">＋ New pre-order</button>';
  }

  function orderRow(o) {
    var wa = waLink(o.contact, 'Hi ' + o.name + ', your order from ' + V().name + ' is ready to collect.');
    return '<div class="row" style="align-items:flex-start"><div class="grow"><b>' + esc(o.slot) + ' · ' + esc(o.name) + '</b> <span class="pill ' + (o.mode === 'sitin' ? 'plain' : 'warn') + '">' + esc(o.preorder_id === 'collect' ? 'Order ahead' : MODE_NAME[o.mode]) + '</span>' + (o.status === 'new' ? ' <span class="pill warn">new</span>' : '') +
      '<div class="muted">' + esc(o.items.map(function (i) { return i.qty + ' × ' + i.name; }).join(', ')) + ' · ' + euro(o.total) + '</div>' +
      '<div class="muted">' + contactLinks(o.contact) + (wa ? ' · <a href="' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') + ' · ' + esc(o.source || 'direct') + '</div>' +
      (o.note ? '<div class="muted">“' + esc(o.note) + '”</div>' : '') + '</div>' +
      '<select data-order="' + o.id + '" aria-label="Order status">' + ['new', 'ready', 'collected', 'cancelled'].map(function (st) { return '<option ' + (o.status === st ? 'selected' : '') + '>' + st + '</option>'; }).join('') + '</select></div>';
  }

  function ordersInbox() {
    var j = S.data, today = j.schedule.today;
    var coming = j.orders.filter(function (o) { return o.date >= today; });
    if (!coming.length) return '<div class="card">No orders coming up.' + (V().modules.collect ? ' Share your order link: <b>' + esc(j.baseUrl) + '/collect</b>' : ' Copy the order link from the Menu tab and share it.') + '</div>';
    var groups = {};
    coming.forEach(function (o) { var k = o.preorder_id + '@' + o.date; (groups[k] = groups[k] || []).push(o); });
    return Object.keys(groups).sort(function (a, b) { return a.split('@')[1].localeCompare(b.split('@')[1]); }).map(function (k) {
      var list = groups[k].slice().sort(function (a, b) { return a.slot.localeCompare(b.slot); });
      return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(list[0].preorder_name) + '</b><span class="pill plain">' + esc(shortDate(list[0].date)) + '</span></div>' +
        list.map(orderRow).join('') + '</div>';
    }).join('');
  }

  function poSheet(po) {
    var x = po || { name: '', blurb: '', days: ['sun'], from: '13:00', to: '16:00', every: 30, cutoffDays: 1, cutoffTime: '20:00', modes: ['sitin', 'takeaway'] };
    openSheet(head(po ? 'Days & times' : 'New pre-order') + '<form id="poForm"><label class="f">Name<input name="name" required maxlength="60" value="' + esc(x.name) + '" placeholder="Sunday roast, Weekend bakes"></label>' +
      '<label class="f">Description<textarea name="blurb" rows="2" maxlength="280">' + esc(x.blurb) + '</textarea></label>' +
      '<label class="f">Days</label><div class="chips">' + DAYS.map(function (k) { return '<label class="daychip"><input type="checkbox" name="day" value="' + k + '" ' + (x.days.indexOf(k) >= 0 ? 'checked' : '') + '><span>' + DAY_NAME[k] + '</span></label>'; }).join('') + '</div>' +
      '<div class="grid2"><label class="f">First time<input type="time" name="from" value="' + esc(x.from) + '"></label><label class="f">Last time<input type="time" name="to" value="' + esc(x.to) + '"></label></div>' +
      '<label class="f">Times every<select name="every">' + [15, 30, 60].map(function (n) { return '<option value="' + n + '" ' + (x.every === n ? 'selected' : '') + '>' + n + ' minutes</option>'; }).join('') + '</select></label>' +
      '<div class="grid2"><label class="f">Orders close<select name="cutoffDays">' + [0, 1, 2, 3].map(function (n) { return '<option value="' + n + '" ' + (x.cutoffDays === n ? 'selected' : '') + '>' + (n === 0 ? 'Same day' : n === 1 ? 'The day before' : n + ' days before') + '</option>'; }).join('') + '</select></label>' +
      '<label class="f">At<input type="time" name="cutoffTime" value="' + esc(x.cutoffTime) + '"></label></div>' +
      '<label class="f">How guests get it</label><div class="chips">' + Object.keys(MODE_NAME).map(function (m) { return '<label class="daychip"><input type="checkbox" name="mode" value="' + m + '" ' + (x.modes.indexOf(m) >= 0 ? 'checked' : '') + '><span>' + MODE_NAME[m] + '</span></label>'; }).join('') + '</div>' +
      '<div id="poErr"></div><button class="btn dark block" type="submit">' + (po ? 'Save' : 'Create pre-order') + '</button></form>' +
      (po ? '<div style="margin-top:10px"><button class="btn danger block" data-po-del>Remove this pre-order</button></div>' : ''));
    var form = $('#poForm');
    var checked = function (n) { return $$('[name=' + n + ']', form).filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      act('preorder.save', { id: po ? po.id : undefined, name: form.name.value, blurb: form.blurb.value, days: checked('day'), from: form.from.value, to: form.to.value, every: form.every.value, cutoffDays: form.cutoffDays.value, cutoffTime: form.cutoffTime.value, modes: checked('mode') })
        .then(function (j) { closeSheet(); toast(j.change.summary + ' · live'); }).catch(function (err) { errBox('#poErr', err); });
    });
    if (po) $('[data-po-del]', sheet).addEventListener('click', function () {
      if (!window.confirm('Remove ' + po.name + '? Orders already placed stay in the inbox.')) return;
      act('preorder.delete', { id: po.id }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(fail);
    });
  }

  function poItemSheet(po, it) {
    var x = it || { name: '', note: '', price: '', limit: '' };
    openSheet(head(it ? 'Edit item' : 'Add to ' + po.name) + '<form id="piForm"><label class="f">Name<input name="name" required maxlength="80" value="' + esc(x.name) + '"></label>' +
      '<label class="f">Note<input name="note" maxlength="140" value="' + esc(x.note) + '" placeholder="Serves 8, vegan, 800g"></label>' +
      '<div class="grid2"><label class="f">Price €<input name="price" inputmode="decimal" required value="' + esc(x.price) + '"></label><label class="f">Most a day<input name="limit" inputmode="numeric" value="' + esc(x.limit == null ? '' : x.limit) + '" placeholder="No limit"></label></div>' +
      '<div id="piErr"></div><button class="btn dark block" type="submit">' + (it ? 'Save' : 'Add') + '</button></form>' +
      (it ? '<div style="margin-top:10px"><button class="btn danger block" data-pi-del>Remove item</button></div>' : ''));
    var form = $('#piForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      act('preorder.item.save', { preorderId: po.id, id: it ? it.id : undefined, name: form.name.value, note: form.note.value, price: form.price.value.replace(',', '.'), limit: form.limit.value })
        .then(function (j) { closeSheet(); toast(j.change.summary + ' · live'); }).catch(function (err) { errBox('#piErr', err); });
    });
    if (it) $('[data-pi-del]', sheet).addEventListener('click', function () { act('preorder.item.delete', { preorderId: po.id, id: it.id }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(fail); });
  }

  // ---------- sheets ----------
  function openSheet(html) {
    sheet.innerHTML = '<div class="sheet-bg" data-close-bg><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    var first = sheet.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea');
    if (first) first.focus();
  }
  function closeSheet() { sheet.innerHTML = ''; }
  function head(title) { return '<div class="sheet-head"><h2>' + esc(title) + '</h2><button class="x" data-close aria-label="Close">✕</button></div>'; }
  function errBox(id, err) { $(id).innerHTML = '<div class="err">' + esc(err.message) + '</div>'; }

  function photoPicker(current) {
    return '<div class="photo-drop" data-photo-drop tabindex="0" role="button" aria-label="Add a photo">' + (current ? '<img src="/photos/' + esc(current) + '" alt="">' : '<span style="font-size:26px">＋</span><b>Take or choose a photo</b><span class="muted">Optional, but it makes the post</span>') + '</div>' +
      '<input type="file" data-photo-input accept="image/*" class="hidden"><input type="hidden" name="photo" value="' + esc(current || '') + '">';
  }
  function bindPhoto(form) {
    var drop = $('[data-photo-drop]', sheet), input = $('[data-photo-input]', sheet);
    if (!drop) return;
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () {
      if (!input.files[0]) return;
      drop.innerHTML = '<b>Uploading…</b>';
      shrink(input.files[0]).then(function (url) { return api('/api/admin/photos', { method: 'POST', body: { dataUrl: url } }); })
        .then(function (j) { form.photo.value = j.id; drop.innerHTML = '<img src="/photos/' + esc(j.id) + '" alt="">'; })
        .catch(function (err) { drop.innerHTML = '<b>' + esc(err.message) + '</b><span class="muted">Tap to try again</span>'; });
    });
  }
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = function () { reject(new Error('That file is not a photo we can read')); };
      img.src = URL.createObjectURL(file);
    });
  }

  function eventSheet(ev, opts) {
    opts = opts || {};
    var lab = L();
    var e = ev || { name: '', blurb: '', start: S.data.schedule.today, repeat: 'none', doors: '20:00', lineup: [], photo: null, until: '', bookable: false, capacity: '', price: '' };
    var circleNow = ev && ev.publicFrom && Date.parse(ev.publicFrom) > Date.now();
    var dates = ev ? allUpcoming().filter(function (o) { return o.eventId === ev.id; }).slice(0, 6) : [];
    var skipped = ev ? (ev.skipped || []).filter(function (x) { return x >= S.data.schedule.today; }) : [];
    var circleOpts = circleNow ? [['keep', 'Keep as is'], ['0', 'Everyone now'], ['24', 'Circle 24h first'], ['48', 'Circle 48h first']] : [['0', 'Everyone now'], ['24', 'Circle 24h first'], ['48', 'Circle 48h first']];
    var circleDefault = opts.circle ? '48' : circleNow ? 'keep' : '0';
    var placeholder = { cafe: 'Saturday brunch club', restaurant: 'Taco Tuesday', bar: 'House Friday' }[V().type];
    openSheet(head(ev ? 'Edit ' + lab.event.toLowerCase() : 'New ' + lab.event.toLowerCase()) +
      '<form id="evForm"><label class="f">Name<input name="name" required maxlength="80" value="' + esc(e.name) + '" placeholder="' + esc(placeholder) + '"></label>' +
      '<div class="grid2"><label class="f">Date<input type="date" name="start" required value="' + esc(e.start) + '"></label><label class="f">Starts<input type="time" name="doors" value="' + esc(e.doors) + '"></label></div>' +
      '<label class="f">Repeats</label><div class="chips">' + [['none', 'One-off'], ['weekly', 'Every week'], ['monthly', 'Monthly']].map(function (r) { return '<button type="button" data-repeat="' + r[0] + '" class="' + (e.repeat === r[0] ? 'on' : '') + '">' + r[1] + '</button>'; }).join('') + '</div>' +
      '<input type="hidden" name="repeat" value="' + esc(e.repeat) + '">' +
      '<label class="f ' + (e.repeat === 'none' ? 'hidden' : '') + '" id="untilField">Last date (optional)<input type="date" name="until" value="' + esc(e.until || '') + '"></label>' +
      '<label class="f">' + esc(lab.lineup) + ' (optional)</label><div id="lineup">' + (e.lineup.length ? e.lineup : [{ name: '', time: '' }]).map(personRow).join('') + '</div>' +
      '<button type="button" class="btn small" data-add-person style="margin-bottom:14px">＋ Add a name</button>' +
      '<label class="f">A line about it<textarea name="blurb" rows="2" maxlength="280">' + esc(e.blurb) + '</textarea></label>' +
      '<label class="f">Photo</label>' + photoPicker(e.photo) +
      '<h3>Bookings</h3><div class="row"><div class="grow"><b>Take bookings on the site</b><span class="muted">Guests book a place; you see them in the Inbox</span></div><button type="button" class="toggle ' + (e.bookable ? 'on' : 'off') + '" data-bookable>' + (e.bookable ? 'On' : 'Off') + '</button></div>' +
      '<input type="hidden" name="bookable" value="' + (e.bookable ? '1' : '') + '">' +
      '<div class="grid2 ' + (e.bookable ? '' : 'hidden') + '" id="bookFields" style="margin-top:12px"><label class="f">Places (each date)<input type="number" name="capacity" min="1" inputmode="numeric" value="' + esc(e.capacity || '') + '" placeholder="No limit"></label><label class="f">Price each (€)<input type="number" name="price" min="0" step="0.5" inputmode="decimal" value="' + esc(e.price == null ? '' : e.price) + '" placeholder="Free"></label></div>' +
      (V().modules.circle ? '<h3>The Circle</h3><label class="f">Who sees it first</label><div class="chips">' + circleOpts.map(function (c) { return '<button type="button" data-circle="' + c[0] + '" class="' + (c[0] === circleDefault ? 'on' : '') + '">' + c[1] + '</button>'; }).join('') + '</div><input type="hidden" name="circleHours" value="' + circleDefault + '">' : '') +
      '<div id="evErr" style="margin-top:14px"></div><button class="btn dark block" type="submit" style="margin-top:8px">' + (ev ? 'Save' : 'Add ' + lab.event.toLowerCase()) + '</button></form>' +
      (ev && e.repeat !== 'none' ? '<h3>Next dates</h3><p class="muted">Cancel one date without touching the rest.</p>' +
        dates.map(function (o) { return '<div class="row"><div class="grow">' + esc(shortDate(o.date)) + '</div><button class="btn small" data-skip="' + esc(o.date) + '">Cancel this date</button></div>'; }).join('') +
        skipped.map(function (x) { return '<div class="row"><div class="grow"><s>' + esc(shortDate(x)) + '</s> <span class="pill bad">Cancelled</span></div><button class="btn small" data-unskip="' + esc(x) + '">Bring back</button></div>'; }).join('') : '') +
      (ev ? '<div style="margin-top:20px"><button class="btn danger block" data-delete-event>Delete</button></div>' : ''));

    var form = $('#evForm');
    bindPhoto(form);
    form.addEventListener('submit', function (evt) {
      evt.preventDefault();
      var lineup = $$('.person', sheet).map(function (r) { return { name: $('[data-p-name]', r).value, time: $('[data-p-time]', r).value }; });
      var p = { id: ev ? ev.id : undefined, name: form.name.value, start: form.start.value, doors: form.doors.value, repeat: form.repeat.value, until: form.until.value || null, blurb: form.blurb.value, photo: form.photo.value || null, lineup: lineup,
        bookable: Boolean(form.bookable.value), capacity: form.capacity.value, price: form.price.value };
      if (form.circleHours && form.circleHours.value !== 'keep') p.circleHours = Number(form.circleHours.value);
      act('event.save', p).then(function (j) {
        var id = ev ? ev.id : (S.data.state.events[S.data.state.events.length - 1] || {}).id;
        var o = allUpcoming().find(function (x) { return x.eventId === id; });
        doneSheet(j.change, o);
      }).catch(function (err) { errBox('#evErr', err); });
    });
    $$('[data-repeat]', sheet).forEach(function (b) { b.addEventListener('click', function () {
      form.repeat.value = b.getAttribute('data-repeat');
      $$('[data-repeat]', sheet).forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#untilField').classList.toggle('hidden', form.repeat.value === 'none');
    }); });
    $$('[data-circle]', sheet).forEach(function (b) { b.addEventListener('click', function () {
      form.circleHours.value = b.getAttribute('data-circle');
      $$('[data-circle]', sheet).forEach(function (x) { x.classList.toggle('on', x === b); });
    }); });
    $('[data-bookable]', sheet).addEventListener('click', function (x) {
      var on = !form.bookable.value; form.bookable.value = on ? '1' : '';
      x.currentTarget.className = 'toggle ' + (on ? 'on' : 'off'); x.currentTarget.textContent = on ? 'On' : 'Off';
      $('#bookFields').classList.toggle('hidden', !on);
    });
    $('[data-add-person]', sheet).addEventListener('click', function () { $('#lineup').insertAdjacentHTML('beforeend', personRow({ name: '', time: '' })); });
    if (ev) {
      $$('[data-skip]', sheet).forEach(function (b) { b.addEventListener('click', function () { act('event.skip', { id: ev.id, date: b.getAttribute('data-skip') }).then(function (j) { toast(j.change.summary); eventSheet(S.data.state.events.find(function (x) { return x.id === ev.id; })); }).catch(fail); }); });
      $$('[data-unskip]', sheet).forEach(function (b) { b.addEventListener('click', function () { act('event.unskip', { id: ev.id, date: b.getAttribute('data-unskip') }).then(function (j) { toast(j.change.summary); eventSheet(S.data.state.events.find(function (x) { return x.id === ev.id; })); }).catch(fail); }); });
      $('[data-delete-event]', sheet).addEventListener('click', function () {
        if (!window.confirm('Delete ' + ev.name + '? It disappears from the site, including past dates.')) return;
        act('event.delete', { id: ev.id }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(fail);
      });
    }
  }
  function personRow(p) {
    return '<div class="dj person"><input data-p-name placeholder="Name" maxlength="40" value="' + esc(p.name) + '" aria-label="Name"><input data-p-time type="time" value="' + esc(p.time) + '" aria-label="Time"><button type="button" aria-label="Remove" onclick="this.parentNode.remove()">✕</button></div>';
  }

  function resultsSheet(key) {
    var all = S.data.schedule.past.concat(allUpcoming());
    var o = all.find(function (x) { return x.key === key; });
    if (!o) return toast('That date is no longer listed');
    var led = (S.data.state.ledger || {})[key] || {};
    var list = S.data.bookings.filter(function (b) { return b.event_key === key; });
    openSheet(head(o.name) + '<p class="muted">' + esc(shortDate(o.date)) + (bookedLine(o) ? ' · ' + esc(bookedLine(o)) : '') + '</p>' +
      (list.length ? '<h3>Bookings</h3>' + list.map(bookingRow).join('') : '') +
      '<h3>Results</h3><p class="muted">What it took and what it cost. Feeds Stats.</p><form id="ledForm">' +
      '<label class="f">Takings (€)<input type="number" name="revenue" min="0" inputmode="decimal" value="' + esc(led.revenue || '') + '"></label>' +
      '<div class="grid2"><label class="f">Talent (€)<input type="number" name="talent" min="0" inputmode="decimal" value="' + esc(led.talent || '') + '"></label><label class="f">Marketing (€)<input type="number" name="marketing" min="0" inputmode="decimal" value="' + esc(led.marketing || '') + '"></label></div>' +
      '<div class="grid2"><label class="f">Other costs (€)<input type="number" name="other" min="0" inputmode="decimal" value="' + esc(led.other || '') + '"></label><label class="f">Hours of effort<input type="number" name="effort" min="0" inputmode="decimal" value="' + esc(led.effort || '') + '"></label></div>' +
      '<div id="ledErr"></div><button class="btn dark block" type="submit">Save results</button></form>');
    $('#ledForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      act('ledger.save', { key: key, revenue: f.revenue.value, talent: f.talent.value, marketing: f.marketing.value, other: f.other.value, effort: f.effort.value })
        .then(function () { closeSheet(); toast('Results saved. Stats updated.'); }).catch(function (err) { errBox('#ledErr', err); });
    });
  }

  function storySheet(circle, theme) {
    var upcoming = allUpcoming().slice(0, 8);
    var themes = S.data.state.storyThemes || [];
    var pick = theme || (circle ? (themes.find(function (t) { return /circle/i.test(t); }) || themes[0]) : themes[0]) || '';
    var stories = S.data.state.stories || [];
    openSheet(head('Post a story') + '<p class="muted">Stories sit on your website in themes, like Instagram highlights. Anything linked to an event also stays on that event’s page.</p>' +
      '<form id="stForm"><label class="f">Theme</label><div class="chips" id="themeChips">' + themes.map(function (t) { return '<button type="button" data-theme="' + esc(t) + '" class="' + (t === pick ? 'on' : '') + '">' + esc(t) + '</button>'; }).join('') + '<button type="button" data-theme-new>＋ New theme</button></div>' +
      '<input type="hidden" name="theme" value="' + esc(pick) + '"><label class="f hidden" id="newTheme">New theme name<input name="newTheme" maxlength="24" placeholder="Brunch club"></label>' +
      photoPicker(null) +
      '<label class="f" style="margin-top:14px">A line (optional with a photo)<input name="caption" maxlength="160" placeholder="Soundcheck done. Doors at 22:00."></label>' +
      (V().modules.events ? '<label class="f">Belongs to an event?<select name="eventKey"><option value="">No</option>' + upcoming.map(function (o) { return '<option value="' + esc(o.key) + '">' + esc(whenWord(o)) + ' · ' + esc(o.name) + '</option>'; }).join('') + '</select></label>' : '') +
      (V().modules.circle ? '<label class="consentrow"><input type="checkbox" name="circleOnly" ' + (circle ? 'checked' : '') + '> Circle members only</label>' : '') +
      '<div id="stErr"></div><button class="btn dark block" type="submit">Post story</button></form>' +
      '<h3>Your themes</h3>' + themes.map(function (t, i) {
        var list = stories.filter(function (x) { return x.theme === t; });
        return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>' + esc(t) + ' <span class="muted">· ' + list.length + '</span></b><span class="mover"><button aria-label="Move up" data-tmove="' + esc(t) + '|up" ' + (i === 0 ? 'disabled' : '') + '>↑</button><button aria-label="Move down" data-tmove="' + esc(t) + '|down" ' + (i === themes.length - 1 ? 'disabled' : '') + '>↓</button><button aria-label="Rename" data-trename="' + esc(t) + '">✎</button><button aria-label="Remove theme" data-tdel="' + esc(t) + '">✕</button></span></div>' +
          list.slice().reverse().slice(0, 4).map(function (x) { return '<div class="row"><div class="grow">' + esc(x.caption || 'Photo') + (x.circleOnly ? '<span class="muted">Circle only</span>' : '') + '</div><button class="btn small" data-share-story="' + esc(x.id) + '">Share</button><button class="btn small" data-del-story="' + esc(x.id) + '">✕</button></div>'; }).join('') + '</div>';
      }).join(''));
    var form = $('#stForm');
    bindPhoto(form);
    $$('[data-theme]', sheet).forEach(function (b) { b.addEventListener('click', function () {
      form.theme.value = b.getAttribute('data-theme'); $('#newTheme').classList.add('hidden');
      $$('#themeChips button', sheet).forEach(function (x) { x.classList.toggle('on', x === b); });
    }); });
    $('[data-theme-new]', sheet).addEventListener('click', function (e) {
      form.theme.value = ''; $('#newTheme').classList.remove('hidden'); form.newTheme.focus();
      $$('#themeChips button', sheet).forEach(function (x) { x.classList.toggle('on', x === e.currentTarget); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      act('story.add', { theme: form.theme.value || form.newTheme.value, photo: form.photo.value || null, caption: form.caption.value, eventKey: form.eventKey ? form.eventKey.value || null : null, circleOnly: form.circleOnly ? form.circleOnly.checked : false })
        .then(function (j) { var st = S.data.state.stories[S.data.state.stories.length - 1]; shareStorySheet(st.id, j.change); })
        .catch(function (err) { errBox('#stErr', err); });
    });
    $$('[data-tmove]', sheet).forEach(function (b) { b.addEventListener('click', function () { var x = b.getAttribute('data-tmove').split('|'); act('theme.move', { theme: x[0], dir: x[1] }).then(function () { storySheet(circle, pick); }).catch(fail); }); });
    $$('[data-trename]', sheet).forEach(function (b) { b.addEventListener('click', function () { var from = b.getAttribute('data-trename'); var to = window.prompt('Rename theme', from); if (!to || to === from) return; act('theme.rename', { from: from, to: to }).then(function () { storySheet(circle); }).catch(fail); }); });
    $$('[data-tdel]', sheet).forEach(function (b) { b.addEventListener('click', function () { var t = b.getAttribute('data-tdel'); if (!window.confirm('Remove the ' + t + ' theme and its stories?')) return; act('theme.delete', { theme: t }).then(function () { storySheet(circle); }).catch(fail); }); });
  }

  function menuSheet(m) {
    var x = m || { name: '', from: '12:00', to: '16:00', days: DAYS.slice(), allDay: false };
    openSheet(head(m ? 'Times & days' : 'New menu') + '<form id="mnForm"><label class="f">Name<input name="name" required maxlength="40" value="' + esc(x.name) + '" placeholder="Brunch"></label>' +
      '<label class="consentrow"><input type="checkbox" name="allDay" ' + (x.allDay ? 'checked' : '') + '> All day (drinks, coffee)</label>' +
      '<div class="grid2" id="mnTimes"' + (x.allDay ? ' hidden' : '') + '><label class="f">From<input type="time" name="from" value="' + esc(x.from) + '"></label><label class="f">Until<input type="time" name="to" value="' + esc(x.to) + '"></label></div>' +
      '<label class="f">Days</label><div class="chips">' + DAYS.map(function (k) { return '<label class="daychip"><input type="checkbox" name="day" value="' + k + '" ' + (x.days.indexOf(k) >= 0 ? 'checked' : '') + '><span>' + DAY_NAME[k] + '</span></label>'; }).join('') + '</div>' +
      '<p class="muted">Late menus can run past midnight, e.g. 23:00 until 02:00.</p><div id="mnErr"></div><button class="btn dark block" type="submit">' + (m ? 'Save' : 'Add menu') + '</button></form>' +
      (m ? '<div class="grid2" style="margin-top:14px"><button class="btn" data-menu-move="up">Move earlier</button><button class="btn" data-menu-move="down">Move later</button></div><div style="margin-top:10px"><button class="btn danger block" data-delete-menu>Delete this menu</button></div>' : ''));
    var form = $('#mnForm');
    form.allDay.addEventListener('change', function () { $('#mnTimes').hidden = form.allDay.checked; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var p = { id: m ? m.id : undefined, name: form.name.value, from: form.from.value, to: form.to.value, allDay: form.allDay.checked, days: $$('[name=day]', form).filter(function (c) { return c.checked; }).map(function (c) { return c.value; }) };
      act(m ? 'menu.update' : 'menu.create', p).then(function (j) { if (!m) S.menuId = S.data.state.menus[S.data.state.menus.length - 1].id; closeSheet(); toast(j.change.summary); render(); }).catch(function (err) { errBox('#mnErr', err); });
    });
    if (m) {
      $$('[data-menu-move]', sheet).forEach(function (b) { b.addEventListener('click', function () { act('menu.move', { id: m.id, dir: b.getAttribute('data-menu-move') }).then(function () { toast('Order changed'); }).catch(fail); }); });
      $('[data-delete-menu]', sheet).addEventListener('click', function () {
        if (!window.confirm('Delete the ' + m.name + ' menu and everything in it?')) return;
        act('menu.delete', { id: m.id }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(fail);
      });
    }
  }

  function sectionSheet(sec) {
    var m = curMenu();
    openSheet(head(sec ? 'Rename section' : 'New section in ' + m.name) + '<form id="scForm"><label class="f">Name<input name="name" required maxlength="40" value="' + esc(sec ? sec.name : '') + '" placeholder="Desserts"></label><div id="scErr"></div><button class="btn dark block" type="submit">Save</button></form>' +
      (sec ? '<div style="margin-top:10px"><button class="btn danger block" data-delete-section>Delete section and its dishes</button></div>' : ''));
    $('#scForm').addEventListener('submit', function (e) {
      e.preventDefault();
      act('section.save', { menuId: m.id, id: sec ? sec.id : undefined, name: e.target.name.value }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(function (err) { errBox('#scErr', err); });
    });
    if (sec) $('[data-delete-section]', sheet).addEventListener('click', function () {
      if (!window.confirm('Delete ' + sec.name + ' and its dishes?')) return;
      act('section.delete', { menuId: m.id, id: sec.id }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(fail);
    });
  }

  function itemSheet(secId, item) {
    var m = curMenu(), sec = m.sections.find(function (s) { return s.id === secId; });
    var it = item || { name: '', note: '', price: '', tags: [] };
    openSheet(head(item ? 'Edit dish' : 'Add to ' + sec.name) + '<form id="itForm"><label class="f">Name<input name="name" required maxlength="80" value="' + esc(it.name) + '"></label>' +
      '<label class="f">Short note<input name="note" maxlength="140" value="' + esc(it.note) + '" placeholder="Paprika oil, crushed potato"></label>' +
      '<label class="f">Price (€)<input name="price" type="number" step="0.5" min="0" inputmode="decimal" value="' + esc(it.price) + '" required></label>' +
      '<label class="f">Diet tags</label><div class="chips">' + ['vegan', 'vegetarian', 'gluten free'].map(function (t) { return '<label class="daychip"><input type="checkbox" name="tag" value="' + t + '" ' + (it.tags.indexOf(t) >= 0 ? 'checked' : '') + '><span>' + t + '</span></label>'; }).join('') + '</div>' +
      '<div id="itErr"></div><button class="btn dark block" type="submit">' + (item ? 'Save' : 'Add') + '</button></form>' +
      (item ? '<div style="margin-top:10px"><button class="btn danger block" data-delete-item>Remove from menu</button></div>' : ''));
    var form = $('#itForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      act('item.save', { menuId: m.id, sectionId: secId, id: item ? item.id : undefined, name: form.name.value, note: form.note.value, price: form.price.value, tags: $$('[name=tag]', form).filter(function (c) { return c.checked; }).map(function (c) { return c.value; }) })
        .then(function (j) { closeSheet(); toast(j.change.summary + ' · live'); }).catch(function (err) { errBox('#itErr', err); });
    });
    if (item) $('[data-delete-item]', sheet).addEventListener('click', function () {
      if (!window.confirm('Remove ' + item.name + '?')) return;
      act('item.delete', { menuId: m.id, sectionId: secId, id: item.id }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(fail);
    });
  }

  function doneSheet(change, occ) {
    openSheet(head('Done') + touchpointsHtml(change) +
      (occ ? '<button class="btn dark block" data-share="' + esc(occ.key) + '" style="margin-top:8px">Share it now ↗</button>' : '') +
      '<a class="btn block" href="' + (occ ? '/event/' + encodeURIComponent(occ.key) : '/') + '" target="_blank" rel="noopener" style="margin-top:10px">See it on the site</a>');
  }

  // ---------- page content sheets ----------
  function aboutSheet() {
    var a = S.data.state.about || {};
    openSheet(head('About') + '<form id="abForm"><label class="f">Headline<input name="title" maxlength="80" value="' + esc(a.title) + '" placeholder="A harbour bar that never quite closes"></label>' +
      '<label class="f">Your story, in a few lines<textarea name="text" rows="5" maxlength="900">' + esc(a.text) + '</textarea></label>' +
      '<label class="f">Photo</label>' + photoPicker(a.photo) + '<div id="abErr" style="margin-top:12px"></div><button class="btn dark block" type="submit" style="margin-top:12px">Save</button></form>');
    var form = $('#abForm'); bindPhoto(form);
    form.addEventListener('submit', function (e) { e.preventDefault(); act('about.save', { title: form.title.value, text: form.text.value, photo: form.photo.value || null }).then(function (j) { closeSheet(); toast(j.change.summary + ' · live'); }).catch(function (err) { errBox('#abErr', err); }); });
  }

  function gallerySheet() {
    var g = S.data.state.gallery || [];
    openSheet(head('Gallery') + '<p class="muted">Up to 24 photos. The first six show on the home page.</p>' +
      '<form id="gaForm">' + photoPicker(null) + '<label class="f" style="margin-top:12px">Caption (optional)<input name="caption" maxlength="80" placeholder="The terrace at sunset"></label><div id="gaErr"></div><button class="btn dark block" type="submit">Add to gallery</button></form>' +
      '<h3>In the gallery</h3>' + g.map(function (x, i) {
        return '<div class="row"><div class="thumb">' + (x.photo ? '<img src="/photos/' + esc(x.photo) + '" alt="">' : '<span>' + esc((x.caption || '·').charAt(0)) + '</span>') + '</div><div class="grow"><input class="inline" data-cap="' + esc(x.id) + '" value="' + esc(x.caption) + '" maxlength="80" aria-label="Caption"><span class="mover"><button aria-label="Move up" data-gmove="' + esc(x.id) + '|up" ' + (i === 0 ? 'disabled' : '') + '>↑</button><button aria-label="Move down" data-gmove="' + esc(x.id) + '|down" ' + (i === g.length - 1 ? 'disabled' : '') + '>↓</button></span></div><button class="btn small" data-gdel="' + esc(x.id) + '">Remove</button></div>';
      }).join(''));
    var form = $('#gaForm'); bindPhoto(form);
    form.addEventListener('submit', function (e) { e.preventDefault(); act('gallery.add', { photo: form.photo.value, caption: form.caption.value }).then(function () { toast('Photo added · live'); gallerySheet(); }).catch(function (err) { errBox('#gaErr', err); }); });
    $$('[data-cap]', sheet).forEach(function (inp) { inp.addEventListener('change', function () { act('gallery.update', { id: inp.getAttribute('data-cap'), caption: inp.value }).then(function () { toast('Caption saved'); }).catch(fail); }); });
    $$('[data-gdel]', sheet).forEach(function (b) { b.addEventListener('click', function () { act('gallery.delete', { id: b.getAttribute('data-gdel') }).then(gallerySheet).catch(fail); }); });
    $$('[data-gmove]', sheet).forEach(function (b) { b.addEventListener('click', function () { var x = b.getAttribute('data-gmove').split('|'); act('gallery.move', { id: x[0], dir: x[1] }).then(gallerySheet).catch(fail); }); });
  }

  function infoSheet() {
    var rows = (S.data.state.info || []).slice();
    var starters = ['Parking', 'Accessibility', 'Dogs', 'Kids', 'Wifi', 'Payment', 'Dress code', 'Smoking', 'Reservations', 'Allergies'];
    function rowHtml(r) { return '<div class="qa"><input data-q value="' + esc(r.q) + '" placeholder="Topic" maxlength="40" aria-label="Topic"><textarea data-a rows="2" maxlength="300" placeholder="Answer" aria-label="Answer">' + esc(r.a) + '</textarea><button type="button" aria-label="Remove" onclick="this.parentNode.remove()">✕</button></div>'; }
    openSheet(head('Good to know') + '<p class="muted">The questions staff answer every day. Shown on the home and Visit pages.</p>' +
      '<div class="chips">' + starters.filter(function (q) { return !rows.some(function (r) { return r.q === q; }); }).map(function (q) { return '<button type="button" data-starter="' + esc(q) + '">＋ ' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<form id="inForm"><div id="qaList">' + rows.map(rowHtml).join('') + '</div><button type="button" class="btn small" id="qaAdd" style="margin-bottom:14px">＋ Add your own</button><div id="inErr"></div><button class="btn dark block" type="submit">Save</button></form>');
    $$('[data-starter]', sheet).forEach(function (b) { b.addEventListener('click', function () { $('#qaList').insertAdjacentHTML('beforeend', rowHtml({ q: b.getAttribute('data-starter'), a: '' })); b.remove(); $('#qaList .qa:last-child textarea').focus(); }); });
    $('#qaAdd').addEventListener('click', function () { $('#qaList').insertAdjacentHTML('beforeend', rowHtml({ q: '', a: '' })); });
    $('#inForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var info = $$('.qa', sheet).map(function (r) { return { q: $('[data-q]', r).value, a: $('[data-a]', r).value }; });
      act('info.save', { info: info }).then(function (j) { closeSheet(); toast(j.change.summary + ' · live'); }).catch(function (err) { errBox('#inErr', err); });
    });
  }

  function hireSheet() {
    var h = S.data.state.hire || { text: '', spaces: [] };
    function sp(x) { return '<div class="dj"><input data-s-name value="' + esc(x.name) + '" placeholder="Space" maxlength="40" aria-label="Space"><input data-s-cap type="number" min="1" value="' + esc(x.capacity || '') + '" placeholder="Guests" aria-label="Guests"><button type="button" aria-label="Remove" onclick="this.parentNode.remove()">✕</button></div>'; }
    openSheet(head('Private hire') + '<form id="hiForm"><label class="f">What you offer<textarea name="text" rows="3" maxlength="500">' + esc(h.text) + '</textarea></label>' +
      '<label class="f">Spaces and capacity</label><div id="spList">' + (h.spaces.length ? h.spaces : [{ name: '', capacity: '' }]).map(sp).join('') + '</div><button type="button" class="btn small" id="spAdd" style="margin-bottom:14px">＋ Add a space</button>' +
      '<p class="muted">Enquiries arrive in the Inbox as private hire requests.</p><div id="hiErr"></div><button class="btn dark block" type="submit">Save</button></form>');
    $('#spAdd').addEventListener('click', function () { $('#spList').insertAdjacentHTML('beforeend', sp({ name: '', capacity: '' })); });
    $('#hiForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var spaces = $$('#spList .dj', sheet).map(function (r) { return { name: $('[data-s-name]', r).value, capacity: $('[data-s-cap]', r).value }; });
      act('hire.save', { text: e.target.text.value, spaces: spaces }).then(function (j) { closeSheet(); toast(j.change.summary + ' · live'); }).catch(function (err) { errBox('#hiErr', err); });
    });
  }

  function linksSheet() {
    var l = S.data.state.links || { order: [] };
    function ol(x) { return '<div class="dj link2"><input data-o-label value="' + esc(x.label) + '" placeholder="Takeaway on Glovo" maxlength="40" aria-label="Link name"><input data-o-url value="' + esc(x.url) + '" placeholder="https://" aria-label="Link"><button type="button" aria-label="Remove" onclick="this.parentNode.remove()">✕</button></div>'; }
    openSheet(head('Links') + '<form id="lkForm"><label class="f">WhatsApp number<input name="whatsapp" value="' + esc(l.whatsapp) + '" placeholder="+34 600 000 000" inputmode="tel"></label>' +
      '<label class="f">Google review link<input name="googleReview" value="' + esc(l.googleReview) + '" placeholder="https://g.page/r/…/review"></label>' +
      '<label class="f">TripAdvisor link<input name="tripadvisor" value="' + esc(l.tripadvisor) + '" placeholder="https://www.tripadvisor.com/…"></label>' +
      '<label class="f">Your own booking system (optional)<input name="bookingUrl" value="' + esc(l.bookingUrl) + '" placeholder="https:// link to your booking page"></label>' +
      '<label class="f">Its name<input name="bookingName" value="' + esc(l.bookingName) + '" placeholder="CoverManager, TheFork…" maxlength="40"></label>' +
      '<p class="muted" style="margin:-4px 0 12px">Keep the booking system you already use. Table bookings on your site go straight to it.</p>' +
      '<label class="f">Order online, takeaway, gift vouchers</label><div id="olList">' + (l.order && l.order.length ? l.order : [{ label: '', url: '' }]).map(ol).join('') + '</div><button type="button" class="btn small" id="olAdd" style="margin-bottom:14px">＋ Add a link</button>' +
      '<div id="lkErr"></div><button class="btn dark block" type="submit">Save</button></form>');
    $('#olAdd').addEventListener('click', function () { $('#olList').insertAdjacentHTML('beforeend', ol({ label: '', url: '' })); });
    $('#lkForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, order = $$('#olList .dj', sheet).map(function (r) { return { label: $('[data-o-label]', r).value, url: $('[data-o-url]', r).value }; });
      act('links.save', { whatsapp: f.whatsapp.value, googleReview: f.googleReview.value, tripadvisor: f.tripadvisor.value, order: order, bookingUrl: f.bookingUrl.value, bookingName: f.bookingName.value }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(function (err) { errBox('#lkErr', err); });
    });
  }

  function setRes(id, status) {
    return api('/api/admin/reservations/' + id, { method: 'PATCH', body: { status: status } }).then(function (j) {
      return load().then(function () {
        if (j.whatsapp && !j.emailed && (status === 'confirmed' || status === 'declined')) {
          openSheet(head('Booking ' + status) + '<p>Let the guest know. Their message is written for you.</p><a class="btn dark block" href="' + esc(j.whatsapp) + '" target="_blank" rel="noopener" data-close>Send on WhatsApp ↗</a>');
        } else toast('Booking ' + status + (j.emailed ? ' · guest emailed' : ''));
      });
    }).catch(fail);
  }

  function tablesSheet() {
    var t = S.data.tables, own = (S.data.state.links || {}).bookingUrl;
    openSheet(head('Table bookings') + (own ? '<div class="err">Your own booking system is set in Links, so guests book there. Remove that link to use these booking times.</div>' : '') +
      '<form id="tbForm"><label class="f">Booking times<input name="times" value="' + esc(t.times.join(' ')) + '" placeholder="13:00 13:30 14:00 20:00 20:30 21:00"></label>' +
      '<p class="muted" style="margin:-4px 0 12px">Separate with spaces. Only times inside your opening hours show to guests.</p>' +
      '<div class="grid2"><label class="f">Guests per time<input type="number" name="covers" min="1" max="1000" value="' + esc(t.covers) + '"></label><label class="f">Biggest party<input type="number" name="maxParty" min="1" max="50" value="' + esc(t.maxParty) + '"></label></div>' +
      '<div class="grid2"><label class="f">Notice (minutes)<input type="number" name="notice" min="0" max="2880" value="' + esc(t.notice) + '"></label><label class="f">Days ahead<input type="number" name="daysAhead" min="1" max="180" value="' + esc(t.daysAhead) + '"></label></div>' +
      '<label class="f">Confirming</label><div class="chips"><label class="daychip"><input type="radio" name="mode" value="auto" ' + (t.mode === 'auto' ? 'checked' : '') + '><span>Automatic while there is space</span></label><label class="daychip"><input type="radio" name="mode" value="manual" ' + (t.mode === 'manual' ? 'checked' : '') + '><span>I confirm each one</span></label></div>' +
      '<div id="tbErr"></div><button class="btn dark block" type="submit">Save</button></form>');
    $('#tbForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      act('tables.save', { times: f.times.value, covers: f.covers.value, maxParty: f.maxParty.value, notice: f.notice.value, daysAhead: f.daysAhead.value, mode: f.mode.value }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(function (err) { errBox('#tbErr', err); });
    });
  }

  function addResSheet() {
    var t = S.data.tables;
    openSheet(head('Add a phone booking') + '<form id="arForm"><div class="grid2"><label class="f">Day<input type="date" name="date" required value="' + esc(S.data.localToday) + '" min="' + esc(S.data.localToday) + '"></label>' +
      '<label class="f">Time<select name="time">' + t.times.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="grid2"><label class="f">Guests<input type="number" name="guests" min="1" max="500" value="2" required></label><label class="f">Name<input name="name" required maxlength="80"></label></div>' +
      '<label class="f">Phone or email<input name="contact" maxlength="120" inputmode="tel"></label>' +
      '<label class="f">Note<input name="note" maxlength="300" placeholder="Birthday, high chair"></label>' +
      '<p class="muted">It counts against the guests per time, so the site never overbooks.</p><div id="arErr"></div><button class="btn dark block" type="submit">Add booking</button></form>');
    $('#arForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, body = { date: f.date.value, time: f.time.value, guests: f.guests.value, name: f.name.value, contact: f.contact.value, note: f.note.value };
      function send(force) {
        body.force = force;
        return api('/api/admin/reservations', { method: 'POST', body: body }).then(function () { closeSheet(); toast('Booking added'); return load(); });
      }
      send(false).catch(function (err) {
        if (/left at/.test(err.message) && window.confirm(err.message + ' Add it anyway?')) return send(true).catch(function (e2) { errBox('#arErr', e2); });
        errBox('#arErr', err);
      });
    });
  }

  function collectSheet() {
    var c = S.data.collect;
    openSheet(head('Order ahead') + '<form id="coForm">' +
      '<label class="daychip" style="margin-bottom:14px"><input type="checkbox" name="open" ' + (c.open ? 'checked' : '') + '><span>Taking orders on the site</span></label>' +
      '<div class="grid2"><label class="f">Pickup from<input type="time" name="from" value="' + esc(c.from) + '"></label><label class="f">Until<input type="time" name="to" value="' + esc(c.to) + '"></label></div>' +
      '<div class="grid2"><label class="f">Times every<select name="every">' + [10, 15, 20, 30].map(function (n) { return '<option value="' + n + '" ' + (c.every === n ? 'selected' : '') + '>' + n + ' minutes</option>'; }).join('') + '</select></label>' +
      '<label class="f">Kitchen needs (minutes)<input type="number" name="notice" min="0" max="240" value="' + esc(c.notice) + '"></label></div>' +
      '<p class="muted">Guests order from the menus that run today. Sold out dishes are hidden. Paid on collection. Turn it off on busy nights.</p>' +
      '<div id="coErr"></div><button class="btn dark block" type="submit">Save</button></form>');
    $('#coForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      act('collect.save', { open: f.open.checked, from: f.from.value, to: f.to.value, every: f.every.value, notice: f.notice.value }).then(function (j) { closeSheet(); toast(j.change.summary + ' · live'); }).catch(function (err) { errBox('#coErr', err); });
    });
  }

  function alertsSheet() {
    var a = S.data.alerts, cur = (S.data.state.alerts || {}).email || '';
    openSheet(head('Alerts') + '<form id="alForm"><label class="f">Email new bookings and orders to<input type="email" name="email" value="' + esc(cur) + '" placeholder="' + esc(V().email || 'you@yourvenue.com') + '"></label>' +
      '<p class="muted">Leave empty to use the venue email. ' + (a.mailbox ? 'The mailbox is set up.' : 'Emails start once the sending mailbox is set up on the server.') + ' While this editor is open on a phone or tablet, it also rings and shows a count.</p>' +
      '<div id="alErr"></div><button class="btn dark block" type="submit">Save</button></form>');
    $('#alForm').addEventListener('submit', function (e) {
      e.preventDefault();
      act('alerts.save', { email: e.target.email.value }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(function (err) { errBox('#alErr', err); });
    });
  }

  // ---------- ring when something new arrives ----------
  var pulse = { newest: null, timer: null, audio: null };
  function ring() {
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      pulse.audio = pulse.audio || new C();
      var ctx = pulse.audio, t0 = ctx.currentTime;
      [0, 0.25].forEach(function (d, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = i ? 1100 : 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
        o.start(t0 + d); o.stop(t0 + d + 0.24);
      });
    } catch (err) { /* sound is a bonus */ }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  // Browsers only allow sound after a tap; unlock it on the first one.
  document.addEventListener('click', function () { try { var C = window.AudioContext || window.webkitAudioContext; if (C && !pulse.audio) pulse.audio = new C(); if (pulse.audio && pulse.audio.state === 'suspended') pulse.audio.resume(); } catch (err) { /* ignore */ } }, { once: true });
  function checkPulse() {
    if (!S.data) return;
    api('/api/admin/pulse').then(function (p) {
      if (pulse.newest && p.newest !== pulse.newest) { ring(); toast('Something new in the Inbox'); load(); }
      pulse.newest = p.newest;
    }).catch(function () { /* offline for a moment */ });
  }
  function startPulse() { if (!pulse.timer) { checkPulse(); pulse.timer = setInterval(checkPulse, 20000); } }

  function offerSheet(o) {
    var x = o || { name: '', detail: '', days: DAYS.slice(0, 5), from: '18:00', to: '20:00' };
    openSheet(head(o ? 'Edit offer' : 'New offer') + '<form id="ofForm"><label class="f">Name<input name="name" required maxlength="50" value="' + esc(x.name) + '" placeholder="Happy hour"></label>' +
      '<label class="f">Details<input name="detail" maxlength="160" value="' + esc(x.detail) + '" placeholder="Two spritzes for €15"></label>' +
      '<div class="grid2"><label class="f">From<input type="time" name="from" value="' + esc(x.from) + '"></label><label class="f">Until<input type="time" name="to" value="' + esc(x.to) + '"></label></div>' +
      '<label class="f">Days</label><div class="chips">' + DAYS.map(function (k) { return '<label class="daychip"><input type="checkbox" name="day" value="' + k + '" ' + (x.days.indexOf(k) >= 0 ? 'checked' : '') + '><span>' + DAY_NAME[k] + '</span></label>'; }).join('') + '</div>' +
      '<div id="ofErr"></div><button class="btn dark block" type="submit">' + (o ? 'Save' : 'Add offer') + '</button></form>' +
      (o ? '<div style="margin-top:10px"><button class="btn danger block" data-del-offer>Remove offer</button></div>' : ''));
    var form = $('#ofForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      act('offer.save', { id: o ? o.id : undefined, name: form.name.value, detail: form.detail.value, from: form.from.value, to: form.to.value, days: $$('[name=day]', form).filter(function (c) { return c.checked; }).map(function (c) { return c.value; }) })
        .then(function (j) { closeSheet(); toast(j.change.summary + ' · live'); }).catch(function (err) { errBox('#ofErr', err); });
    });
    if (o) $('[data-del-offer]', sheet).addEventListener('click', function () { act('offer.delete', { id: o.id }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(fail); });
  }

  // ---------- share kit ----------
  function captions(o, channel) {
    var v = V(), base = S.data.baseUrl;
    var isToday = o.date === S.data.schedule.today;
    var link = channel === 'instagram' ? 'link in bio' : base + '/event/' + encodeURIComponent(o.key) + '?src=' + channel;
    var who = (o.lineup || []).map(function (x) { return x.name + (x.time ? ' ' + x.time : ''); }).join(' · ');
    var en = (isToday ? whenWord(o) : shortDate(o.date)) + ' at ' + v.name + ': ' + o.name + '.\n' + (o.doors ? 'From ' + o.doors + '.' : '') + (who ? ' ' + who : '') + '\n' + (o.blurb ? o.blurb + '\n' : '') + '\n' + (o.bookable ? 'Book your place: ' : 'More: ') + link;
    var es = (isToday ? (whenWord(o) === 'Today' ? 'Hoy' : 'Esta noche') : 'El ' + esDate(o.date)) + ' en ' + v.name + ': ' + o.name + '.\n' + (o.doors ? 'Desde las ' + o.doors + '.' : '') + (who ? ' ' + who : '') + '\n\n' + (o.bookable ? 'Reserva tu sitio: ' : 'Más: ') + (channel === 'instagram' ? 'enlace en la bio' : link);
    return { en: en.trim(), es: es.trim() };
  }

  function shareBase(title, sub, draw, captionFor, story) {
    var channel = 'instagram', lang = 'en', v = V();
    openSheet(head(title) + (sub || '') +
      '<div class="canvas-wrap' + (story ? ' one' : '') + '">' + (story ? '' : '<canvas id="cvFeed" width="1080" height="1350" aria-label="Post image"></canvas>') + '<canvas id="cvStory" width="1080" height="1920" aria-label="Story image"></canvas></div>' +
      '<div class="chips">' + [['instagram', 'Instagram'], ['google', 'Google'], ['facebook', 'Facebook'], ['whatsapp', 'WhatsApp']].map(function (c, i) { return '<button data-chan="' + c[0] + '" class="' + (i === 0 ? 'on' : '') + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="chips"><button data-lang="en" class="on">English</button><button data-lang="es">Español</button></div>' +
      '<textarea class="caption" id="caption" aria-label="Caption"></textarea>' +
      '<div style="display:grid;gap:10px;margin-top:12px"><button class="btn dark block" id="shareNow">Share image and caption ↗</button>' +
      '<div class="grid2"><button class="btn" id="copyCap">Copy caption</button><button class="btn" id="saveImg">Save image' + (story ? '' : 's') + '</button></div>' +
      '<a class="btn block hidden" id="openGoogle" target="_blank" rel="noopener">Open Google profile ↗</a>' +
      '<p class="muted">On a phone, Share opens your own Instagram, WhatsApp or Facebook with it filled in. Nothing is linked to anyone else’s account.</p></div>');
    var feed = $('#cvFeed'), st = $('#cvStory'), cap = $('#caption');
    function refresh() { var c = captionFor(channel); cap.value = lang === 'en' ? c.en : c.es; }
    refresh();
    draw(feed, st);
    $$('[data-chan]', sheet).forEach(function (b) { b.addEventListener('click', function () {
      channel = b.getAttribute('data-chan');
      $$('[data-chan]', sheet).forEach(function (x) { x.classList.toggle('on', x === b); });
      var g = $('#openGoogle'); g.classList.toggle('hidden', channel !== 'google' || !v.googleProfileUrl); if (v.googleProfileUrl) g.href = v.googleProfileUrl;
      refresh();
    }); });
    $$('[data-lang]', sheet).forEach(function (b) { b.addEventListener('click', function () { lang = b.getAttribute('data-lang'); $$('[data-lang]', sheet).forEach(function (x) { x.classList.toggle('on', x === b); }); refresh(); }); });
    $('#copyCap').addEventListener('click', function () { copy(cap.value).then(function () { toast('Caption copied'); }); });
    $('#saveImg').addEventListener('click', function () { [feed, st].filter(Boolean).forEach(function (c, i) { var a = document.createElement('a'); a.download = 'share-' + (c === st ? 'story' : 'post') + '.png'; a.href = c.toDataURL('image/png'); a.click(); }); });
    $('#shareNow').addEventListener('click', function () {
      var target = (channel === 'instagram' || channel === 'whatsapp' || !feed) ? st : feed;
      copy(cap.value);
      target.toBlob(function (blob) {
        var file = new File([blob], 'share.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text: cap.value }).catch(function () {});
        else { var a = document.createElement('a'); a.download = file.name; a.href = URL.createObjectURL(blob); a.click(); toast('Image saved and caption copied. Paste it into the post.'); }
      }, 'image/png');
    });
  }

  function shareSheet(key) {
    var o = allUpcoming().find(function (x) { return x.key === key; });
    if (!o) return toast('That date has passed');
    var v = V();
    shareBase('Share kit', '<p class="muted">' + esc(o.name) + ' · ' + esc(shortDate(o.date)) + '. Made in your ' + esc(Share.LOOKS[v.look].name) + ' look.' + (o.circleFirst ? ' <b>Circle first:</b> public posts are best sent once it opens to everyone.' : '') + '</p>',
      function (feed, st) {
        var label = o.date === S.data.schedule.today ? whenWord(o) : shortDate(o.date);
        Promise.all([Share.loadFonts(Share.look(v)), Share.loadImg(o.photo ? '/photos/' + o.photo : null)]).then(function (r) { Share.eventImage(feed, o, v, label, r[1]); Share.eventImage(st, o, v, label, r[1]); });
      },
      function (channel) { return captions(o, channel); });
  }

  function shareStorySheet(id, change) {
    var s = (S.data.state.stories || []).find(function (x) { return x.id === id; });
    if (!s) return;
    var v = V();
    shareBase('Story posted', (change ? touchpointsHtml(change) : '') + (s.circleOnly ? '<p class="muted"><b>Circle only</b> on your website. Only share it publicly if you want everyone to see it.</p>' : ''),
      function (feed, st) { Promise.all([Share.loadFonts(Share.look(v)), Share.loadImg(s.photo ? '/photos/' + s.photo : null)]).then(function (r) { Share.storyImage(st, s, v, r[1]); }); },
      function () { return { en: (s.caption || '') + '\n\n' + v.name, es: (s.caption || '') + '\n\n' + v.name }; }, true);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); return Promise.resolve();
  }

  // ---------- events ----------
  tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) go(b.getAttribute('data-tab')); });

  function split(t, attr) { return t.getAttribute(attr).split('|'); }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-close], [data-close-bg], [data-go], [data-share], [data-share-story], [data-del-story], [data-edit-event], [data-results], [data-menu], [data-new-menu], [data-edit-menu], [data-edit-section], [data-new-section], [data-new-item], [data-edit-item], [data-price], [data-sold], [data-move], [data-inbox], [data-enq], [data-today], [data-look], [data-accent], [data-preset], [data-module], [data-home-move], [data-content], [data-edit-offer], [data-copy], [data-reset], [data-logout], [data-po-edit], [data-po-open], [data-po-item], [data-po-sold], [data-go-orders], [data-res]');
    if (!t || t.disabled) return;
    if (t.hasAttribute('data-close-bg')) { if (e.target === t) closeSheet(); return; }
    if (t.hasAttribute('data-close')) return closeSheet();
    if (t.hasAttribute('data-share')) return shareSheet(t.getAttribute('data-share'));
    if (t.hasAttribute('data-share-story')) return shareStorySheet(t.getAttribute('data-share-story'));
    if (t.hasAttribute('data-del-story')) return act('story.delete', { id: t.getAttribute('data-del-story') }).then(function () { toast('Story removed'); storySheet(false); }).catch(fail);
    if (t.hasAttribute('data-edit-event')) return eventSheet(S.data.state.events.find(function (n) { return n.id === t.getAttribute('data-edit-event'); }));
    if (t.hasAttribute('data-results')) return resultsSheet(t.getAttribute('data-results'));
    if (t.hasAttribute('data-go')) {
      var g = t.getAttribute('data-go');
      if (g === 'newevent') return eventSheet(null);
      if (g === 'newoffer') return offerSheet(null);
      if (g === 'newevent-circle') return eventSheet(null, { circle: true });
      if (g === 'story') return storySheet(false);
      if (g === 'story-circle') return storySheet(true);
      if (g === 'closetoday') { var closed = S.data.status.special && !S.data.status.today; return act('hours.day', { mode: closed ? 'normal' : 'closed' }).then(function (j) { doneSheet(j.change); }).catch(fail); }
      return go(g);
    }
    if (t.hasAttribute('data-menu')) { S.menuId = t.getAttribute('data-menu'); return render(); }
    if (t.hasAttribute('data-new-menu')) return menuSheet(null);
    if (t.hasAttribute('data-edit-menu')) return menuSheet(curMenu());
    if (t.hasAttribute('data-new-section')) return sectionSheet(null);
    if (t.hasAttribute('data-edit-section')) return sectionSheet(curMenu().sections.find(function (s) { return s.id === t.getAttribute('data-edit-section'); }));
    if (t.hasAttribute('data-new-item')) return itemSheet(t.getAttribute('data-new-item'), null);
    if (t.hasAttribute('data-edit-item')) { var ei = split(t, 'data-edit-item'); return itemSheet(ei[0], curMenu().sections.find(function (s) { return s.id === ei[0]; }).items.find(function (x) { return x.id === ei[1]; })); }
    if (t.hasAttribute('data-price')) { var pr = split(t, 'data-price'); return act('item.price', { menuId: S.menuId, sectionId: pr[0], id: pr[1], delta: Number(pr[2]) }).then(function (j) { toast(j.change.summary + ' · live'); }).catch(fail); }
    if (t.hasAttribute('data-sold')) {
      var so = split(t, 'data-sold'), it = curMenu().sections.find(function (s) { return s.id === so[0]; }).items.find(function (x) { return x.id === so[1]; });
      return act('item.soldout', { menuId: S.menuId, sectionId: so[0], id: so[1], soldOut: !it.soldOut }).then(function (j) { toast(j.change.summary + ' · live'); }).catch(fail);
    }
    if (t.hasAttribute('data-move')) { var mv = split(t, 'data-move'); return act('item.move', { menuId: S.menuId, sectionId: mv[0], id: mv[1], dir: mv[2] }).catch(fail); }
    if (t.hasAttribute('data-inbox')) { S.inbox = t.getAttribute('data-inbox'); return render(); }
    if (t.hasAttribute('data-enq')) return api('/api/admin/enquiries/' + t.getAttribute('data-enq'), { method: 'PATCH', body: { status: t.getAttribute('data-status') } }).then(load).catch(fail);
    if (t.hasAttribute('data-today')) {
      var mode = t.getAttribute('data-today');
      if (mode === 'custom') return $('#customToday').classList.remove('hidden');
      var payload = mode === 'save' ? { mode: 'custom', slot: { open: $('#tOpen').value, close: $('#tClose').value } } : { mode: mode };
      return act('hours.day', payload).then(function (j) { doneSheet(j.change); }).catch(fail);
    }
    if (t.hasAttribute('data-look')) return act('look.set', { look: t.getAttribute('data-look') }).then(function () { toast('Look changed. The whole site has switched.'); }).catch(fail);
    if (t.hasAttribute('data-accent')) return act('look.set', { look: V().look, accent: t.getAttribute('data-accent') === 'set' ? $('#accent').value : null }).then(function () { toast('Brand colour updated everywhere'); }).catch(fail);
    if (t.hasAttribute('data-preset')) {
      var pk = t.getAttribute('data-preset');
      if (pk === V().type) return;
      if (!window.confirm('Switch to ' + S.data.catalog.presets[pk].label + '? This resets which modules are on and the home page order. Your content stays.')) return;
      return act('preset.set', { type: pk }).then(function (j) { toast(j.change.summary); }).catch(fail);
    }
    if (t.hasAttribute('data-module')) return act('module.toggle', { module: t.getAttribute('data-module') }).then(function (j) { toast(j.change.summary); }).catch(fail);
    if (t.hasAttribute('data-home-move')) { var hm = split(t, 'data-home-move'); return act('home.move', { section: hm[0], dir: hm[1] }).catch(fail); }
    if (t.hasAttribute('data-content')) { e.preventDefault(); return ({ about: aboutSheet, gallery: gallerySheet, info: infoSheet, hire: hireSheet, links: linksSheet, tables: tablesSheet, collect: collectSheet, alerts: alertsSheet, addres: addResSheet })[t.getAttribute('data-content')](); }
    if (t.hasAttribute('data-res')) return setRes(t.getAttribute('data-res'), t.getAttribute('data-status'));
    if (t.hasAttribute('data-edit-offer')) return offerSheet(S.data.state.offers.find(function (o) { return o.id === t.getAttribute('data-edit-offer'); }));
    if (t.hasAttribute('data-po-edit')) return poSheet(findPo(t.getAttribute('data-po-edit')) || null);
    if (t.hasAttribute('data-po-open')) { var pz = findPo(t.getAttribute('data-po-open')); return act('preorder.open', { id: pz.id, open: !pz.open }).then(function (j) { toast(j.change.summary + ' · live'); }).catch(fail); }
    if (t.hasAttribute('data-po-item')) { var pi = split(t, 'data-po-item'), ppo = findPo(pi[0]); return poItemSheet(ppo, pi[1] ? ppo.items.find(function (x) { return x.id === pi[1]; }) : null); }
    if (t.hasAttribute('data-po-sold')) { var ps = split(t, 'data-po-sold'), pit = findPo(ps[0]).items.find(function (x) { return x.id === ps[1]; }); return act('preorder.item.soldout', { preorderId: ps[0], id: ps[1], soldOut: !pit.soldOut }).then(function (j) { toast(j.change.summary + ' · live'); }).catch(fail); }
    if (t.hasAttribute('data-go-orders')) { S.inbox = 'orders'; return go('inbox'); }
    if (t.hasAttribute('data-copy')) return copy(t.getAttribute('data-copy')).then(function () { toast('Copied'); });
    if (t.hasAttribute('data-reset')) {
      if (!window.confirm('Reset all demo data back to the start?')) return;
      return api('/api/admin/reset', { method: 'POST' }).then(function () { S.lastChange = null; return load(); }).then(function () { toast('Demo reset'); }).catch(fail);
    }
    if (t.hasAttribute('data-logout')) return api('/api/logout', { method: 'POST' }).then(showLogin);
  });

  document.addEventListener('change', function (e) {
    var rs = e.target.closest('[data-res-sel]');
    if (rs) return setRes(rs.getAttribute('data-res-sel'), rs.value);
    var ord = e.target.closest('[data-order]');
    if (ord) return api('/api/admin/orders/' + ord.getAttribute('data-order'), { method: 'PATCH', body: { status: ord.value } }).then(function () { toast('Order ' + ord.value); return load(); }).catch(fail);
    var sel = e.target.closest('[data-booking]');
    if (!sel) return;
    api('/api/admin/bookings/' + sel.getAttribute('data-booking'), { method: 'PATCH', body: { status: sel.value } }).then(function () { toast('Booking ' + sel.value); return load(); }).catch(fail);
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet.innerHTML) closeSheet(); });

  // ---------- start ----------
  api('/api/editor-info').then(function (info) {
    if (!info.loggedIn) return showLogin();
    tabs.classList.remove('hidden');
    return load().then(startPulse);
  }).catch(function () { showLogin(); });
})();
