/* Share images: post (4:5) and story (9:16), drawn in the venue's look and
   brand colour, for events and for stories. */
(function () {
  'use strict';

  var LOOKS = {
    poster: { name: 'Poster wall', bg: '#1a1917', card: '#e9b52f', under: '#8f6d12', ink: '#1a1409', text: '#ece3cf', head: 'Anton', weight: '400', upper: true, accent: '#e9b52f', radius: 0, tilt: true },
    gallery: { name: 'Gallery', bg: '#f8f6f1', card: '#f8f6f1', ink: '#151412', text: '#151412', head: 'Playfair Display', weight: '400', upper: false, accent: '#151412', radius: 0, frame: true },
    beach: { name: 'Beach club', bg: '#f4e8d8', card: '#c8553d', ink: '#fff6ea', text: '#3a2418', head: 'DM Serif Display', weight: '400', upper: false, accent: '#c8553d', radius: 48 },
    dark: { name: 'After dark', bg: '#0b0b10', card: '#14141c', ink: '#f2f2f5', text: '#f2f2f5', head: 'Space Grotesk', weight: '700', upper: true, accent: '#c6ff3d', radius: 20, outline: true }
  };

  function inkFor(hex) {
    var n = parseInt(hex.slice(1), 16);
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.4 ? '#141210' : '#fbf7ef';
  }

  function look(venue) {
    var L = Object.assign({}, LOOKS[venue.look] || LOOKS.poster);
    if (venue.accent && (venue.look === 'poster' || venue.look === 'beach')) { L.card = venue.accent; L.ink = inkFor(venue.accent); L.under = 'rgba(0,0,0,.35)'; }
    if (venue.accent) L.accent = venue.accent;
    return L;
  }

  function loadFonts(L) {
    return Promise.all([L.weight + ' 100px "' + L.head + '"', '700 40px "DM Sans"', '600 40px "DM Sans"'].map(function (f) { return document.fonts.load(f).catch(function () {}); }));
  }

  function loadImg(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function wrap(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (!r) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function frame(cv, L) {
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 72;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = L.bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (L.tilt) { ctx.translate(W / 2, H / 2); ctx.rotate(-0.018); ctx.translate(-W / 2, -H / 2); ctx.fillStyle = L.under; ctx.fillRect(pad + 16, pad + 18, W - pad * 2, H - pad * 2); }
    ctx.fillStyle = L.card; roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, L.radius); ctx.fill();
    if (L.outline) { ctx.strokeStyle = L.accent; ctx.lineWidth = 3; roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, L.radius); ctx.stroke(); }
    if (L.frame) { ctx.strokeStyle = L.ink; ctx.lineWidth = 2; ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2); }
    return { ctx: ctx, x: pad + 60, w: W - pad * 2 - 120, top: pad + 70, bottom: H - pad - 90 };
  }

  function photo(ctx, img, x, y, w, h, r, ink) {
    ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
    if (img) {
      var s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      ctx.drawImage(img, x + (w - img.naturalWidth * s) / 2, y + (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    } else {
      ctx.globalAlpha = 0.18; ctx.strokeStyle = ink; ctx.lineWidth = 10;
      for (var k = -h; k < w; k += 34) { ctx.beginPath(); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function footer(ctx, f, L, venue) {
    ctx.fillStyle = L.ink;
    ctx.font = '700 30px "DM Sans"';
    ctx.fillText((venue.name + (venue.instagram ? '  ·  @' + venue.instagram : '')).toUpperCase(), f.x, f.bottom);
    if (L.outline) { ctx.fillStyle = L.accent; ctx.fillRect(f.x, f.bottom - 30, 80, 8); }
  }

  // Event poster
  function eventImage(cv, o, venue, label, img) {
    var L = look(venue), f = frame(cv, L), ctx = f.ctx, y = f.top, r = L.radius ? L.radius / 2 : 0;
    ctx.fillStyle = L.ink; ctx.textBaseline = 'top';
    if (L.tilt) { ctx.fillRect(f.x, y, f.w, 12); ctx.fillRect(f.x, y + 56, f.w, 4); }
    ctx.font = '700 30px "DM Sans"';
    ctx.fillText(label.toUpperCase() + (o.doors ? '  ·  ' + o.doors : ''), f.x, y + 18);
    y += 100;
    var size = L.upper ? 128 : 112, title = L.upper ? o.name.toUpperCase() : o.name;
    ctx.font = L.weight + ' ' + size + 'px "' + L.head + '"';
    var lines = wrap(ctx, title, f.w);
    while (lines.length > 3 && size > 64) { size -= 8; ctx.font = L.weight + ' ' + size + 'px "' + L.head + '"'; lines = wrap(ctx, title, f.w); }
    lines = lines.slice(0, 4);
    var lineH = size * (L.upper ? 0.98 : 1.08), people = (o.lineup || []).slice(0, 3);
    var extra = o.bookable ? 60 : 0;
    var photoH = Math.round(f.bottom - 50 - (lines.length * lineH + 24 + people.length * 54 + extra) - 40 - y);
    if (photoH > 160) { photo(ctx, img, f.x, y, f.w, photoH, r, L.ink); y += photoH + 40; }
    ctx.fillStyle = L.ink;
    ctx.font = L.weight + ' ' + size + 'px "' + L.head + '"';
    lines.forEach(function (ln) { ctx.fillText(ln, f.x, y); y += lineH; });
    y += 24;
    ctx.font = '600 36px "DM Sans"';
    people.forEach(function (p) { ctx.fillText(p.name, f.x, y); if (p.time) ctx.fillText(p.time, f.x + f.w - ctx.measureText(p.time).width, y); y += 54; });
    if (o.bookable) { ctx.font = '700 32px "DM Sans"'; ctx.fillText('BOOK YOUR PLACE' + (o.price ? '  ·  €' + o.price : ''), f.x, y + 6); }
    footer(ctx, f, L, venue);
    ctx.restore();
  }

  // Story card: the photo full-bleed with the caption, or a text card.
  function storyImage(cv, s, venue, img) {
    var L = look(venue), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textBaseline = 'top';
    if (img) {
      photo(ctx, img, 0, 0, W, H, 0, '#000');
      var g = ctx.createLinearGradient(0, H * 0.55, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.7)');
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.55, W, H * 0.45);
      ctx.fillStyle = '#fff'; ctx.font = '700 56px "DM Sans"';
      var ls = wrap(ctx, s.caption || '', W - 160).slice(0, 5), y = H - 220 - ls.length * 70;
      ls.forEach(function (l) { ctx.fillText(l, 80, y); y += 70; });
      ctx.font = '700 32px "DM Sans"'; ctx.fillText(venue.name.toUpperCase(), 80, H - 140);
      return;
    }
    var f = frame(cv, L); ctx = f.ctx; ctx.fillStyle = L.ink; ctx.textBaseline = 'top';
    var size = L.upper ? 120 : 104;
    ctx.font = L.weight + ' ' + size + 'px "' + L.head + '"';
    var text = L.upper ? (s.caption || '').toUpperCase() : (s.caption || '');
    var lines = wrap(ctx, text, f.w);
    while (lines.length > 7 && size > 56) { size -= 8; ctx.font = L.weight + ' ' + size + 'px "' + L.head + '"'; lines = wrap(ctx, text, f.w); }
    var lh = size * (L.upper ? 1 : 1.1), y2 = (H - lines.length * lh) / 2;
    lines.forEach(function (l) { ctx.fillText(l, f.x, y2); y2 += lh; });
    footer(ctx, f, L, venue);
    ctx.restore();
  }

  window.Share = { LOOKS: LOOKS, look: look, loadFonts: loadFonts, loadImg: loadImg, eventImage: eventImage, storyImage: storyImage };
})();
