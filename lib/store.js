'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { seedState } = require('./seed');

// Storage: MySQL when DB_NAME is set (Hostinger), otherwise a local JSON file
// for development and tests. Both expose the same small interface.

function createStore() {
  if (process.env.DB_NAME) return mysqlStore();
  return fileStore(process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'local.json'));
}

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
    timezone: 'Z'
  });

  async function init() {
    await pool.query(`CREATE TABLE IF NOT EXISTS venue_state (
      id TINYINT PRIMARY KEY, data LONGTEXT NOT NULL, version INT NOT NULL, updated_at DATETIME NOT NULL
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS changes (
      id INT AUTO_INCREMENT PRIMARY KEY, at DATETIME NOT NULL, kind VARCHAR(20) NOT NULL, summary VARCHAR(255) NOT NULL
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS enquiries (
      id INT AUTO_INCREMENT PRIMARY KEY, created_at DATETIME NOT NULL, name VARCHAR(80) NOT NULL,
      contact VARCHAR(120) NOT NULL, date VARCHAR(10), guests SMALLINT, type VARCHAR(20) NOT NULL,
      message TEXT, status VARCHAR(12) NOT NULL DEFAULT 'new', source VARCHAR(20)
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS photos (
      id VARCHAR(32) PRIMARY KEY, mime VARCHAR(20) NOT NULL, data MEDIUMBLOB NOT NULL, created_at DATETIME NOT NULL
    )`);
    const [rows] = await pool.query('SELECT id FROM venue_state WHERE id = 1');
    if (!rows.length) await reset();
  }

  async function getState() {
    const [rows] = await pool.query('SELECT data, version, updated_at FROM venue_state WHERE id = 1');
    if (!rows.length) { await reset(); return getState(); }
    return { data: JSON.parse(rows[0].data), version: rows[0].version, updatedAt: rows[0].updated_at };
  }

  // Optimistic lock on version so two phones can't overwrite each other.
  async function saveState(data, expectedVersion, change) {
    const [res] = await pool.query(
      'UPDATE venue_state SET data = ?, version = version + 1, updated_at = UTC_TIMESTAMP() WHERE id = 1 AND version = ?',
      [JSON.stringify(data), expectedVersion]
    );
    if (res.affectedRows !== 1) return null;
    await pool.query('INSERT INTO changes (at, kind, summary) VALUES (UTC_TIMESTAMP(), ?, ?)', [change.kind, change.summary.slice(0, 255)]);
    return expectedVersion + 1;
  }

  async function version() {
    const [rows] = await pool.query('SELECT version FROM venue_state WHERE id = 1');
    return rows.length ? rows[0].version : 0;
  }

  async function listChanges(limit = 12) {
    const [rows] = await pool.query('SELECT id, at, kind, summary FROM changes ORDER BY id DESC LIMIT ?', [limit]);
    return rows.map((r) => ({ ...r, at: r.at instanceof Date ? r.at.toISOString() : r.at }));
  }

  async function addEnquiry(e) {
    const [res] = await pool.query(
      'INSERT INTO enquiries (created_at, name, contact, date, guests, type, message, status, source) VALUES (UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, \'new\', ?)',
      [e.name, e.contact, e.date || null, e.guests || null, e.type, e.message || '', e.source || 'direct']
    );
    return res.insertId;
  }

  async function listEnquiries(limit = 50) {
    const [rows] = await pool.query('SELECT * FROM enquiries ORDER BY id DESC LIMIT ?', [limit]);
    return rows;
  }

  async function setEnquiryStatus(id, status) {
    await pool.query('UPDATE enquiries SET status = ? WHERE id = ?', [status, id]);
  }

  async function savePhoto(buf, mime) {
    const id = crypto.randomBytes(12).toString('hex');
    await pool.query('INSERT INTO photos (id, mime, data, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [id, mime, buf]);
    return id;
  }

  async function getPhoto(id) {
    const [rows] = await pool.query('SELECT mime, data FROM photos WHERE id = ?', [id]);
    return rows.length ? { mime: rows[0].mime, data: rows[0].data } : null;
  }

  async function reset() {
    await pool.query('DELETE FROM venue_state');
    await pool.query('INSERT INTO venue_state (id, data, version, updated_at) VALUES (1, ?, 1, UTC_TIMESTAMP())', [JSON.stringify(seedState())]);
    await pool.query('DELETE FROM changes');
    await pool.query('DELETE FROM enquiries');
    await pool.query('INSERT INTO changes (at, kind, summary) VALUES (UTC_TIMESTAMP(), \'venue\', \'Demo data loaded\')');
  }

  return { kind: 'mysql', init, getState, saveState, version, listChanges, addEnquiry, listEnquiries, setEnquiryStatus, savePhoto, getPhoto, reset };
}

// ---------- Local file (development) ----------

function fileStore(file) {
  let db = null;

  function load() {
    if (db) return db;
    try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { db = null; }
    if (!db) { db = blank(); persist(); }
    return db;
  }

  function blank() {
    return { state: seedState(), version: 1, changes: [{ id: 1, at: new Date().toISOString(), kind: 'venue', summary: 'Demo data loaded' }], enquiries: [], photos: {} };
  }

  function persist() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(db));
  }

  return {
    kind: 'file',
    async init() { load(); },
    async getState() { const d = load(); return { data: JSON.parse(JSON.stringify(d.state)), version: d.version }; },
    async saveState(data, expectedVersion, change) {
      const d = load();
      if (d.version !== expectedVersion) return null;
      d.state = data;
      d.version += 1;
      d.changes.push({ id: d.changes.length + 1, at: new Date().toISOString(), kind: change.kind, summary: change.summary });
      persist();
      return d.version;
    },
    async version() { return load().version; },
    async listChanges(limit = 12) { return load().changes.slice(-limit).reverse(); },
    async addEnquiry(e) {
      const d = load();
      const id = d.enquiries.length + 1;
      d.enquiries.push({ id, created_at: new Date().toISOString(), status: 'new', ...e });
      persist();
      return id;
    },
    async listEnquiries(limit = 50) { return load().enquiries.slice(-limit).reverse(); },
    async setEnquiryStatus(id, status) { const e = load().enquiries.find((x) => x.id === id); if (e) { e.status = status; persist(); } },
    async savePhoto(buf, mime) { const id = crypto.randomBytes(12).toString('hex'); load().photos[id] = { mime, data: buf.toString('base64') }; persist(); return id; },
    async getPhoto(id) { const p = load().photos[id]; return p ? { mime: p.mime, data: Buffer.from(p.data, 'base64') } : null; },
    async reset() { db = blank(); persist(); }
  };
}

module.exports = { createStore };
