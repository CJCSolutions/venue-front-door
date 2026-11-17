// Keeps an open page live, plays stories, and switches menu tabs.
(function () {
  var current = document.body.getAttribute('data-version');
  var toast = document.querySelector('[data-toast]');

  function swap() {
    if (document.querySelector('[data-viewer]:not([hidden])')) return;
    fetch(location.href, { headers: { 'X-Live': '1' }, cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        ['main', 'status'].forEach(function (k) {
          var fresh = doc.querySelector('[data-live="' + k + '"]');
          var old = document.querySelector('[data-live="' + k + '"]');
          if (fresh && old) old.replaceWith(fresh);
        });
        current = doc.body.getAttribute('data-version') || current;
        document.body.setAttribute('data-version', current);
        bind();
        if (toast) { toast.hidden = false; setTimeout(function () { toast.hidden = true; }, 3500); }
      })
      .catch(function () {});
  }

  function check() {
    if (document.hidden) return;
    fetch('/api/version', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (String(d.version) !== String(current)) swap(); })
      .catch(function () {});
  }

  // ---- menu filters and tabs ----
  function bindFilters() {
    var chips = document.querySelectorAll('[data-filter]');
    chips.forEach(function (chip) {
      chip.onclick = function () {
        var f = chip.getAttribute('data-filter');
        chips.forEach(function (c) { c.classList.toggle('on', c === chip); });
        document.querySelectorAll('.dish').forEach(function (d) {
          var tags = (d.getAttribute('data-tags') || '').split(',');
          d.classList.toggle('hidden', !!f && tags.indexOf(f) < 0);
        });
      };
    });
  }
  function showMenu(id) {
    var found = false;
    document.querySelectorAll('[data-menu-panel]').forEach(function (p) { var on = p.id === id; p.hidden = !on; found = found || on; });
    if (!found) return;
    document.querySelectorAll('[data-menu-tab]').forEach(function (t) { var on = t.getAttribute('data-menu-tab') === id; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
  }
  function bindTabs() {
    document.querySelectorAll('[data-menu-tab]').forEach(function (t) {
      t.onclick = function (e) { e.preventDefault(); showMenu(t.getAttribute('data-menu-tab')); history.replaceState(null, '', '#' + t.getAttribute('data-menu-tab')); };
    });
    if (location.hash) showMenu(location.hash.slice(1));
  }

  // ---- stories ----
  var viewer = document.querySelector('[data-viewer]');
  var stories = [], idx = 0, timer = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ago(t) { var m = Math.max(1, Math.round((Date.now() - Date.parse(t)) / 60000)); return m < 60 ? m + 'm ago' : Math.round(m / 60) + 'h ago'; }
  function openStory(i) {
    idx = i;
    var s = stories[idx];
    if (!s) return closeStory();
    viewer.hidden = false;
    viewer.innerHTML = '<div class="story ' + (s.photo ? '' : 'story-text-only') + '" role="dialog" aria-modal="true" aria-label="Story">' +
      '<div class="story-bars">' + stories.map(function (_, k) { return '<span class="' + (k <= idx ? 'done' : '') + '"></span>'; }).join('') + '</div>' +
      '<div class="story-top"><span>' + esc(ago(s.at)) + (s.circle ? ' · Circle only' : '') + '</span><button class="story-close" data-story-close aria-label="Close">✕</button></div>' +
      (s.photo ? '<img src="' + esc(s.photo) + '" alt="">' : '') +
      '<button class="story-nav prev" data-story-prev aria-label="Previous story"></button><button class="story-nav next" data-story-next aria-label="Next story"></button>' +
      (s.caption ? '<div class="story-cap">' + esc(s.caption) + '</div>' : '') +
      (s.link ? '<a class="story-link" href="' + esc(s.link) + '">' + esc(s.linkText || 'See more') + ' →</a>' : '') + '</div>';
    viewer.querySelector('[data-story-close]').focus();
    clearTimeout(timer);
    timer = setTimeout(function () { openStory(idx + 1); }, 6000);
  }
  function closeStory() { clearTimeout(timer); viewer.hidden = true; viewer.innerHTML = ''; }
  function bindStories() {
    var data = document.getElementById('story-data');
    stories = data ? JSON.parse(data.textContent) : [];
    document.querySelectorAll('[data-story]').forEach(function (b) { b.onclick = function () { openStory(Number(b.getAttribute('data-story'))); }; });
  }
  if (viewer) {
    viewer.addEventListener('click', function (e) {
      if (e.target.closest('[data-story-close]') || e.target === viewer) return closeStory();
      if (e.target.closest('[data-story-next]')) return openStory(idx + 1);
      if (e.target.closest('[data-story-prev]')) return openStory(Math.max(0, idx - 1));
    });
    document.addEventListener('keydown', function (e) {
      if (viewer.hidden) return;
      if (e.key === 'Escape') closeStory();
      if (e.key === 'ArrowRight') openStory(idx + 1);
      if (e.key === 'ArrowLeft') openStory(Math.max(0, idx - 1));
    });
  }

  function bind() { bindFilters(); bindTabs(); bindStories(); }
  bind();
  setInterval(check, 15000);
  document.addEventListener('visibilitychange', check);
})();
