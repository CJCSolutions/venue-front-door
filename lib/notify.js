'use strict';

// Email alerts. The venue hears about every new booking, request and order;
// a guest who left an email hears when a table is confirmed or declined.
// Sent through the venue's own mailbox (SMTP_* settings). With no mailbox set,
// nothing is sent and the editor's own alert still works.

const { looksLikeEmail } = require('./reservations');

let transport = null;
const sent = []; // last messages, for tests and the editor's check

function configured() { return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS); }

function getTransport() {
  if (transport) return transport;
  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT || 465);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transport;
}

// One line, no line breaks: subjects and names must not carry extra headers.
const line = (s, max = 200) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

async function send({ to, subject, text, replyTo }) {
  if (!looksLikeEmail(to)) return { skipped: 'no address' };
  const msg = { to: line(to, 120), subject: line(subject), text, replyTo: looksLikeEmail(replyTo) ? line(replyTo, 120) : undefined };
  sent.push(msg); if (sent.length > 20) sent.shift();
  if (!configured()) return { skipped: 'no mailbox' };
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  try { await getTransport().sendMail({ ...msg, from }); return { ok: true }; } catch (e) { console.error('Email failed:', e.message); return { error: e.message }; }
}

// The public demo never emails guests, and only alerts the address set on the server.
const demo = () => process.env.DEMO_MODE === '1';

function alertAddress(state) {
  const a = demo() ? process.env.ALERT_EMAIL || '' : (state.alerts && state.alerts.email) || state.venue.email || process.env.ALERT_EMAIL || '';
  return looksLikeEmail(a) ? a : '';
}

// Fire and forget: a slow mailbox never holds up the guest's page.
function venueAlert(state, subject, lines, { replyTo, base = '' } = {}) {
  const to = alertAddress(state);
  if (!to) return;
  send({ to, subject: `${state.venue.name}: ${subject}`, text: lines.filter(Boolean).join('\n') + `\n\nOpen the editor: ${base}/admin`, replyTo }).catch(() => {});
}

// Caps so the venue's mailbox can't be used to send mail in bulk:
// at most 3 emails a day to one address, and 40 an hour in all.
const caps = { byAddress: new Map(), hour: [] };
function underCap(to, now = Date.now()) {
  const key = String(to).trim().toLowerCase();
  caps.hour = caps.hour.filter((t) => now - t < 3600 * 1000);
  const mine = (caps.byAddress.get(key) || []).filter((t) => now - t < 24 * 3600 * 1000);
  if (mine.length >= 3 || caps.hour.length >= 40) return false;
  mine.push(now); caps.byAddress.set(key, mine); caps.hour.push(now);
  if (caps.byAddress.size > 5000) caps.byAddress.clear();
  return true;
}

function guestEmail(state, to, subject, lines) {
  if (demo() || !looksLikeEmail(to) || !underCap(to)) return;
  send({ to, subject: `${state.venue.name}: ${subject}`, text: lines.filter(Boolean).join('\n') + `\n\n${state.venue.name}\n${state.venue.address || ''}\n${state.venue.phone || ''}`, replyTo: state.venue.email }).catch(() => {});
}

module.exports = { configured, venueAlert, guestEmail, alertAddress, sent, send };
