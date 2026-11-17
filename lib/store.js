'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { seedState, seedRows, SCHEMA } = require('./seed');

// Storage: MySQL when DB_NAME is set (Hostinger), otherwise a local JSON file
// for development and tests. Both expose the same interface.
//
// The venue record (events, menus, stories, hours, look) is one JSON document,
// changed only through applyAction. Things that grow - bookings, enquiries,
// Circle members, page views, photos - live in their own tables.

function createStore() {
  if (process.env.DB_NAME) return mysqlStore();
  return fileStore(process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'local.json'));
}

const token = () => crypto.randomBytes(18).toString('base64url');

// ---------- MySQL ----------

function mysqlStore() {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
    connectTimeout: 8000,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: false
  });
  const q = (sql, args) => pool.query(sql, args).then(([rows]) => rows);
  const iso = (rows) => rows.map((r) => ({ ...r, created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at, at: r.at instanceof Date ? r.at.toISOString() : r.at }));

  async function init() {
    await q(`CREATE TABLE IF NOT EXISTS venue_state (id TINYINT PRIMARY KEY, data LONGTEXT NOT NULL, version INT NOT NULL, updated_at DATETIME NOT NULL) CHARACTER SET utf8mb4`);
    await q(`CREATE TABLE IF NOT EXISTS changes (id INT AUTO_INCREMENT PRIMARY KEY, at DATETIME NOT NULL, kind VARCHAR(20) NOT NULL, summary VARCHAR(255) NOT NULL) CHARACTER SET utf8mb4`);
    await q(`CREATE TABLE IF NOT EXISTS enquiries (id INT AUTO_INCREMENT PRIMARY KEY, created_at DATETIME NOT NULL, name VARCHAR(80) NOT NULL, contact VARCHAR(120) NOT NULL, date VARCHAR(10), guests SMALLINT, type VARCHAR(20) NOT NULL, message TEXT, status VARCHAR(12) NOT NULL DEFAULT 'new', source VARCHAR(20)) CHARACTER SET utf8mb4`);
    await q(`CREATE TABLE IF NOT EXISTS photos (id VARCHAR(32) PRIMARY KEY, mime VARCHAR(20) NOT NULL, data MEDIUMBLOB NOT NULL, created_at DATETIME NOT NULL)`);
    await q(`CREATE TABLE IF NOT EXISTS bookings (id INT AUTO_INCREMENT PRIMARY KEY, created_at DATETIME NOT NULL, event_key VARCHAR(80) NOT NULL, event_name VARCHAR(80) NOT NULL, date VARCHAR(10) NOT NULL, name VARCHAR(80) NOT NULL, contact VARCHAR(120) NOT NULL, guests SMALLINT NOT NULL, status VARCHAR(12) NOT NULL DEFAULT 'confirmed', source VARCHAR(20), INDEX (event_key)) CHARACTER SET utf8mb4`);
    await q(`CREATE TABLE IF NOT EXISTS members (id INT AUTO_INCREMENT PRIMARY KEY, created_at DATETIME NOT NULL, name VARCHAR(80) NOT NULL, email VARCHAR(120) NOT NULL UNIQUE, token VARCHAR(40) NOT NULL UNIQUE, source VARCHAR(20)) CHARACTER SET utf8mb4`);
    await q(`CREATE TABLE IF NOT EXISTS views (day VARCHAR(10) NOT NULL, source VARCHAR(20) NOT NULL, count INT NOT NULL, PRIMARY KEY (day, source))`);
    const rows = await q('SELECT data FROM venue_state WHERE id = 1');
    if (!rows.length || JSON.parse(rows[0].data).schema !== SCHEMA) await reset();
  }

  async function getState() {
    const rows = await q('SELECT data, version FROM venue_state WHERE id = 1');
    if (!rows.length) { await reset(); return getState(); }
    return { data: JSON.parse(rows[0].data), version: rows[0].version };
  }

  // Optimistic lock on version so two phones can't overwrite each other.
  async function saveState(data, expectedVersion, change) {
    const [res] = await pool.query('UPDATE venue_state SET data = ?, version = version + 1, updated_at = UTC_TIMESTAMP() WHERE id = 1 AND version = ?', [JSON.stringify(data), expectedVersion]);
    if (res.affectedRows !== 1) return null;
    await q('INSERT INTO changes (at, kind, summary) VALUES (UTC_TIMESTAMP(), ?, ?)', [change.kind, change.summary.slice(0, 255)]);
    return expectedVersion + 1;
  }

  async function bump() { await q('UPDATE venue_state SET version = version + 1 WHERE id = 1'); }

  async function reset() {
    const state = seedState();
    const rows = seedRows(state);
    for (const t of ['venue_state', 'changes', 'enquiries', 'bookings', 'members', 'views']) await q(`DELETE FROM ${t}`);
    await q('INSERT INTO venue_state (id, data, version, updated_at) VALUES (1, ?, 1, UTC_TIMESTAMP())', [JSON.stringify(state)]);
    await q("INSERT INTO changes (at, kind, summary) VALUES (UTC_TIMESTAMP(), 'venue', 'Demo data loaded')");
    for (const m of rows.members) await q('INSERT INTO members (created_at, name, email, token, source) VALUES (?, ?, ?, ?, ?)', [new Date(m.created_at), m.name, m.email, token(), m.source]);
    for (const b of rows.bookings) await q("INSERT INTO bookings (created_at, event_key, event_name, date, name, contact, guests, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)", [new Date(b.created_at), b.event_key, b.event_name, b.date, b.name, b.contact, b.guests, b.source]);
    for (const v of rows.views) await q('INSERT INTO views (day, source, count) VALUES (?, ?, ?)', [v.day, v.source, v.count]);
    for (const e of rows.enquiries) await q("INSERT INTO enquiries (created_at, name, contact, date, guests, type, message, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)", [new Date(e.created_at), e.name, e.contact, e.date, e.guests, e.type, e.message, e.source]);
  }

  return {
    kind: 'mysql', init, getState, saveState, reset,
    async version() { const r = await q('SELECT version FROM venue_state WHERE id = 1'); return r.length ? r[0].version : 0; },
    async listChanges(limit = 12) { return iso(await q('SELECT id, at, kind, summary FROM changes ORDER BY id DESC LIMIT ?', [limit])); },

    async addEnquiry(e) {
      const [res] = await pool.query("INSERT INTO enquiries (created_at, name, contact, date, guests, type, message, status, source) VALUES (UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, 'new', ?)", [e.name, e.contact, e.date || null, e.guests || null, e.type, e.message || '', e.source || 'direct']);
      return res.insertId;
    },
    async listEnquiries(limit = 50) { return iso(await q('SELECT * FROM enquiries ORDER BY id DESC LIMIT ?', [limit])); },
    async setEnquiryStatus(id, status) { await q('UPDATE enquiries SET status = ? WHERE id = ?', [status, id]); },

    // Capacity is checked inside a transaction so two guests can't take the last places.
    async addBooking(b, capacity) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        if (capacity) {
          const [[row]] = await conn.query("SELECT COALESCE(SUM(guests), 0) AS taken FROM bookings WHERE event_key = ? AND status <> 'cancelled' FOR UPDATE", [b.event_key]);
          if (Number(row.taken) + b.guests > capacity) { await conn.rollback(); return { full: true, left: Math.max(0, capacity - Number(row.taken)) }; }
        }
        const [res] = await conn.query("INSERT INTO bookings (created_at, event_key, event_name, date, name, contact, guests, status, source) VALUES (UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, 'confirmed', ?)", [b.event_key, b.event_name, b.date, b.name, b.contact, b.guests, b.source || 'direct']);
        await conn.commit();
        await bump();
        return { id: res.insertId };
      } catch (e) { await conn.rollback().catch(() => {}); throw e; } finally { conn.release(); }
    },
    async listBookings(limit = 200) { return iso(await q('SELECT * FROM bookings ORDER BY id DESC LIMIT ?', [limit])); },
    async bookedCounts() {
      const rows = await q("SELECT event_key, SUM(guests) AS guests, COUNT(*) AS bookings FROM bookings WHERE status <> 'cancelled' GROUP BY event_key");
      return Object.fromEntries(rows.map((r) => [r.event_key, { guests: Number(r.guests), bookings: Number(r.bookings) }]));
    },
    async setBookingStatus(id, status) { await q('UPDATE bookings SET status = ? WHERE id = ?', [status, id]); await bump(); },

    async addMember(m) {
      const existing = await q('SELECT token FROM members WHERE email = ?', [m.email]);
      if (existing.length) return { token: existing[0].token, existing: true };
      const t = token();
      await q('INSERT INTO members (created_at, name, email, token, source) VALUES (UTC_TIMESTAMP(), ?, ?, ?, ?)', [m.name, m.email, t, m.source || 'direct']);
      return { token: t, existing: false };
    },
    async memberByToken(t) { const r = await q('SELECT id, name, email FROM members WHERE token = ?', [String(t)]); return r[0] || null; },
    async listMembers(limit = 500) { return iso(await q('SELECT id, created_at, name, email, source FROM members ORDER BY id DESC LIMIT ?', [limit])); },

    async countView(day, source) { await q('INSERT INTO views (day, source, count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE count = count + 1', [day, source]); },
    async listViews(sinceDay) { return q('SELECT day, source, count FROM views WHERE day >= ?', [sinceDay]); },

    async savePhoto(buf, mime) { const id = crypto.randomBytes(12).toString('hex'); await q('INSERT INTO photos (id, mime, data, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [id, mime, buf]); return id; },
    async getPhoto(id) { const r = await q('SELECT mime, data FROM photos WHERE id = ?', [id]); return r.length ? { mime: r[0].mime, data: r[0].data } : null; }
  };
}

// ---------- Local file (development and tests) ----------

function fileStore(file) {
  let db = null;

  function blank() {
    const state = seedState();
    const rows = seedRows(state);
    let n = 0;
    return {
      state, version: 1,
      changes: [{ id: 1, at: new Date().toISOString(), kind: 'venue', summary: 'Demo data loaded' }],
      enquiries: rows.enquiries.map((e) => ({ id: ++n, status: 'new', ...e })),
      bookings: rows.bookings.map((b, i) => ({ id: i + 1, status: 'confirmed', ...b })),
      members: rows.members.map((m, i) => ({ id: i + 1, token: token(), ...m })),
      views: rows.views,
      photos: {}
    };
  }
  function load() {
    if (db) return db;
    try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { db = null; }
    if (!db || !db.state || db.state.schema !== SCHEMA) { db = blank(); persist(); }
    return db;
  }
  function persist() { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db)); }
  const clone = (x) => JSON.parse(JSON.stringify(x));

  return {
    kind: 'file',
    async init() { load(); },
    async getState() { const d = load(); return { data: clone(d.state), version: d.version }; },
    async saveState(data, expectedVersion, change) {
      const d = load();
      if (d.version !== expectedVersion) return null;
      d.state = data; d.version += 1;
      d.changes.push({ id: d.changes.length + 1, at: new Date().toISOString(), kind: change.kind, summary: change.summary });
      persist();
      return d.version;
    },
    async reset() { db = blank(); persist(); },
    async version() { return load().version; },
    async listChanges(limit = 12) { return clone(load().changes.slice(-limit).reverse()); },

    async addEnquiry(e) { const d = load(); const id = d.enquiries.length + 1; d.enquiries.push({ id, created_at: new Date().toISOString(), status: 'new', ...e }); persist(); return id; },
    async listEnquiries(limit = 50) { return clone(load().enquiries.slice(-limit).reverse()); },
    async setEnquiryStatus(id, status) { const e = load().enquiries.find((x) => x.id === id); if (e) { e.status = status; persist(); } },

    async addBooking(b, capacity) {
      const d = load();
      const taken = d.bookings.filter((x) => x.event_key === b.event_key && x.status !== 'cancelled').reduce((s, x) => s + x.guests, 0);
      if (capacity && taken + b.guests > capacity) return { full: true, left: Math.max(0, capacity - taken) };
      const id = d.bookings.length + 1;
      d.bookings.push({ id, created_at: new Date().toISOString(), status: 'confirmed', ...b });
      d.version += 1; persist();
      return { id };
    },
    async listBookings(limit = 200) { return clone(load().bookings.slice(-limit).reverse()); },
    async bookedCounts() {
      const out = {};
      for (const b of load().bookings) {
        if (b.status === 'cancelled') continue;
        out[b.event_key] = out[b.event_key] || { guests: 0, bookings: 0 };
        out[b.event_key].guests += b.guests; out[b.event_key].bookings += 1;
      }
      return out;
    },
    async setBookingStatus(id, status) { const d = load(); const b = d.bookings.find((x) => x.id === id); if (b) { b.status = status; d.version += 1; persist(); } },

    async addMember(m) {
      const d = load();
      const ex = d.members.find((x) => x.email === m.email);
      if (ex) return { token: ex.token, existing: true };
      const t = token();
      d.members.push({ id: d.members.length + 1, created_at: new Date().toISOString(), token: t, ...m });
      persist();
      return { token: t, existing: false };
    },
    async memberByToken(t) { const m = load().members.find((x) => x.token === t); return m ? { id: m.id, name: m.name, email: m.email } : null; },
    async listMembers(limit = 500) { return clone(load().members.slice(-limit).reverse().map(({ token: _t, ...m }) => m)); },

    async countView(day, source) { const d = load(); const v = d.views.find((x) => x.day === day && x.source === source); if (v) v.count += 1; else d.views.push({ day, source, count: 1 }); persist(); },
    async listViews(sinceDay) { return clone(load().views.filter((v) => v.day >= sinceDay)); },

    async savePhoto(buf, mime) { const id = crypto.randomBytes(12).toString('hex'); load().photos[id] = { mime, data: buf.toString('base64') }; persist(); return id; },
    async getPhoto(id) { const p = load().photos[id]; return p ? { mime: p.mime, data: Buffer.from(p.data, 'base64') } : null; }
  };
}

module.exports = { createStore };
