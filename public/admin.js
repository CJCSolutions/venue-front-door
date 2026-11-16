/* Venue editor: phone-first. Every save goes to /api/admin/action, which
   returns what changed and which touchpoints it reached. */
(function () {
  'use strict';

  var S = { data: null, tab: 'today', menuSection: 'Food', lastChange: null };
  var view = document.getElementById('view');
  var sheet = document.getElementById('sheet');
  var tabs = document.getElementById('tabs');

  var LOOK_INFO = {
    poster: { name: 'Poster wall', bg: '#1a1917', card: '#e9b52f', ink: '#1a1409', text: '#ece3cf', head: 'Anton', weight: '400', upper: true, accent: '#e9b52f' },
    gallery: { name: 'Gallery', bg: '#f8f6f1', card: '#f8f6f1', ink: '#151412', text: '#151412', head: 'Playfair Display', weight: '400', upper: false, accent: '#151412' },
    beach: { name: 'Beach club', bg: '#f4e8d8', card: '#c8553d', ink: '#fff6ea', text: '#3a2418', head: 'DM Serif Display', weight: '400', upper: false, accent: '#c8553d' },
    dark: { name: 'After dark', bg: '#0b0b10', card: '#14141c', ink: '#f2f2f5', text: '#f2f2f5', head: 'Space Grotesk', weight: '700', upper: true, accent: '#c6ff3d' }
  };
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var DAY_NAME = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  var EN_D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var EN_M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ES_D = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var ES_M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // ---------- small helpers ----------
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function d(date) { return new Date(date + 'T12:00:00Z'); }
  function shortDate(date) { var x = d(date); return EN_D[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + EN_M[x.getUTCMonth()]; }
  function esDate(date) { var x = d(date); return ES_D[x.getUTCDay()] + ' ' + x.getUTCDate() + ' de ' + ES_M[x.getUTCMonth()]; }
  function euro(n) { return '€' + (Number.isInteger(n) ? n : Number(n).toFixed(2)); }
  function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.add('hidden'); }, 3000); }

  function api(url, opts) {
    opts = opts || {};
    return fetch(url, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { showLogin(); throw new Error(j.error || 'Please log in'); }
        if (!r.ok) throw new Error(j.error || 'Something went wrong');
        return j;
      });
    });
  }

  function load() {
    return api('/api/admin/state').then(function (j) {
      S.data = j;
      document.getElementById('title').textContent = j.state.venue.name;
      var newCount = j.enquiries.filter(function (e) { return e.status === 'new'; }).length;
      var inboxBtn = tabs.querySelector('[data-tab="inbox"]');
      var badge = inboxBtn.querySelector('.badge');
      if (newCount) { if (!badge) { badge = document.createElement('i'); badge.className = 'badge'; inboxBtn.appendChild(badge); } badge.textContent = newCount; }
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

  // ---------- login ----------
  function showLogin() {
    tabs.classList.add('hidden');
    api('/api/editor-info').catch(function () { return {}; }).then(function (info) {
      view.innerHTML = '<div class="login"><h2>Log in to edit</h2>' +
        '<p class="muted">Change tonight, the menu or the hours. The website updates straight away.</p>' +
        (info.demo ? '<div class="card"><b>Demo password:</b> ' + esc(info.demoPassword) + '<br><span class="muted">This is a public demo. Anyone can edit, and you can reset it under More.</span></div>' : '') +
        '<form id="loginForm"><label class="f">Password<input type="password" name="password" autocomplete="current-password" required></label>' +
        '<div id="loginErr"></div><button class="btn dark block" type="submit">Log in</button></form></div>';
      $('#loginForm').addEventListener('submit', function (e) {
        e.preventDefault();
        api('/api/login', { method: 'POST', body: { password: e.target.password.value } })
          .then(function () { tabs.classList.remove('hidden'); return load(); })
          .catch(function (err) { $('#loginErr').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; });
      });
    });
  }

  // ---------- views ----------
  function render() {
    tabs.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === S.tab); });
    ({ today: viewToday, nights: viewNights, menu: viewMenu, hours: viewHours, inbox: viewInbox, more: viewMore })[S.tab]();
    window.scrollTo(0, 0);
  }

  function touchpointsHtml(change) {
    if (!change) return '';
    return '<div class="card"><b>' + esc(change.summary) + '</b>' +
      '<div class="tp">' + change.touchpoints.auto.map(function (t) { return '<span class="a">✓ ' + esc(t) + '</span>'; }).join('') +
      change.touchpoints.share.map(function (t) { return '<span class="s">↗ ' + esc(t) + '</span>'; }).join('') + '</div>' +
      '<span class="muted">Green updated by itself. Amber is ready to share in one tap.</span></div>';
  }

  function viewToday() {
    var j = S.data, sc = j.schedule, st = j.status;
    var tonight = sc.tonight;
    var html = '<p class="muted">' + esc(shortDate(sc.today)) + '</p><h2>Today</h2>';
    html += '<div class="card"><span class="pill ' + (st.open ? 'ok' : 'bad') + '">' + esc(st.label) + '</span>' +
      (tonight.length ? tonight.map(function (o) {
        return '<div style="margin-top:12px"><b style="font-size:20px">' + esc(o.name) + '</b><div class="muted">Doors ' + esc(o.doors || '–') + (o.djs.length ? ' · ' + esc(o.djs.map(function (x) { return x.name; }).join(', ')) : '') + '</div>' +
          '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn small dark" data-share="' + esc(o.key) + '">Share tonight ↗</button><button class="btn small" data-edit-night="' + esc(o.nightId) + '">Edit</button></div></div>';
      }).join('') : '<p style="margin:10px 0 0">Nothing on tonight. The site shows the menu and the next night instead.</p>') + '</div>';
    html += '<div class="quick">' +
      '<button class="dark" data-go="newnight"><span>＋</span><span>Add a night</span></button>' +
      '<button data-go="menu"><span>≡</span><span>Edit menu</span></button>' +
      '<button data-go="closetoday"><span>✕</span><span>' + (st.special && !st.today ? 'Open today after all' : 'Close today') + '</span></button>' +
      '<button data-go="hours"><span>◷</span><span>Change hours</span></button></div>';
    if (S.lastChange) html += '<h3>Your last change</h3>' + touchpointsHtml(S.lastChange);
    html += '<h3>Coming up</h3>' + sc.upcoming.slice(0, 6).map(function (o) {
      var x = d(o.date);
      return '<div class="row"><div class="datebox">' + EN_D[x.getUTCDay()] + '<span>' + x.getUTCDate() + '</span></div><div class="grow"><b>' + esc(o.name) + '</b><span class="muted">' + (o.repeat !== 'none' ? 'Repeats ' + o.repeat : 'One-off') + (o.photo ? '' : ' · no photo yet') + '</span></div><button class="btn small" data-share="' + esc(o.key) + '">Share</button></div>';
    }).join('');
    html += '<h3>Recent changes</h3>' + j.changes.map(function (c) {
      return '<div class="row"><div class="grow">' + esc(c.summary) + '<div class="muted">' + esc(new Date(c.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })) + '</div></div></div>';
    }).join('');
    view.innerHTML = html;
  }

  function nextDateOf(night) {
    var all = S.data.schedule.tonight.concat(S.data.schedule.upcoming);
    var o = all.find(function (x) { return x.nightId === night.id; });
    return o ? o.date : null;
  }

  function viewNights() {
    var nights = S.data.state.nights.slice().sort(function (a, b) { return (nextDateOf(a) || '9').localeCompare(nextDateOf(b) || '9'); });
    view.innerHTML = '<h2>Nights</h2><button class="btn dark block" data-go="newnight">＋ Add a night</button><h3>All nights</h3>' +
      nights.map(function (n) {
        var nd = nextDateOf(n);
        return '<div class="row"><div class="grow"><b>' + esc(n.name) + '</b><span class="muted">' +
          (n.repeat === 'weekly' ? 'Every ' + EN_D[d(n.start).getUTCDay()] : n.repeat === 'monthly' ? 'Monthly' : 'One-off') +
          ' · ' + (nd ? 'next ' + shortDate(nd) : 'finished') + '</span></div>' +
          (nd ? '<button class="btn small" data-share="' + esc(n.id + '@' + nd) + '">Share</button>' : '') +
          '<button class="btn small" data-edit-night="' + esc(n.id) + '">Edit</button></div>';
      }).join('');
  }

  function viewMenu() {
    var secs = ['Food', 'Drinks', 'Specials'];
    var items = S.data.state.menu.filter(function (m) { return m.section === S.menuSection; });
    view.innerHTML = '<h2>Menu</h2><div class="chips">' + secs.map(function (s) { return '<button data-sec="' + s + '" class="' + (s === S.menuSection ? 'on' : '') + '">' + s + '</button>'; }).join('') + '</div>' +
      (items.length ? items.map(function (m) {
        return '<div class="row"><div class="grow"><b data-edit-dish="' + esc(m.id) + '" style="cursor:pointer;text-decoration:underline;text-decoration-color:#cfccc5">' + esc(m.name) + '</b>' + (m.tags.length ? '<span class="muted">' + esc(m.tags.join(' · ')) + '</span>' : '') + '</div>' +
          '<div class="stepper"><button aria-label="Lower price of ' + esc(m.name) + '" data-price="' + esc(m.id) + '" data-delta="-1">−</button><output>' + euro(m.price) + '</output><button aria-label="Raise price of ' + esc(m.name) + '" data-price="' + esc(m.id) + '" data-delta="1">+</button></div>' +
          '<button class="toggle ' + (m.soldOut ? 'off' : 'on') + '" data-sold="' + esc(m.id) + '">' + (m.soldOut ? 'Sold out' : 'On') + '</button></div>';
      }).join('') : '<p class="muted">Nothing in ' + esc(S.menuSection) + ' yet.</p>') +
      '<div style="margin-top:16px"><button class="btn block" data-new-dish>＋ Add a dish to ' + esc(S.menuSection) + '</button></div>' +
      '<p class="muted" style="margin-top:14px">Changes show on the website and the QR menu straight away. Tap a dish name to edit it.</p>';
  }

  function viewHours() {
    var st = S.data.state, today = S.data.status;
    var w = st.hours.weekly;
    view.innerHTML = '<h2>Hours</h2>' +
      '<div class="card"><b>Today</b> <span class="pill ' + (today.open ? 'ok' : 'bad') + '">' + esc(today.label) + '</span>' +
      '<div class="chips" style="margin-top:12px"><button data-today="normal">Normal hours</button><button data-today="closed">Closed today</button><button data-today="custom">Different times</button></div>' +
      '<div id="customToday" class="hidden"><div class="grid2"><label class="f">Open<input type="time" id="tOpen" value="18:00"></label><label class="f">Close<input type="time" id="tClose" value="02:00"></label></div><button class="btn dark block" data-today="save">Save today’s hours</button></div></div>' +
      '<h3>Every week</h3><form id="weekForm">' + DAYS.map(function (k) {
        var s = w[k];
        return '<div class="day"><label style="font-weight:700"><input type="checkbox" name="' + k + '_on" ' + (s ? 'checked' : '') + '> ' + DAY_NAME[k] + '</label>' +
          '<div class="times"><input type="time" name="' + k + '_open" value="' + esc(s ? s.open : '18:00') + '" aria-label="' + DAY_NAME[k] + ' opens"><span>to</span><input type="time" name="' + k + '_close" value="' + esc(s ? s.close : '00:00') + '" aria-label="' + DAY_NAME[k] + ' closes"></div></div>';
      }).join('') + '<div id="weekErr"></div><button class="btn dark block" style="margin-top:14px" type="submit">Save weekly hours</button></form>' +
      '<p class="muted">Closing after midnight is fine: 18:00 to 03:00 means open until 3am.</p>';
    $('#weekForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, weekly = {};
      DAYS.forEach(function (k) { weekly[k] = f[k + '_on'].checked ? { open: f[k + '_open'].value, close: f[k + '_close'].value } : null; });
      act('hours.weekly', { weekly: weekly }).then(function () { toast('Hours saved. Site updated.'); }).catch(function (err) { $('#weekErr').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; });
    });
  }

  function viewInbox() {
    var list = S.data.enquiries;
    view.innerHTML = '<h2>Inbox</h2><p class="muted">Every booking request from the website lands here, tagged with where it came from.</p>' +
      (list.length ? list.map(function (e) {
        return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(e.name) + '</b><span class="pill ' + (e.status === 'new' ? 'warn' : e.status === 'booked' ? 'ok' : 'plain') + '">' + esc(e.status) + '</span></div>' +
          '<div class="muted">' + esc(e.type) + (e.date ? ' · ' + esc(shortDate(e.date)) : '') + (e.guests ? ' · ' + esc(e.guests) + ' guests' : '') + ' · from ' + esc(e.source || 'direct') + '</div>' +
          '<div style="margin:8px 0"><a href="' + (e.contact.indexOf('@') > 0 ? 'mailto:' : 'tel:') + esc(e.contact.replace(/\s/g, '')) + '">' + esc(e.contact) + '</a></div>' +
          (e.message ? '<div style="white-space:pre-wrap;margin-bottom:8px">' + esc(e.message) + '</div>' : '') +
          '<div class="chips" style="margin:0">' + ['replied', 'booked', 'declined'].map(function (s) { return '<button data-enq="' + e.id + '" data-status="' + s + '" class="' + (e.status === s ? 'on' : '') + '">' + s[0].toUpperCase() + s.slice(1) + '</button>'; }).join('') + '</div></div>';
      }).join('') : '<div class="card">No requests yet. Try the booking form on the <a href="/book" target="_blank">website</a>.</div>');
  }

  function viewMore() {
    var v = S.data.state.venue;
    view.innerHTML = '<h2>Look</h2><p class="muted">Same content, different style. Applies to the whole site and the share images.</p><div class="looks">' +
      Object.keys(LOOK_INFO).map(function (k) {
        var L = LOOK_INFO[k];
        return '<button data-look="' + k + '" class="' + (v.look === k ? 'on' : '') + '"><div class="sw" style="background:' + L.bg + ';color:' + L.text + ';font-family:\'' + L.head + '\';font-weight:' + L.weight + ';' + (L.upper ? 'text-transform:uppercase;' : '') + '"><span style="display:inline-block;width:28px;height:8px;background:' + L.accent + ';margin-bottom:8px"></span>' + esc(v.name) + '</div><div class="nm">' + L.name + '</div></button>';
      }).join('') + '</div>' +
      '<h3>Venue details</h3><form id="venueForm">' +
      [['name', 'Name'], ['tagline', 'Tagline'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Email'], ['instagram', 'Instagram handle'], ['googleProfileUrl', 'Google profile link']].map(function (f) {
        return '<label class="f">' + f[1] + '<input name="' + f[0] + '" value="' + esc(v[f[0]]) + '"></label>';
      }).join('') + '<div id="venueErr"></div><button class="btn dark block" type="submit">Save details</button></form>' +
      '<h3>Account</h3><div style="display:grid;gap:10px">' + (S.data.demo ? '<button class="btn danger block" data-reset>Reset the demo data</button>' : '') + '<button class="btn block" data-logout>Log out</button></div>';
    $('#venueForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var p = {}; Array.prototype.forEach.call(e.target.elements, function (el) { if (el.name) p[el.name] = el.value; });
      act('venue.save', p).then(function () { toast('Details saved'); }).catch(function (err) { $('#venueErr').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; });
    });
  }

  // ---------- sheets ----------
  function openSheet(html) {
    sheet.innerHTML = '<div class="sheet-bg" data-close-bg><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    var first = sheet.querySelector('input, button:not(.x)');
    if (first) first.focus();
  }
  function closeSheet() { sheet.innerHTML = ''; }

  function nightSheet(night) {
    var n = night || { name: '', blurb: '', start: S.data.schedule.today, repeat: 'none', doors: '22:00', djs: [], photo: null, until: '' };
    var upcoming = night ? S.data.schedule.tonight.concat(S.data.schedule.upcoming).filter(function (o) { return o.nightId === night.id; }).slice(0, 6) : [];
    var skipped = night ? (night.skipped || []).filter(function (x) { return x >= S.data.schedule.today; }) : [];
    openSheet('<div class="sheet-head"><h2>' + (night ? 'Edit night' : 'New night') + '</h2><button class="x" data-close aria-label="Close">✕</button></div>' +
      '<form id="nightForm"><label class="f">Name<input name="name" required maxlength="80" value="' + esc(n.name) + '" placeholder="House Friday"></label>' +
      '<div class="grid2"><label class="f">' + (n.repeat === 'none' ? 'Date' : 'First date') + '<input type="date" name="start" required value="' + esc(n.start) + '"></label><label class="f">Doors<input type="time" name="doors" value="' + esc(n.doors) + '"></label></div>' +
      '<label class="f">Repeats</label><div class="chips" id="repeatChips">' + [['none', 'One-off'], ['weekly', 'Every week'], ['monthly', 'Monthly']].map(function (r) { return '<button type="button" data-repeat="' + r[0] + '" class="' + (n.repeat === r[0] ? 'on' : '') + '">' + r[1] + '</button>'; }).join('') + '</div>' +
      '<input type="hidden" name="repeat" value="' + esc(n.repeat) + '">' +
      '<label class="f ' + (n.repeat === 'none' ? 'hidden' : '') + '" id="untilField">Last date (optional)<input type="date" name="until" value="' + esc(n.until || '') + '"></label>' +
      '<label class="f">Who’s playing</label><div id="djs">' + (n.djs.length ? n.djs : [{ name: '', time: '' }]).map(djRow).join('') + '</div>' +
      '<button type="button" class="btn small" data-add-dj style="margin-bottom:14px">＋ Add DJ</button>' +
      '<label class="f">A line about it<textarea name="blurb" rows="2" maxlength="240">' + esc(n.blurb) + '</textarea></label>' +
      '<label class="f">Photo</label><div class="photo-drop" id="photoDrop" tabindex="0" role="button" aria-label="Add a photo">' + (n.photo ? '<img src="/photos/' + esc(n.photo) + '" alt="">' : '<span style="font-size:26px">＋</span><b>Take or choose a photo</b><span class="muted">Used on the site and the share images</span>') + '</div>' +
      '<input type="file" id="photoInput" accept="image/*" class="hidden"><input type="hidden" name="photo" value="' + esc(n.photo || '') + '">' +
      '<div id="nightErr" style="margin-top:14px"></div><button class="btn dark block" type="submit" style="margin-top:14px">' + (night ? 'Save changes' : 'Add night') + '</button></form>' +
      (night && n.repeat !== 'none' ? '<h3>Next dates</h3><p class="muted">Cancel one date without touching the rest.</p>' +
        upcoming.map(function (o) { return '<div class="row"><div class="grow">' + esc(shortDate(o.date)) + '</div><button class="btn small" data-skip="' + esc(o.date) + '">Cancel this date</button></div>'; }).join('') +
        skipped.map(function (x) { return '<div class="row"><div class="grow"><s>' + esc(shortDate(x)) + '</s> <span class="pill bad">Cancelled</span></div><button class="btn small" data-unskip="' + esc(x) + '">Bring back</button></div>'; }).join('') : '') +
      (night ? '<div style="margin-top:20px"><button class="btn danger block" data-delete-night>Delete this night</button></div>' : ''));

    var form = $('#nightForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var djs = Array.prototype.map.call(sheet.querySelectorAll('.dj'), function (r) { return { name: r.querySelector('[data-dj-name]').value, time: r.querySelector('[data-dj-time]').value }; });
      var p = { id: night ? night.id : undefined, name: form.name.value, start: form.start.value, doors: form.doors.value, repeat: form.repeat.value, until: form.until.value || null, blurb: form.blurb.value, photo: form.photo.value || null, djs: djs };
      act('night.save', p).then(function (j) {
        closeSheet();
        var nightId = night ? night.id : (S.data.state.nights.find(function (x) { return x.name === p.name; }) || {}).id;
        var o = S.data.schedule.tonight.concat(S.data.schedule.upcoming).find(function (x) { return x.nightId === nightId; });
        doneSheet(j.change, o);
      }).catch(function (err) { $('#nightErr').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; });
    });
    sheet.querySelectorAll('[data-repeat]').forEach(function (b) {
      b.addEventListener('click', function () {
        form.repeat.value = b.getAttribute('data-repeat');
        sheet.querySelectorAll('[data-repeat]').forEach(function (x) { x.classList.toggle('on', x === b); });
        $('#untilField').classList.toggle('hidden', form.repeat.value === 'none');
      });
    });
    $('[data-add-dj]').addEventListener('click', function () { $('#djs').insertAdjacentHTML('beforeend', djRow({ name: '', time: '' })); });
    var drop = $('#photoDrop'), input = $('#photoInput');
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () {
      if (!input.files[0]) return;
      drop.innerHTML = '<b>Uploading…</b>';
      shrink(input.files[0]).then(function (dataUrl) { return api('/api/admin/photos', { method: 'POST', body: { dataUrl: dataUrl } }); })
        .then(function (j) { form.photo.value = j.id; drop.innerHTML = '<img src="/photos/' + esc(j.id) + '" alt="">'; })
        .catch(function (err) { drop.innerHTML = '<b>' + esc(err.message) + '</b><span class="muted">Tap to try again</span>'; });
    });
    if (night) {
      sheet.querySelectorAll('[data-skip]').forEach(function (b) { b.addEventListener('click', function () { act('night.skip', { id: night.id, date: b.getAttribute('data-skip') }).then(function (j) { toast(j.change.summary); nightSheet(S.data.state.nights.find(function (x) { return x.id === night.id; })); }).catch(function (e) { toast(e.message); }); }); });
      sheet.querySelectorAll('[data-unskip]').forEach(function (b) { b.addEventListener('click', function () { act('night.unskip', { id: night.id, date: b.getAttribute('data-unskip') }).then(function (j) { toast(j.change.summary); nightSheet(S.data.state.nights.find(function (x) { return x.id === night.id; })); }).catch(function (e) { toast(e.message); }); }); });
      $('[data-delete-night]').addEventListener('click', function () {
        if (!window.confirm('Delete ' + night.name + '? It disappears from the site, including past dates.')) return;
        act('night.delete', { id: night.id }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(function (e) { toast(e.message); });
      });
    }
  }

  function djRow(dj) {
    return '<div class="dj"><input data-dj-name placeholder="DJ name" maxlength="40" value="' + esc(dj.name) + '" aria-label="DJ name"><input data-dj-time type="time" value="' + esc(dj.time) + '" aria-label="Set time"><button type="button" aria-label="Remove DJ" onclick="this.parentNode.remove()">✕</button></div>';
  }

  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = function () { reject(new Error('That file is not a photo we can read')); };
      img.src = URL.createObjectURL(file);
    });
  }

  function dishSheet(dish) {
    var m = dish || { name: '', note: '', price: 10, section: S.menuSection, tags: [], soldOut: false };
    openSheet('<div class="sheet-head"><h2>' + (dish ? 'Edit dish' : 'New dish') + '</h2><button class="x" data-close aria-label="Close">✕</button></div>' +
      '<form id="dishForm"><label class="f">Name<input name="name" required maxlength="80" value="' + esc(m.name) + '"></label>' +
      '<label class="f">Short note<input name="note" maxlength="140" value="' + esc(m.note) + '" placeholder="Paprika oil, crushed potato"></label>' +
      '<div class="grid2"><label class="f">Price (€)<input name="price" type="number" step="0.5" min="0" inputmode="decimal" value="' + esc(m.price) + '"></label><label class="f">Section<select name="section">' + ['Food', 'Drinks', 'Specials'].map(function (s) { return '<option ' + (s === m.section ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label></div>' +
      '<label class="f">Diet tags</label><div class="chips">' + ['vegan', 'vegetarian', 'gluten free'].map(function (t) { return '<label class="btn small" style="border-width:1px"><input type="checkbox" name="tag" value="' + t + '" ' + (m.tags.indexOf(t) >= 0 ? 'checked' : '') + '> ' + t + '</label>'; }).join('') + '</div>' +
      '<div id="dishErr"></div><button class="btn dark block" type="submit">' + (dish ? 'Save' : 'Add dish') + '</button></form>' +
      (dish ? '<div style="margin-top:12px"><button class="btn danger block" data-delete-dish>Remove from menu</button></div>' : ''));
    var form = $('#dishForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var tags = Array.prototype.filter.call(form.querySelectorAll('[name=tag]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
      act('menu.save', { id: dish ? dish.id : undefined, name: form.name.value, note: form.note.value, price: form.price.value, section: form.section.value, tags: tags, soldOut: m.soldOut })
        .then(function (j) { S.menuSection = form.section.value; closeSheet(); toast(j.change.summary); })
        .catch(function (err) { $('#dishErr').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; });
    });
    if (dish) $('[data-delete-dish]').addEventListener('click', function () {
      if (!window.confirm('Remove ' + dish.name + ' from the menu?')) return;
      act('menu.delete', { id: dish.id }).then(function (j) { closeSheet(); toast(j.change.summary); }).catch(function (e) { toast(e.message); });
    });
  }

  function doneSheet(change, occ) {
    openSheet('<div class="sheet-head"><h2>Done</h2><button class="x" data-close aria-label="Close">✕</button></div>' + touchpointsHtml(change) +
      (occ ? '<button class="btn dark block" data-share="' + esc(occ.key) + '" style="margin-top:8px">Open the share kit ↗</button>' : '') +
      '<a class="btn block" href="/" target="_blank" rel="noopener" style="margin-top:10px">See it on the site</a>');
  }

  // ---------- share kit ----------
  function findOcc(key) {
    var all = S.data.schedule.tonight.concat(S.data.schedule.upcoming);
    return all.find(function (o) { return o.key === key; });
  }

  function captions(o, channel) {
    var v = S.data.state.venue, base = S.data.baseUrl;
    var isTonight = o.date === S.data.schedule.today;
    var link = base + '/night/' + encodeURIComponent(o.key) + '?src=' + channel;
    var bookLine = channel === 'instagram' ? 'Book: link in bio' : 'Book: ' + base + '/book?src=' + channel;
    var bookEs = channel === 'instagram' ? 'Reservas: enlace en la bio' : 'Reservas: ' + base + '/book?src=' + channel;
    var dj = o.djs.map(function (x) { return x.name + (x.time ? ' ' + x.time : ''); }).join(' · ');
    var en = (isTonight ? 'Tonight' : shortDate(o.date)) + ' at ' + v.name + ': ' + o.name + '.\n' +
      (o.doors ? 'Doors ' + o.doors + '.' : '') + (dj ? ' ' + dj : '') + '\n' + (o.blurb ? o.blurb + '\n' : '') + '\n' + bookLine;
    var es = (isTonight ? 'Esta noche' : 'El ' + esDate(o.date)) + ' en ' + v.name + ': ' + o.name + '.\n' +
      (o.doors ? 'Puertas ' + o.doors + '.' : '') + (dj ? ' ' + dj : '') + '\n\n' + bookEs;
    return { en: en.trim(), es: es.trim(), link: link };
  }

  function shareSheet(key) {
    var o = findOcc(key);
    if (!o) { toast('That date has passed'); return; }
    var v = S.data.state.venue;
    var channel = 'instagram', lang = 'en';
    openSheet('<div class="sheet-head"><h2>Share kit</h2><button class="x" data-close aria-label="Close">✕</button></div>' +
      '<p class="muted">' + esc(o.name) + ' · ' + esc(shortDate(o.date)) + '. Made in your ' + esc(LOOK_INFO[v.look].name) + ' look.</p>' +
      '<div class="canvas-wrap"><canvas id="cvFeed" width="1080" height="1350" aria-label="Post image"></canvas><canvas id="cvStory" width="1080" height="1920" aria-label="Story image"></canvas></div>' +
      '<div class="chips" id="chanChips">' + [['instagram', 'Instagram'], ['google', 'Google'], ['facebook', 'Facebook']].map(function (c, i) { return '<button data-chan="' + c[0] + '" class="' + (i === 0 ? 'on' : '') + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="chips"><button data-lang="en" class="on">English</button><button data-lang="es">Español</button></div>' +
      '<textarea class="caption" id="caption" aria-label="Caption"></textarea>' +
      '<div style="display:grid;gap:10px;margin-top:12px">' +
      '<button class="btn dark block" id="shareNow">Share image and caption ↗</button>' +
      '<div class="grid2"><button class="btn" id="copyCap">Copy caption</button><button class="btn" id="saveImg">Save images</button></div>' +
      '<a class="btn block hidden" id="openGoogle" target="_blank" rel="noopener">Open Google profile ↗</a>' +
      '<p class="muted" id="shareHint">On a phone, Share opens your own Instagram, WhatsApp or Facebook with everything filled in. Nothing is linked to anyone else’s account.</p></div>');

    var feed = $('#cvFeed'), story = $('#cvStory'), cap = $('#caption');
    function refreshCaption() { var c = captions(o, channel); cap.value = lang === 'en' ? c.en : c.es; }
    refreshCaption();
    drawPosters(o, feed, story);

    sheet.querySelectorAll('[data-chan]').forEach(function (b) { b.addEventListener('click', function () {
      channel = b.getAttribute('data-chan');
      sheet.querySelectorAll('[data-chan]').forEach(function (x) { x.classList.toggle('on', x === b); });
      var g = $('#openGoogle');
      g.classList.toggle('hidden', channel !== 'google' || !v.googleProfileUrl);
      if (v.googleProfileUrl) g.href = v.googleProfileUrl;
      refreshCaption();
    }); });
    sheet.querySelectorAll('[data-lang]').forEach(function (b) { b.addEventListener('click', function () {
      lang = b.getAttribute('data-lang');
      sheet.querySelectorAll('[data-lang]').forEach(function (x) { x.classList.toggle('on', x === b); });
      refreshCaption();
    }); });
    $('#copyCap').addEventListener('click', function () { copy(cap.value).then(function () { toast('Caption copied'); }); });
    $('#saveImg').addEventListener('click', function () {
      [[feed, 'post'], [story, 'story']].forEach(function (p) {
        var a = document.createElement('a'); a.download = slug(o.name) + '-' + o.date + '-' + p[1] + '.png'; a.href = p[0].toDataURL('image/png'); a.click();
      });
    });
    $('#shareNow').addEventListener('click', function () {
      var target = channel === 'instagram' ? story : feed;
      copy(cap.value);
      target.toBlob(function (blob) {
        var file = new File([blob], slug(o.name) + '.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], text: cap.value, title: o.name }).catch(function () {});
        } else {
          var a = document.createElement('a'); a.download = file.name; a.href = URL.createObjectURL(blob); a.click();
          toast('Image saved and caption copied. Paste it into the post.');
        }
      }, 'image/png');
    });
  }

  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); return Promise.resolve();
  }

  function drawPosters(o, feed, story) {
    var L = LOOK_INFO[S.data.state.venue.look];
    var fonts = [L.weight + ' 100px "' + L.head + '"', '700 40px "DM Sans"'];
    Promise.all(fonts.map(function (f) { return document.fonts.load(f).catch(function () {}); })).then(function () {
      if (!o.photo) { poster(feed, o, L, null); poster(story, o, L, null); return; }
      var img = new Image();
      img.onload = function () { poster(feed, o, L, img); poster(story, o, L, img); };
      img.onerror = function () { poster(feed, o, L, null); poster(story, o, L, null); };
      img.src = '/photos/' + o.photo;
    });
  }

  function wrap(ctx, text, maxW) {
    var words = text.split(/\s+/), lines = [], line = '';
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    return lines;
  }

  function poster(cv, o, L, img) {
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, v = S.data.state.venue;
    var isTonight = o.date === S.data.schedule.today;
    ctx.fillStyle = L.bg; ctx.fillRect(0, 0, W, H);
    var pad = 72, cardX = pad, cardY = pad, cardW = W - pad * 2, cardH = H - pad * 2;
    ctx.save();
    if (L === LOOK_INFO.poster) {
      ctx.translate(W / 2, H / 2); ctx.rotate(-0.018); ctx.translate(-W / 2, -H / 2);
      ctx.fillStyle = '#8f6d12'; ctx.fillRect(cardX + 16, cardY + 18, cardW, cardH);
    }
    var radius = L === LOOK_INFO.beach ? 48 : L === LOOK_INFO.dark ? 20 : 0;
    ctx.fillStyle = L.card; roundRect(ctx, cardX, cardY, cardW, cardH, radius); ctx.fill();
    if (L === LOOK_INFO.dark) { ctx.strokeStyle = L.accent; ctx.lineWidth = 3; roundRect(ctx, cardX, cardY, cardW, cardH, radius); ctx.stroke(); }
    if (L === LOOK_INFO.gallery) { ctx.strokeStyle = L.ink; ctx.lineWidth = 2; ctx.strokeRect(cardX, cardY, cardW, cardH); }

    var ix = cardX + 60, iw = cardW - 120, y = cardY + 70;
    ctx.fillStyle = L.ink;
    if (L === LOOK_INFO.poster) { ctx.fillRect(ix, y, iw, 12); ctx.fillRect(ix, y + 56, iw, 4); }
    ctx.font = '700 30px "DM Sans"'; ctx.textBaseline = 'top';
    var label = (isTonight ? 'TONIGHT' : shortDate(o.date).toUpperCase()) + (o.doors ? '  ·  DOORS ' + o.doors : '');
    ctx.fillText(label, ix, y + 18);
    y += 100;

    // Size the title first, then give the photo whatever room is left.
    var size = L.upper ? 128 : 112;
    var title = L.upper ? o.name.toUpperCase() : o.name;
    ctx.font = L.weight + ' ' + size + 'px "' + L.head + '"';
    var lines = wrap(ctx, title, iw);
    while (lines.length > 3 && size > 64) { size -= 8; ctx.font = L.weight + ' ' + size + 'px "' + L.head + '"'; lines = wrap(ctx, title, iw); }
    lines = lines.slice(0, 4);
    var lineH = size * (L.upper ? 0.98 : 1.08);
    var djs = o.djs.slice(0, 3);
    var footY = cardY + cardH - 90;
    var textH = lines.length * lineH + 24 + djs.length * 54;
    var photoH = Math.round(footY - 50 - textH - 40 - y);
    if (photoH > 160) {
      ctx.save(); roundRect(ctx, ix, y, iw, photoH, radius ? radius / 2 : 0); ctx.clip();
      if (img) {
        var s = Math.max(iw / img.naturalWidth, photoH / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
        ctx.drawImage(img, ix + (iw - w) / 2, y + (photoH - h) / 2, w, h);
      } else {
        ctx.globalAlpha = 0.18; ctx.strokeStyle = L.ink; ctx.lineWidth = 10;
        for (var k = -photoH; k < iw; k += 34) { ctx.beginPath(); ctx.moveTo(ix + k, y + photoH); ctx.lineTo(ix + k + photoH, y); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      y += photoH + 40;
    }
    ctx.font = L.weight + ' ' + size + 'px "' + L.head + '"';
    lines.forEach(function (ln) { ctx.fillText(ln, ix, y); y += lineH; });
    y += 24;

    ctx.font = '600 36px "DM Sans"';
    djs.forEach(function (dj) {
      ctx.fillText(dj.name, ix, y);
      if (dj.time) { var tw = ctx.measureText(dj.time).width; ctx.fillText(dj.time, ix + iw - tw, y); }
      y += 54;
    });

    ctx.font = '700 30px "DM Sans"';
    var foot = (v.name + '  ·  ' + (v.instagram ? '@' + v.instagram : '')).toUpperCase();
    ctx.fillText(foot, ix, footY);
    if (L === LOOK_INFO.dark) { ctx.fillStyle = L.accent; ctx.fillRect(ix, cardY + cardH - 120, 80, 8); }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (!r) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- events ----------
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    S.tab = b.getAttribute('data-tab'); render();
  });

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-close], [data-close-bg], [data-go], [data-share], [data-edit-night], [data-sec], [data-price], [data-sold], [data-edit-dish], [data-new-dish], [data-today], [data-enq], [data-look], [data-reset], [data-logout]');
    if (!t) return;
    if (t.hasAttribute('data-close-bg')) { if (e.target === t) closeSheet(); return; }
    if (t.hasAttribute('data-close')) return closeSheet();
    if (t.hasAttribute('data-share')) return shareSheet(t.getAttribute('data-share'));
    if (t.hasAttribute('data-edit-night')) return nightSheet(S.data.state.nights.find(function (n) { return n.id === t.getAttribute('data-edit-night'); }));
    if (t.hasAttribute('data-go')) {
      var g = t.getAttribute('data-go');
      if (g === 'newnight') return nightSheet(null);
      if (g === 'closetoday') {
        var closedNow = S.data.status.special && !S.data.status.today;
        return act('hours.day', { mode: closedNow ? 'normal' : 'closed' }).then(function (j) { doneSheet(j.change); }).catch(function (err) { toast(err.message); });
      }
      S.tab = g; return render();
    }
    if (t.hasAttribute('data-sec')) { S.menuSection = t.getAttribute('data-sec'); return render(); }
    if (t.hasAttribute('data-edit-dish')) return dishSheet(S.data.state.menu.find(function (m) { return m.id === t.getAttribute('data-edit-dish'); }));
    if (t.hasAttribute('data-new-dish')) return dishSheet(null);
    if (t.hasAttribute('data-price')) {
      var m = S.data.state.menu.find(function (x) { return x.id === t.getAttribute('data-price'); });
      var price = Math.max(0, m.price + Number(t.getAttribute('data-delta')));
      return act('menu.save', Object.assign({}, m, { price: price })).then(function (j) { toast(j.change.summary + ' · live on the site'); }).catch(function (err) { toast(err.message); });
    }
    if (t.hasAttribute('data-sold')) {
      var dish = S.data.state.menu.find(function (x) { return x.id === t.getAttribute('data-sold'); });
      return act('menu.soldout', { id: dish.id, soldOut: !dish.soldOut }).then(function (j) { toast(j.change.summary + ' · live on the site'); }).catch(function (err) { toast(err.message); });
    }
    if (t.hasAttribute('data-today')) {
      var mode = t.getAttribute('data-today');
      if (mode === 'custom') return $('#customToday').classList.remove('hidden');
      var payload = mode === 'save' ? { mode: 'custom', slot: { open: $('#tOpen').value, close: $('#tClose').value } } : { mode: mode };
      return act('hours.day', payload).then(function (j) { doneSheet(j.change); }).catch(function (err) { toast(err.message); });
    }
    if (t.hasAttribute('data-enq')) {
      return api('/api/admin/enquiries/' + t.getAttribute('data-enq'), { method: 'PATCH', body: { status: t.getAttribute('data-status') } }).then(load).catch(function (err) { toast(err.message); });
    }
    if (t.hasAttribute('data-look')) return act('look.set', { look: t.getAttribute('data-look') }).then(function () { toast('Look changed. The whole site has switched.'); }).catch(function (err) { toast(err.message); });
    if (t.hasAttribute('data-reset')) {
      if (!window.confirm('Reset all demo data back to the start?')) return;
      return api('/api/admin/reset', { method: 'POST' }).then(function () { S.lastChange = null; return load(); }).then(function () { toast('Demo reset'); }).catch(function (err) { toast(err.message); });
    }
    if (t.hasAttribute('data-logout')) return api('/api/logout', { method: 'POST' }).then(showLogin);
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet.innerHTML) closeSheet(); });

  // ---------- start ----------
  api('/api/editor-info').then(function (info) {
    if (!info.loggedIn) return showLogin();
    tabs.classList.remove('hidden');
    return load();
  }).catch(function () { showLogin(); });
})();
