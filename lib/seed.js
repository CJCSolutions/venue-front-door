'use strict';

const { localNow, serviceDate, addDays, dowOf } = require('./time');

// Demo venue. Dates are worked out from the day the data is created, so the
// demo always has something on tonight, a full week ahead and an archive.

function nextDow(from, dow) {
  return addDays(from, (dow - dowOf(from) + 7) % 7);
}

function seedState(now = new Date()) {
  const timezone = 'Europe/Madrid';
  const today = serviceDate(localNow(timezone, now));
  const anchor = addDays(today, -56);

  const state = {
    venue: {
      name: 'Marea',
      tagline: 'Food, music and long nights by the harbour',
      kind: 'Restaurant and bar',
      address: 'Calle del Puerto 12, Sant Antoni de Portmany, Ibiza',
      city: 'Sant Antoni de Portmany',
      phone: '+34 600 000 000',
      email: 'hola@marea.example',
      instagram: 'marea.example',
      googleProfileUrl: 'https://business.google.com/',
      timezone,
      look: 'poster'
    },
    hours: {
      weekly: {
        mon: null,
        tue: { open: '18:00', close: '00:00' },
        wed: { open: '18:00', close: '02:00' },
        thu: { open: '18:00', close: '02:00' },
        fri: { open: '12:00', close: '04:00' },
        sat: { open: '12:00', close: '04:00' },
        sun: { open: '12:00', close: '00:00' }
      },
      overrides: {}
    },
    nights: [
      {
        id: 'tonight-special',
        name: 'Dune: album release night',
        blurb: 'Dune plays the new record start to finish, then an open-ended set.',
        start: today,
        repeat: 'none',
        doors: '22:00',
        djs: [{ name: 'Kasper', time: '22:00' }, { name: 'Dune', time: '00:30' }],
        photo: null,
        skipped: []
      },
      {
        id: 'wednesday-jam',
        name: 'Wednesday Jam',
        blurb: 'Open decks and live players. Bring a record.',
        start: nextDow(anchor, 3),
        repeat: 'weekly',
        doors: '21:00',
        djs: [{ name: 'Open decks', time: '21:00' }],
        photo: null,
        skipped: []
      },
      {
        id: 'house-friday',
        name: 'House Friday',
        blurb: 'Kasper all night long.',
        start: nextDow(anchor, 5),
        repeat: 'weekly',
        doors: '22:00',
        djs: [{ name: 'Kasper', time: '22:00' }],
        photo: null,
        skipped: []
      },
      {
        id: 'sunset-sessions',
        name: 'Sunset Sessions',
        blurb: 'Lio plays the sun down on the terrace.',
        start: nextDow(anchor, 6),
        repeat: 'weekly',
        doors: '18:00',
        djs: [{ name: 'Lio', time: '18:30' }],
        photo: null,
        skipped: []
      },
      {
        id: 'long-lunch',
        name: 'Long Lunch',
        blurb: 'Paella, vinyl and no rush.',
        start: nextDow(anchor, 0),
        repeat: 'weekly',
        doors: '13:00',
        djs: [],
        photo: null,
        skipped: []
      },
      {
        id: 'first-friday',
        name: 'First Friday Guest',
        blurb: 'A guest DJ from off the island, first Friday of every month.',
        start: firstFridayOnOrBefore(anchor),
        repeat: 'monthly',
        doors: '23:00',
        djs: [{ name: 'Guest DJ', time: '01:00' }],
        photo: null,
        skipped: []
      }
    ],
    menu: [
      { id: 'm1', section: 'Food', name: 'Grilled octopus', note: 'Paprika oil, crushed potato', price: 19, tags: [], soldOut: false },
      { id: 'm2', section: 'Food', name: 'Tomato salad', note: 'Basil, Ibizan olive oil', price: 11, tags: ['vegan', 'gluten free'], soldOut: false },
      { id: 'm3', section: 'Food', name: 'Padrón peppers', note: 'Sea salt', price: 8, tags: ['vegan'], soldOut: false },
      { id: 'm4', section: 'Food', name: 'Paella for two', note: 'Sundays from 13:00', price: 42, tags: [], soldOut: false },
      { id: 'm5', section: 'Food', name: 'Burnt cheesecake', note: 'Orange blossom honey', price: 9, tags: ['vegetarian'], soldOut: false },
      { id: 'm6', section: 'Drinks', name: 'Marea spritz', note: 'Bitter orange, cava', price: 12, tags: [], soldOut: false },
      { id: 'm7', section: 'Drinks', name: 'Hierbas sour', note: 'Hierbas ibicencas, lemon', price: 11, tags: [], soldOut: false },
      { id: 'm8', section: 'Drinks', name: 'Estrella, draught', note: '33cl', price: 5, tags: [], soldOut: false }
    ]
  };
  // The demo always has a night on tonight, so make sure the venue is open.
  const todayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dowOf(today)];
  if (!state.hours.weekly[todayKey]) state.hours.overrides[today] = { open: '20:00', close: '03:00' };
  return state;
}

function firstFridayOnOrBefore(date) {
  const first = date.slice(0, 8) + '01';
  return addDays(first, (5 - dowOf(first) + 7) % 7);
}

module.exports = { seedState };
