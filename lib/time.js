'use strict';

// Dates are plain 'YYYY-MM-DD' strings in the venue's own time zone.
// A "service day" runs from 06:00 to 05:59 the next morning, so a set that
// finishes at 04:00 still belongs to the night it started.

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SERVICE_DAY_START = '06:00';

function localNow(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}`;
  return { date, time, dow: dowOf(date) };
}

function dowOf(date) {
  return new Date(date + 'T12:00:00Z').getUTCDay();
}

function addDays(date, n) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function serviceDate(local) {
  return local.time < SERVICE_DAY_START ? addDays(local.date, -1) : local.date;
}

function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z'));
}

function isTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ES_DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ES_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatDate(date, lang = 'en', style = 'long') {
  const d = new Date(date + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const day = d.getUTCDate();
  const m = d.getUTCMonth();
  if (lang === 'es') {
    return style === 'short' ? `${ES_DAYS[dow].slice(0, 3)} ${day} ${ES_MONTHS[m].slice(0, 3)}` : `${ES_DAYS[dow]} ${day} de ${ES_MONTHS[m]}`;
  }
  return style === 'short' ? `${EN_DAYS[dow].slice(0, 3)} ${day} ${EN_MONTHS[m].slice(0, 3)}` : `${EN_DAYS[dow]} ${day} ${EN_MONTHS[m]}`;
}

module.exports = {
  DAY_KEYS, EN_DAYS, ES_DAYS, localNow, dowOf, addDays, serviceDate, isDate, isTime, formatDate
};
