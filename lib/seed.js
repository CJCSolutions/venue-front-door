'use strict';

const { localNow, serviceDate, addDays, dowOf } = require('./time');
const { PRESETS } = require('./presets');
const { openDates } = require('./orders');

// Demo venue. Dates are worked out from the day the data is created, so the
// demo always has something on today, a full week ahead and an archive.

const SCHEMA = 6;

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
      modules: { ...PRESETS.restaurant.modules },
      home: null
    },
    about: {
      title: 'A harbour bar that never quite closes',
      text: 'Marea started as a coffee hatch for the fishing boats in 2016. Now it is breakfast in the sun, long lunches, and music after dark, still run by the same family. Everything we cook comes from the island when it can.',
      photo: null
    },
    gallery: [
      { id: 'g1', photo: null, caption: 'The terrace at sunset' },
      { id: 'g2', photo: null, caption: 'Breakfast on the harbour wall' },
      { id: 'g3', photo: null, caption: 'Octopus, straight off the boat' },
      { id: 'g4', photo: null, caption: 'House Friday' },
      { id: 'g5', photo: null, caption: 'The bar after midnight' },
      { id: 'g6', photo: null, caption: 'Sunday long lunch' }
    ],
    info: [
      { q: 'Parking', a: 'Public car park on Passeig de la Mar, two minutes on foot. Taxis stop outside.' },
      { q: 'Accessibility', a: 'Step-free entrance and an accessible toilet. Terrace is level.' },
      { q: 'Dogs', a: 'Welcome on the terrace, water bowls at the bar.' },
      { q: 'Kids', a: 'Welcome until 22:00. High chairs and a short kids’ menu.' },
      { q: 'Wifi', a: 'Free. Ask for the password at the bar.' },
      { q: 'Payment', a: 'Cards and cash. Groups of 8 or more get one bill.' },
      { q: 'Dress code', a: 'Relaxed by day. No swimwear after 20:00.' }
    ],
    offers: [
      { id: 'of1', name: 'Menú del día', detail: 'Three courses, bread and a drink for €16.', days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '13:00', to: '16:00' },
      { id: 'of2', name: 'Spritz hour', detail: 'Two Marea spritzes for €15.', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '18:00', to: '20:00' },
      { id: 'of3', name: 'Coffee and a pastry', detail: '€4 before 10:30.', days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:30', to: '10:30' }
    ],
    links: {
      whatsapp: '+34600000000',
      googleReview: 'https://www.google.com/maps',
      tripadvisor: 'https://www.tripadvisor.com/',
      order: [{ label: 'Takeaway on Glovo', url: 'https://glovoapp.com/' }, { label: 'Gift vouchers', url: 'https://example.com/vouchers' }]
    },
    tableBooking: { mode: 'auto', times: ['13:00', '13:30', '14:00', '14:30', '20:00', '20:30', '21:00', '21:30', '22:00'], covers: 24, maxParty: 8, notice: 60, daysAhead: 30 },
    collect: { open: true, from: '12:30', to: '22:30', every: 15, notice: 30 },
    alerts: { email: '' },
    hire: {
      text: 'Birthdays, launches, weddings after-parties and team dinners. Take the terrace, the back room or the whole place.',
      spaces: [{ name: 'Back room', capacity: 30 }, { name: 'Terrace', capacity: 80 }, { name: 'Whole venue', capacity: 180 }]
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
      event('ev-tonight', 'Dune, with Kasper', 'Kasper warms up from 22:00, Dune plays from 00:30 until close.', today, 'none', '22:00',
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
    preorders: [{
      id: 'po-roast', name: 'Sunday roast', open: true,
      blurb: 'Slow-roasted, with crispy potatoes, seasonal greens, Yorkshire pudding and proper gravy. Order by Saturday night so we cook enough.',
      days: ['sun'], from: '13:00', to: '16:00', every: 30, cutoffDays: 1, cutoffTime: '20:00', modes: ['sitin', 'takeaway'],
      items: [
        { id: 'pr-beef', name: 'Roast beef', note: 'Pink, with horseradish', price: 24, limit: 30, soldOut: false },
        { id: 'pr-chicken', name: 'Roast chicken', note: 'Half a free-range bird', price: 21, limit: 30, soldOut: false },
        { id: 'pr-nut', name: 'Nut roast', note: 'Vegan gravy on request', price: 19, limit: 12, soldOut: false },
        { id: 'pr-kids', name: 'Kids roast', note: 'Under 12', price: 11, limit: null, soldOut: false },
        { id: 'pr-pud', name: 'Sticky toffee pudding', note: 'With vanilla ice cream', price: 7, limit: 40, soldOut: false }
      ]
    }],
    storyThemes: ['Tonight', 'From the kitchen', 'Behind the bar', 'Last weekend', 'Circle only'],
    stories: [
      { id: 'st-1', theme: 'Tonight', photo: null, caption: 'Soundcheck done. Dune is on at 00:30 tonight.', eventKey: `ev-tonight@${today}`, circleOnly: false, at: new Date(now.getTime() - 2 * 3600 * 1000).toISOString() },
      { id: 'st-2', theme: 'Tonight', photo: null, caption: 'Terrace is open. Come early for the sunset.', eventKey: `ev-tonight@${today}`, circleOnly: false, at: new Date(now.getTime() - 1 * 3600 * 1000).toISOString() },
      { id: 'st-3', theme: 'From the kitchen', photo: null, caption: 'Fresh octopus in from the harbour. On the lunch menu until it runs out.', eventKey: null, circleOnly: false, at: new Date(now.getTime() - 5 * 3600 * 1000).toISOString() },
      { id: 'st-4', theme: 'From the kitchen', photo: null, caption: 'Burnt cheesecake, fresh out of the oven.', eventKey: null, circleOnly: false, at: new Date(now.getTime() - 30 * 3600 * 1000).toISOString() },
      { id: 'st-5', theme: 'Behind the bar', photo: null, caption: 'New on the list: the hierbas sour.', eventKey: null, circleOnly: false, at: new Date(now.getTime() - 50 * 3600 * 1000).toISOString() },
      { id: 'st-6', theme: 'Last weekend', photo: null, caption: 'House Friday. Full room until close.', eventKey: null, circleOnly: false, at: new Date(now.getTime() - 100 * 3600 * 1000).toISOString() },
      { id: 'st-7', theme: 'Last weekend', photo: null, caption: 'Sunset Sessions with Lio.', eventKey: null, circleOnly: false, at: new Date(now.getTime() - 80 * 3600 * 1000).toISOString() },
      { id: 'st-8', theme: 'Circle only', photo: null, caption: 'Circle first: Supper Club tickets are open to members before anyone else.', eventKey: null, circleOnly: true, at: new Date(now.getTime() - 1 * 3600 * 1000).toISOString() }
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
    { event_key: `ev-tonight@${today}`, event_name: 'Dune, with Kasper', date: today, name: 'Ana', contact: 'ana@example.com', guests: 4, source: 'instagram', created_at: iso(1) },
    { event_key: `ev-tonight@${today}`, event_name: 'Dune, with Kasper', date: today, name: 'Marc', contact: '+34 611 222 333', guests: 2, source: 'circle', created_at: iso(2) },
    { event_key: `ev-tonight@${today}`, event_name: 'Dune, with Kasper', date: today, name: 'Julia', contact: 'julia@example.com', guests: 6, source: 'google', created_at: iso(0, 3) }
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
  // Orders for the next Sunday roast, so the kitchen list has something on it.
  const roast = (state.preorders || [])[0];
  const next = roast ? openDates(roast, state.venue.timezone, now, 1)[0] : null;
  const orders = [];
  if (next) {
    const line = (id, qty) => { const it = roast.items.find((x) => x.id === id); return { id, name: it.name, qty, price: it.price }; };
    const add = (name, contact, slot, mode, items, source, h) => orders.push({ preorder_id: roast.id, preorder_name: roast.name, date: next.date, slot, mode, name, contact, items, total: items.reduce((t, i) => t + i.qty * i.price, 0), source, created_at: iso(0, h) });
    add('Elena', 'elena@example.com', '13:00', 'sitin', [line('pr-beef', 2), line('pr-kids', 2), line('pr-pud', 2)], 'instagram', 20);
    add('Tom', '+34 622 111 000', '13:30', 'takeaway', [line('pr-chicken', 4)], 'google', 14);
    add('Nina', 'nina@example.com', '14:00', 'sitin', [line('pr-beef', 3), line('pr-nut', 1), line('pr-pud', 4)], 'circle', 9);
    add('Oscar', '+34 633 444 555', '15:00', 'takeaway', [line('pr-beef', 1), line('pr-chicken', 1)], 'whatsapp', 3);
  }
  return { members, bookings, views, enquiries, orders };
}

module.exports = { seedState, seedRows, SCHEMA };
