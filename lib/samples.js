'use strict';

// Demo only. Four sample venues show how the same system fits different
// kinds of places. The restaurant (Marea) is the saved, editable venue; the
// café, bar and beach club are laid over it when a visitor picks them.

const { localNow, serviceDate, addDays, dowOf } = require('./time');
const { PRESETS } = require('./presets');

const ALL = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const nextDow = (from, dow) => addDays(from, (dow - dowOf(from) + 7) % 7);
const item = (id, name, note, price, tags = []) => ({ id, name, note, price, tags, soldOut: false });
const ev = (id, name, blurb, start, repeat, doors, lineup, extra = {}) => ({ id, name, blurb, start, repeat, until: null, doors, lineup, photo: null, skipped: [], bookable: false, capacity: null, price: null, publicFrom: null, ...extra });

const SAMPLES = {
  cafe: { name: 'Sol', kind: 'Café', look: 'gallery' },
  restaurant: { name: 'Marea', kind: 'Restaurant', look: 'poster' },
  bar: { name: 'Lunar', kind: 'Bar and events', look: 'dark' },
  beach: { name: 'Cala Blanca', kind: 'Beach club', look: 'beach' }
};

function overlay(base, key, now = new Date()) {
  if (key === 'restaurant' || !SAMPLES[key]) return base;
  const tz = base.venue.timezone;
  const today = serviceDate(localNow(tz, now));
  const anchor = addDays(today, -56);
  const ago = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const s = JSON.parse(JSON.stringify(base));
  s.venue = { ...s.venue, type: key, modules: { ...PRESETS[key].modules }, home: null, accent: null, look: SAMPLES[key].look };
  s.ledger = {};

  if (key === 'cafe') {
    Object.assign(s.venue, { name: 'Sol', tagline: 'Coffee, brunch and slow afternoons in Santa Eulària', address: 'Carrer de Sant Jaume 8, Santa Eulària des Riu, Ibiza', city: 'Santa Eulària des Riu', instagram: 'sol.cafe.example', accent: '#3d6b4f' });
    s.hours.weekly = { mon: { open: '08:00', close: '17:00' }, tue: { open: '08:00', close: '17:00' }, wed: { open: '08:00', close: '17:00' }, thu: { open: '08:00', close: '17:00' }, fri: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '18:00' }, sun: { open: '09:00', close: '15:00' } };
    s.hours.overrides = {};
    s.about = { title: 'Good coffee, nothing rushed', text: 'Sol is a small café on Sant Jaume. We roast with a friend in Sant Joan, bake every morning and keep the menu short so everything is fresh. Laptops welcome before noon.', photo: null };
    s.gallery = [['The window seat'], ['Cinnamon buns, 8am'], ['Flat white, oat'], ['The courtyard'], ['Saturday brunch'], ['Our roaster in Sant Joan']].map(([c], i) => ({ id: `sg${i}`, photo: null, caption: c }));
    s.menus = [
      { id: 'sm-bf', name: 'Breakfast', from: '08:00', to: '12:00', days: ALL, sections: [{ id: 'ss1', name: 'Plates', items: [item('si1', 'Avocado toast', 'Sourdough, chilli, lime', 9, ['vegan']), item('si2', 'Granola bowl', 'Yoghurt, honey, figs', 7, ['vegetarian']), item('si3', 'Eggs on toast', 'Poached or scrambled', 8, ['vegetarian'])] }] },
      { id: 'sm-br', name: 'Weekend brunch', from: '09:30', to: '14:30', days: ['sat', 'sun'], sections: [{ id: 'ss2', name: 'Brunch', items: [item('si4', 'Shakshuka', 'Baked eggs, feta, flatbread', 12, ['vegetarian']), item('si5', 'Pancake stack', 'Berries, maple', 10, ['vegetarian']), item('si6', 'Bloody Mary', '', 8, ['vegan'])] }] },
      { id: 'sm-lu', name: 'Lunch', from: '12:00', to: '16:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'], sections: [{ id: 'ss3', name: 'Lunch', items: [item('si7', 'Soup of the day', 'With bread', 7, ['vegan']), item('si8', 'Toasted focaccia', 'Mozzarella, tomato, pesto', 9, ['vegetarian']), item('si9', 'Salad bowl', 'Grains, roast veg, tahini', 11, ['vegan', 'gluten free'])] }] },
      { id: 'sm-co', name: 'Coffee and cakes', from: '08:00', to: '18:00', days: ALL, allDay: true, sections: [{ id: 'ss4', name: 'Coffee', items: [item('si10', 'Espresso', '', 1.8, ['vegan']), item('si11', 'Flat white', 'Oat at no extra cost', 3.2, ['vegetarian']), item('si12', 'Iced latte', '', 3.8, ['vegetarian'])] }, { id: 'ss5', name: 'Cakes', items: [item('si13', 'Cinnamon bun', '', 3.5, ['vegetarian']), item('si14', 'Carrot cake', '', 4.5, ['vegetarian']), item('si15', 'Almond cake', 'Ibizan almonds', 4.5, ['vegetarian', 'gluten free'])] }] }
    ];
    s.offers = [
      { id: 'so1', name: 'Early bird', detail: 'Coffee and a pastry for €4 before 9:30.', days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '09:30' },
      { id: 'so2', name: 'Lunch deal', detail: 'Soup or salad with a drink for €12.', days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '12:00', to: '15:00' }
    ];
    s.events = [];
    s.links = { ...s.links, order: [{ label: 'Order ahead for pick-up', url: 'https://example.com/order' }, { label: 'Buy our beans', url: 'https://example.com/beans' }] };
    s.storyThemes = ['From the oven', 'This week'];
    s.stories = [
      { id: 'cs1', theme: 'From the oven', photo: null, caption: 'Cinnamon buns are out.', eventKey: null, circleOnly: false, at: ago(2) },
      { id: 'cs2', theme: 'This week', photo: null, caption: 'New beans from Sant Joan: Ethiopia, washed.', eventKey: null, circleOnly: false, at: ago(30) }
    ];
  }

  if (key === 'bar') {
    Object.assign(s.venue, { name: 'Lunar', tagline: 'Cocktails, DJs and late nights in Ibiza Town', address: 'Carrer de la Verge 21, Eivissa, Ibiza', city: 'Eivissa', instagram: 'lunar.bar.example' });
    s.hours.weekly = { mon: null, tue: null, wed: { open: '19:00', close: '02:00' }, thu: { open: '19:00', close: '02:00' }, fri: { open: '19:00', close: '04:00' }, sat: { open: '19:00', close: '04:00' }, sun: { open: '18:00', close: '00:00' } };
    s.hours.overrides = { [today]: { open: '19:00', close: '04:00' } };
    s.about = { title: 'A small bar with a big sound system', text: 'Lunar opened in an old fisherman’s store in 2019. Forty people inside, sixty on the street, and the best soundsystem in the old town. Local DJs most nights, guests once a month.', photo: null };
    s.gallery = [['The booth'], ['Friday, 1am'], ['The negroni'], ['The street outside'], ['Guest night'], ['Last song']].map(([c], i) => ({ id: `bg${i}`, photo: null, caption: c }));
    s.menus = [
      { id: 'bm-c', name: 'Cocktails', from: '19:00', to: '04:00', days: ALL, allDay: true, sections: [{ id: 'bs1', name: 'House', items: [item('bi1', 'Lunar negroni', 'Gin, bitter, vermouth, orange', 11, ['vegan']), item('bi2', 'Hierbas sour', 'Hierbas ibicencas, lemon', 10), item('bi3', 'Smoked paloma', 'Mezcal, grapefruit', 11, ['vegan'])] }, { id: 'bs2', name: 'Beer and wine', items: [item('bi4', 'Draught lager', '33cl', 5, ['vegan']), item('bi5', 'Natural white', 'By the glass', 7, ['vegan'])] }] },
      { id: 'bm-n', name: 'Late bites', from: '21:00', to: '02:00', days: ['wed', 'thu', 'fri', 'sat'], sections: [{ id: 'bs3', name: 'Bites', items: [item('bi6', 'Croquetas', 'Jamón, six pieces', 8), item('bi7', 'Patatas bravas', '', 6, ['vegetarian'])] }] }
    ];
    s.offers = [{ id: 'bo1', name: 'Early doors', detail: 'House cocktails €8 until 21:00.', days: ['wed', 'thu', 'fri', 'sat', 'sun'], from: '19:00', to: '21:00' }];
    s.events = [
      ev('lv-tonight', 'Dune, with Kasper', 'Kasper warms up from 22:00, Dune plays from 00:30 until close.', today, 'none', '22:00', [{ name: 'Kasper', time: '22:00' }, { name: 'Dune', time: '00:30' }], { bookable: true, capacity: 60, price: 15 }),
      ev('lv-jam', 'Wednesday Jam', 'Open decks. Bring a record.', nextDow(anchor, 3), 'weekly', '21:00', [{ name: 'Open decks', time: '21:00' }]),
      ev('lv-quiz', 'Music Quiz', 'Name that track. Teams of up to five.', nextDow(anchor, 4), 'weekly', '21:00', [], { bookable: true, capacity: 12 }),
      ev('lv-house', 'House Friday', 'Kasper all night long.', nextDow(anchor, 5), 'weekly', '22:00', [{ name: 'Kasper', time: '22:00' }]),
      ev('lv-disco', 'Disco Saturday', 'Edits, classics and a full street.', nextDow(anchor, 6), 'weekly', '22:00', [{ name: 'Nuria', time: '22:00' }]),
      ev('lv-guest', 'First Friday Guest', 'A guest DJ from off the island.', nextDow(anchor, 5), 'monthly', '23:00', [{ name: 'Guest DJ', time: '01:00' }])
    ];
    s.hire = { text: 'Take over Lunar for a birthday, launch or after-party. Own DJ welcome.', spaces: [{ name: 'Whole bar', capacity: 100 }] };
    s.storyThemes = ['Tonight', 'Last weekend', 'Behind the bar', 'Circle only'];
    s.stories = [
      { id: 'bs-1', theme: 'Tonight', photo: null, caption: 'Soundcheck done. Dune is on at 00:30.', eventKey: `lv-tonight@${today}`, circleOnly: false, at: ago(2) },
      { id: 'bs-2', theme: 'Last weekend', photo: null, caption: 'Disco Saturday. Street full until 4.', eventKey: null, circleOnly: false, at: ago(70) },
      { id: 'bs-3', theme: 'Behind the bar', photo: null, caption: 'New: the smoked paloma.', eventKey: null, circleOnly: false, at: ago(20) },
      { id: 'bs-4', theme: 'Circle only', photo: null, caption: 'Next month’s guest DJ, before anyone else.', eventKey: null, circleOnly: true, at: ago(3) }
    ];
  }

  if (key === 'beach') {
    Object.assign(s.venue, { name: 'Cala Blanca', tagline: 'Daybeds, seafood and sunset sessions on the west coast', address: 'Cala Blanca beach, Sant Josep de sa Talaia, Ibiza', city: 'Sant Josep de sa Talaia', instagram: 'calablanca.example' });
    s.hours.weekly = Object.fromEntries(ALL.map((d) => [d, { open: '10:00', close: d === 'sat' || d === 'fri' ? '01:00' : '22:00' }]));
    s.hours.overrides = {};
    s.about = { title: 'Barefoot from ten until the sun goes down', text: 'Cala Blanca sits on its own small cove. Daybeds on the sand, grilled fish from the boats that morning, and a DJ on the deck every evening as the sun sets over the water.', photo: null };
    s.gallery = [['The cove at 11am'], ['Daybeds, front row'], ['Grilled red prawns'], ['Sunset from the deck'], ['Sunday session'], ['The boat drop-off']].map(([c], i) => ({ id: `cg${i}`, photo: null, caption: c }));
    s.menus = [
      { id: 'cm-l', name: 'Beach menu', from: '12:00', to: '17:00', days: ALL, sections: [{ id: 'cs1', name: 'From the grill', items: [item('ci1', 'Red prawns', 'Sea salt, lemon', 28, ['gluten free']), item('ci2', 'Catch of the day', 'Per 100g, ask the team', 9, ['gluten free']), item('ci3', 'Grilled vegetables', 'Romesco', 14, ['vegan', 'gluten free'])] }, { id: 'cs2', name: 'Rice', items: [item('ci4', 'Seafood paella', 'For two', 64, ['gluten free'])] }] },
      { id: 'cm-s', name: 'Sunset', from: '17:00', to: '22:00', days: ALL, sections: [{ id: 'cs3', name: 'To share', items: [item('ci5', 'Oysters', 'Six', 21, ['gluten free']), item('ci6', 'Tuna tartare', 'Avocado, sesame', 19)] }] },
      { id: 'cm-d', name: 'Drinks', from: '10:00', to: '01:00', days: ALL, allDay: true, sections: [{ id: 'cs4', name: 'Drinks', items: [item('ci7', 'Rosé, bottle', 'Provence', 45, ['vegan']), item('ci8', 'Cala spritz', '', 13, ['vegan']), item('ci9', 'Fresh coconut', '', 8, ['vegan'])] }] }
    ];
    s.offers = [{ id: 'co1', name: 'Morning daybed', detail: 'Daybed and two coffees for €40 before 12:00.', days: ['mon', 'tue', 'wed', 'thu'], from: '10:00', to: '12:00' }];
    s.events = [
      ev('cv-daybed', 'Daybeds', 'Front-row daybeds on the sand. Booking holds yours until 12:00.', nextDow(anchor, 0), 'weekly', '10:00', [], { bookable: true, capacity: 30, price: 60 }),
      ev('cv-daybed2', 'Daybeds', 'Front-row daybeds on the sand. Booking holds yours until 12:00.', nextDow(anchor, 6), 'weekly', '10:00', [], { bookable: true, capacity: 30, price: 60 }),
      ev('cv-sunset', 'Sunset Session', 'A DJ on the deck as the sun goes down.', today, 'none', '18:30', [{ name: 'Lio', time: '18:30' }]),
      ev('cv-fri', 'Sunset Session', 'A DJ on the deck as the sun goes down.', nextDow(anchor, 5), 'weekly', '18:30', [{ name: 'Lio', time: '18:30' }]),
      ev('cv-moon', 'Full Moon Night', 'Fire, drums and a late dinner on the sand.', addDays(today, 9), 'none', '20:00', [{ name: 'Tambores de Sa Talaia', time: '21:00' }], { bookable: true, capacity: 80, price: 45 })
    ];
    s.hire = { text: 'Weddings, birthdays and company days on our own cove.', spaces: [{ name: 'Deck', capacity: 60 }, { name: 'Whole beach club', capacity: 250 }] };
    s.storyThemes = ['Today on the beach', 'Sunsets', 'From the grill'];
    s.stories = [
      { id: 'cs-1', theme: 'Today on the beach', photo: null, caption: 'Flat sea, 26°. Three daybeds left.', eventKey: null, circleOnly: false, at: ago(1) },
      { id: 'cs-2', theme: 'Sunsets', photo: null, caption: 'Last night from the deck.', eventKey: null, circleOnly: false, at: ago(15) },
      { id: 'cs-3', theme: 'From the grill', photo: null, caption: 'Red prawns, straight off the boat.', eventKey: null, circleOnly: false, at: ago(4) }
    ];
  }
  return s;
}

module.exports = { SAMPLES, overlay };
