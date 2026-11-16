// Keeps an open page live: checks for a new version every 15 seconds and
// swaps in fresh content without a reload, so a guest looking at the site
// sees a price, a sold-out dish or tonight's night change as it happens.
(function () {
  var current = document.body.getAttribute('data-version');
  var toast = document.querySelector('[data-toast]');

  function swap() {
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
        bindFilters();
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

  function bindFilters() {
    var chips = document.querySelectorAll('[data-filter]');
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var f = chip.getAttribute('data-filter');
        chips.forEach(function (c) { c.classList.toggle('on', c === chip); });
        document.querySelectorAll('.dish').forEach(function (d) {
          var tags = (d.getAttribute('data-tags') || '').split(',');
          d.classList.toggle('hidden', !!f && tags.indexOf(f) < 0);
        });
      });
    });
  }

  bindFilters();
  setInterval(check, 15000);
  document.addEventListener('visibilitychange', check);
})();
