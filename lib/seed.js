'use strict';

const { localNow, serviceDate, addDays, dowOf } = require('./time');

// Demo venue. Dates are worked out from the day the data is created, so the
// demo always has something on today, a full week ahead and an archive.

const SCHEMA = 2;

function nextDow(from, dow) {
  return addDays(from, (dow - dowOf(from) + 7) % 7);
}

function firstFridayOnOrBefore(date) {
  const first = date.slice(0, 8) + '01';
  return addDays(first, (5 - dowOf(first) + 7) % 7);
}

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function event(id, name, blurb, start, repeat, doors, lineup, extra = {}) {
  return {
    id, name, blurb, start, repeat, until: null, doors, lineup, photo: null, skipped: [],
    bookable: false, capacity: null, price: null, publicFrom: null, ...extra
  };
}

function item(id, name, note, price, tags = []) {
  return { id, name, note, price, tags, soldOut: false };
}

function seedState(now = new Date()) {
  const timezone = 'Europe/Madrid';
  const today = serviceDate(localNow(timezone, now));
  const anchor = addDays(today, -56);

  const state = {
    schema: SCHEMA,
    venue: {
      name: 'Marea',
      tagline: 'Coffee by day, food and music by night, by the harbour',
      type: 'restaurant',
      address: 'Calle del Puerto 12, Sant Antoni de Portmany, Ibiza',
      city: 'Sant Antoni de Portmany',
      phone: '+34 600 000 000',
      email: 'hola@marea.example',
      instagram: 'marea.example',
      googleProfileUrl: 'https://business.google.com/',
      timezone,
      look: 'poster',
      accent: null,
      features: { stories: true, circle: true, bookings: true, menu: true }
    },
    hours: {
      weekly: {
        mon: { open: '08:30', close: '17:00' },
        tue: { open: '08:30', close: '00:00' },
        wed: { open: '08:30', close: '00:30' },
        thu: { open: '08:30', close: '00:30' },
        fri: { open: '08:30', close: '03:00' },
        sat: { open: '08:30', close: '03:00' },
        sun: { open: '09:00', close: '23:00' }
      },
      overrides: {}
    },
    events: [
      event('ev-tonight', 'Dune: album release night', 'Dune plays the new record start to finish, then an open-ended set.', today, 'none', '22:00',
        [{ name: 'Kasper', time: '22:00' }, { name: 'Dune', time: '00:30' }], { bookable: true, capacity: 120, price: 15 }),
      event('ev-taco', 'Taco Tuesday', 'Three tacos and a margarita for €18. Walk-ins welcome, tables bookable.', nextDow(anchor, 2), 'weekly', '19:00',
        [], { bookable: true, capacity: 60 }),
      event('ev-jam', 'Wednesday Jam', 'Open decks and live players. Bring a record.', nextDow(anchor, 3), 'weekly', '21:00',
        [{ name: 'Open decks', time: '21:00' }]),
      event('ev-quiz', 'Quiz Night', 'Teams of up to six. Winners drink free.', nextDow(anchor, 4), 'weekly', '20:30',
        [{ name: 'Quizmaster Ana', time: '20:30' }], { bookable: true, capacity: 15 }),
      event('ev-house', 'House Friday', 'Kasper all night long.', nextDow(anchor, 5), 'weekly', '22:00',
        [{ name: 'Kasper', time: '22:00' }]),
      event('ev-sunset', 'Sunset Sessions', 'Lio plays the sun down on the terrace.', nextDow(anchor, 6), 'weekly', '18:00',
        [{ name: 'Lio', time: '18:30' }]),
      event('ev-lunch', 'Sunday Long Lunch', 'Paella, vinyl and no rush.', nextDow(anchor, 0), 'weekly', '13:00',
        [], { bookable: true, capacity: 40, price: 35 }),
      event('ev-guest', 'First Friday Guest', 'A guest DJ from off the island, first Friday of every month.', firstFridayOnOrBefore(anchor), 'monthly', '23:00',
        [{ name: 'Guest DJ', time: '01:00' }]),
      event('ev-supper', 'Supper Club: Ibiza harvest', 'Seven courses from island farms. One long table.', addDays(today, 12), 'none', '20:00',
        [{ name: 'Chef Marta', time: '20:00' }], { bookable: true, capacity: 24, price: 65, publicFrom: new Date(now.getTime() + 36 * 3600 * 1000).toISOString() })
    ],
    menus: [
      {
        id: 'mn-breakfast', name: 'Breakfast', from: '08:30', to: '12:00', days: ALL_DAYS,
        sections: [
          { id: 'sc-b1', name: 'Plates', items: [
            item('i-b1', 'Pan con tomate', 'Ibizan olive oil, sea salt', 5, ['vegan']),
            item('i-b2', 'Eggs any way', 'Sourdough, roast tomato', 9, ['vegetarian']),
            item('i-b3', 'Greek yoghurt bowl', 'Honey, figs, toasted almonds', 8, ['vegetarian', 'gluten free'])
          ] },
          { id: 'sc-b2', name: 'Coffee', items: [
            item('i-b4', 'Café con leche', '', 2.5, ['vegetarian']),
            item('i-b5', 'Flat white', 'Oat milk at no extra cost', 3.5, ['vegetarian'])
          ] }
        ]
      },
      {
        id: 'mn-lunch', name: 'Lunch', from: '12:00', to: '16:00', days: ALL_DAYS,
        sections: [
          { id: 'sc-l1', name: 'Plates', items: [
            item('i-l1', 'Tomato salad', 'Basil, Ibizan olive oil', 11, ['vegan', 'gluten free']),
            item('i-l2', 'Grilled octopus', 'Paprika oil, crushed potato', 19, ['gluten free']),
            item('i-l3', 'Marea burger', 'Mallorcan beef, aged cheese, fries', 16)
          ] }
        ]
      },
      {
        id: 'mn-dinner', name: 'Dinner', from: '19:00', to: '23:00', days: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        sections: [
          { id: 'sc-d1', name: 'To share', items: [
            item('i-d1', 'Padrón peppers', 'Sea salt', 8, ['vegan', 'gluten free']),
            item('i-d2', 'Croquetas', 'Jamón ibérico, six pieces', 10)
          ] },
          { id: 'sc-d2', name: 'Mains', items: [
            item('i-d3', 'Grilled octopus', 'Paprika oil, crushed potato', 22, ['gluten free']),
            item('i-d4', 'Paella for two', 'Sundays from 13:00 too', 42, ['gluten free']),
            item('i-d5', 'Aubergine al horno', 'Miso, tahini, pomegranate', 17, ['vegan'])
          ] },
          { id: 'sc-d3', name: 'Dessert', items: [
            item('i-d6', 'Burnt cheesecake', 'Orange blossom honey', 9, ['vegetarian'])
          ] }
        ]
      },
      {
        id: 'mn-late', name: 'Late bites', from: '23:00', to: '02:00', days: ['fri', 'sat'],
        sections: [
          { id: 'sc-n1', name: 'Late', items: [
            item('i-n1', 'Bocadillo de calamares', 'Aioli', 9),
            item('i-n2', 'Patatas bravas', 'Smoked paprika sauce', 7, ['vegetarian'])
          ] }
        ]
      },
      {
        id: 'mn-drinks', name: 'Drinks', from: '08:30', to: '03:00', days: ALL_DAYS, allDay: true,
        sections: [
          { id: 'sc-x1', name: 'Cocktails', items: [
            item('i-x1', 'Marea spritz', 'Bitter orange, cava', 12, ['vegan']),
            item('i-x2', 'Hierbas sour', 'Hierbas ibicencas, lemon', 11)
          ] },
          { id: 'sc-x2', name: 'Beer and wine', items: [
            item('i-x3', 'Estrella, draught', '33cl', 5, ['vegan']),
            item('i-x4', 'Ibizan white, glass', 'Ask for today’s bottle', 7, ['vegan'])
          ] }
        ]
      }
    ],
    stories: [
      { id: 'st-1', photo: null, caption: 'Soundcheck done. Dune is on at 00:30 tonight.', eventKey: `ev-tonight@${today}`, circleOnly: false, at: new Date(now.getTime() - 2 * 3600 * 1000).toISOString() },
      { id: 'st-2', photo: null, caption: 'Fresh octopus in from the harbour. On the lunch menu until it runs out.', eventKey: null, circleOnly: false, at: new Date(now.getTime() - 5 * 3600 * 1000).toISOString() },
      { id: 'st-3', photo: null, caption: 'Circle first: Supper Club tickets are open to members before anyone else.', eventKey: null, circleOnly: true, at: new Date(now.getTime() - 1 * 3600 * 1000).toISOString() }
    ],
    ledger: {}
  };

  // Sample takings and costs for past dates, so the stats have something to show.
  const samples = [
    ['ev-house', 5, 5200, 1200, 300, 900], ['ev-taco', 2, 2100, 0, 120, 500], ['ev-quiz', 4, 1800, 80, 60, 300],
    ['ev-sunset', 6, 4100, 600, 200, 700], ['ev-lunch', 0, 2900, 0, 100, 600], ['ev-jam', 3, 1500, 0, 50, 400]
  ];
  for (const [id, dow, revenue, talent, marketing, other] of samples) {
    for (let w = 1; w <= 3; w++) {
      const date = nextDow(addDays(today, -7 * w), dow);
      const jitter = 1 + ((w * 7 + dow) % 5 - 2) / 20;
      state.ledger[`${id}@${date}`] = { revenue: Math.round(revenue * jitter), talent, marketing, other, effort: 6 + (dow % 3) * 2 };
    }
  }

  // The demo has something on today, so make sure the venue is open.
  const todayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dowOf(today)];
  const slot = state.hours.weekly[todayKey];
  if (!slot || slot.close !== '03:00') state.hours.overrides[today] = { open: slot ? slot.open : '08:30', close: '03:00' };
  return state;
}

// Rows for the separate tables, so the inbox and stats look alive.
function seedRows(state, now = new Date()) {
  const today = serviceDate(localNow(state.venue.timezone, now));
  const sources = ['instagram', 'instagram', 'google', 'direct', 'circle', 'instagram', 'google', 'facebook', 'circle', 'print'];
  const names = ['Ana', 'Lucas', 'Sofia', 'Marc', 'Elena', 'Tom', 'Julia', 'Pau', 'Nina', 'Oscar', 'Laura', 'Dani'];
  const iso = (daysAgo, h = 12) => new Date(now.getTime() - daysAgo * 86400000 - h * 3600000).toISOString();
  const members = names.map((n, i) => ({ name: n, email: `${n.toLowerCase()}@example.com`, source: sources[i % sources.length], created_at: iso(28 - i * 2) }));
  const bookings = [
    { event_key: `ev-tonight@${today}`, event_name: 'Dune: album release night', date: today, name: 'Ana', contact: 'ana@example.com', guests: 4, source: 'instagram', created_at: iso(1) },
    { event_key: `ev-tonight@${today}`, event_name: 'Dune: album release night', date: today, name: 'Marc', contact: '+34 611 222 333', guests: 2, source: 'circle', created_at: iso(2) },
    { event_key: `ev-tonight@${today}`, event_name: 'Dune: album release night', date: today, name: 'Julia', contact: 'julia@example.com', guests: 6, source: 'google', created_at: iso(0, 3) }
  ];
  const quiz = nextDow(addDays(today, 1), 4);
  bookings.push({ event_key: `ev-quiz@${quiz}`, event_name: 'Quiz Night', date: quiz, name: 'Pau', contact: 'pau@example.com', guests: 5, source: 'instagram', created_at: iso(0, 5) });
  const views = [];
  for (let d = 0; d < 21; d++) {
    const day = addDays(today, -d);
    for (const [src, n] of [['direct', 30], ['instagram', 45], ['google', 38], ['circle', 12], ['facebook', 6]]) {
      views.push({ day, source: src, count: Math.round(n * (1 + ((d * 3 + src.length) % 7 - 3) / 10)) });
    }
  }
  const enquiries = [
    { name: 'Carla', contact: 'carla@example.com', date: addDays(today, 9), guests: 30, type: 'private', message: 'Birthday dinner, terrace if possible.', source: 'google', created_at: iso(0, 6) }
  ];
  return { members, bookings, views, enquiries };
}

module.exports = { seedState, seedRows, SCHEMA };
