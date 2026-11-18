'use strict';

// The system is built from modules. A use case is a preset: which modules are on
// and the order the home page shows them. The look (style) is separate, so
// any use case can wear any look.

// Every module a physical venue might need. "core" ones are always on:
// a guest always needs to know when you're open, where you are and how to reach you.
const MODULES = {
  hours: { label: 'Hours and open now', core: true, about: 'Opening times, today’s status, one-day closures' },
  visit: { label: 'Directions and contact', core: true, about: 'Address, map, call, WhatsApp, email' },
  about: { label: 'About', about: 'A short story of the place and a photo' },
  gallery: { label: 'Gallery', about: 'Photos of the space, the food, the nights' },
  info: { label: 'Good to know', about: 'Parking, accessibility, dogs, wifi, kids, payment, dress code' },
  menu: { label: 'Menus', about: 'Menus by time of day, diet tags, sold out' },
  offers: { label: 'Offers', about: 'Happy hour, set lunch, deals that show when they’re on' },
  events: { label: 'Events', about: 'One-off and repeating events with an archive' },
  bookings: { label: 'Event bookings', about: 'Places and price per event, capacity checked' },
  tables: { label: 'Table requests', about: 'Table and group requests into the inbox' },
  hire: { label: 'Private hire', about: 'Spaces and capacity for private events, with an enquiry form' },
  preorder: { label: 'Pre-orders', about: 'Order ahead for set days: weekend bakes to collect, a Sunday roast to eat in or take away' },
  order: { label: 'Delivery and voucher links', about: 'Links to delivery apps and gift vouchers' },
  stories: { label: 'Stories', about: '24-hour stories on the site that become the event archive' },
  circle: { label: 'The Circle', about: 'Your own audience: members hear and book first' },
  reviews: { label: 'Reviews', about: 'Send guests to leave a review on Google or TripAdvisor' }
};

// Home page sections. Each maps to the module that must be on for it to show.
const SECTIONS = {
  hero: { label: 'Top banner', module: null },
  stories: { label: 'Stories', module: 'stories' },
  events: { label: 'Coming up', module: 'events' },
  menu: { label: 'Serving now', module: 'menu' },
  offers: { label: 'Offers', module: 'offers' },
  about: { label: 'About', module: 'about' },
  gallery: { label: 'Gallery', module: 'gallery' },
  hire: { label: 'Private hire', module: 'hire' },
  preorder: { label: 'Pre-order', module: 'preorder' },
  order: { label: 'Delivery and vouchers', module: 'order' },
  circle: { label: 'Join the Circle', module: 'circle' },
  reviews: { label: 'Reviews', module: 'reviews' },
  visit: { label: 'Visit: hours and directions', module: 'visit' },
  info: { label: 'Good to know', module: 'info' }
};

const on = (...keys) => Object.fromEntries(Object.keys(MODULES).map((k) => [k, MODULES[k].core || keys.includes(k)]));

const PRESETS = {
  cafe: {
    label: 'Café',
    pitch: 'Menu, opening hours and directions first, pre-orders for the bakes, a bit of story and photos.',
    modules: on('about', 'gallery', 'info', 'menu', 'offers', 'preorder', 'order', 'reviews'),
    home: ['hero', 'menu', 'preorder', 'offers', 'about', 'gallery', 'visit', 'order', 'info', 'reviews'],
    hero: 'place',
    words: { event: 'Event', events: 'Events', lineup: 'With', whatsOn: "What's on" }
  },
  restaurant: {
    label: 'Restaurant with theme nights',
    pitch: 'Menus and table requests lead; a pre-order Sunday roast, theme nights, private hire and the Circle fill tables.',
    modules: on('about', 'gallery', 'info', 'menu', 'offers', 'events', 'bookings', 'tables', 'preorder', 'hire', 'circle', 'reviews'),
    home: ['hero', 'menu', 'preorder', 'events', 'offers', 'about', 'gallery', 'hire', 'circle', 'visit', 'info', 'reviews'],
    hero: 'event',
    words: { event: 'Theme night', events: 'Theme nights', lineup: 'Hosted by', whatsOn: "What's on" }
  },
  bar: {
    label: 'Bar that hosts events',
    pitch: 'Events lead, with bookings, stories and the Circle; the drinks menu sits underneath.',
    modules: on('about', 'gallery', 'info', 'menu', 'offers', 'events', 'bookings', 'tables', 'hire', 'stories', 'circle', 'reviews'),
    home: ['stories', 'hero', 'events', 'offers', 'menu', 'circle', 'gallery', 'hire', 'visit', 'info'],
    hero: 'event',
    words: { event: 'Event', events: 'Events', lineup: 'Line-up', whatsOn: "What's on" }
  },
  beach: {
    label: 'Beach club or day venue',
    pitch: 'Daybeds and tables, the menu, sunset sessions and photos of the place.',
    modules: on('about', 'gallery', 'info', 'menu', 'offers', 'events', 'bookings', 'tables', 'hire', 'stories', 'circle', 'reviews'),
    home: ['hero', 'gallery', 'events', 'menu', 'offers', 'about', 'hire', 'circle', 'visit', 'info'],
    hero: 'place',
    words: { event: 'Session', events: 'Sessions', lineup: 'Playing', whatsOn: "What's on" }
  }
};

function preset(venue) { return PRESETS[venue.type] || PRESETS.bar; }

// Sections that will actually show, in order, given the modules switched on.
function homeSections(venue) {
  const order = (venue.home && venue.home.length ? venue.home : preset(venue).home).slice();
  // A module switched on later still gets its section, at the end until moved.
  for (const k of Object.keys(SECTIONS)) if (!order.includes(k)) order.push(k);
  return order.filter((s) => SECTIONS[s] && (!SECTIONS[s].module || venue.modules[SECTIONS[s].module]));
}

module.exports = { MODULES, SECTIONS, PRESETS, preset, homeSections };
