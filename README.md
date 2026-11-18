# Venue Front Door

**The problem:** a venue changes something (tonight's DJ, a price, a sold-out dish, the hours) and it has to be updated in many places: the website, the QR menu, Google, Instagram, Facebook. Most venues don't keep up, so their website is stale and guests get wrong information.

It solves five problems in one system: menus that update in seconds, events posted once, exposure on every channel, a community the venue owns, and knowing what works (engagement by channel, marketing effort and spend against takings).

**What this does:** the venue changes it once, on a phone. The website updates by itself, live, for anyone already looking at it. The QR menu and the search data (schema.org) update too. For the social channels it makes a ready post (image plus caption in English and Spanish) that the venue shares from its own phone in one tap. Nothing is linked to anyone else's Meta or Google account.

It is built from **modules**, bundled into **use cases**, and dressed in a **style**:

- **Core modules, always on:** hours and open-now status, directions and contact.
- **Optional modules:** About, Gallery, Good to know (parking, accessibility, dogs, wifi, kids, payment, dress code), Menus, Offers (happy hour, set lunch), Events, Event bookings, Table requests, Private hire, Order online (delivery, takeaway, vouchers), Stories, the Circle, Reviews.
- **Use cases:** Café, Restaurant with theme nights, Bar that hosts events, Beach club or day venue. Each switches on a set of modules and orders the home page; the venue can then turn any module on or off and reorder the home page.
- **Styles:** Poster wall, Gallery, Beach club, After dark, plus a brand colour. Any use case can wear any style.

The design and page structure are fixed. The venue only edits facts, so it can't break the site. The look is one setting (Poster wall, Gallery, Beach club or After dark) plus a brand colour, and features can be switched on or off: stories, the Circle, bookings, menus.

## What's in it

| Part | What it does |
|---|---|
| Public site | Home (today or next up, stories, what's being served now), What's on with an archive, menus with diet filters, a page per event with booking, table and private-hire requests, the Circle |
| Menu builder | As many menus as needed (breakfast, lunch, dinner, late, drinks), each with its own times and days. The site shows what is being served now and switches by itself, including menus that run past midnight. Sections, dishes, prices, diet tags, sold out, reordering |
| Event bookings | Any event can take bookings with a number of places and a price per guest (paid on the day). Capacity is checked so the last place can't be sold twice |
| Stories | Grouped in themes, like highlights (Tonight, From the kitchen, Last weekend). A theme shows a fresh ring when something new is posted. Stories linked to an event also stay on its page. Can be Circle-only, and shared to Instagram from the editor |
| The Circle | The venue's own audience list. Guests join with name, email and consent; members see new events (Circle-first, 24 or 48 hours early) and Circle-only stories. Members download as CSV |
| Stats | Visits per day and where they came from, bookings by source, Circle growth, and per-event takings, costs, profit, profit per hour and return per euro of marketing |
| Live updates | Open pages check for a new version every 15 seconds and swap in fresh content |
| Event logic | Works out today from the date. A day runs until 06:00, so a 03:00 set still counts as that night. Repeating events (weekly, monthly) make a dated copy each time; one date can be cancelled without touching the rest. Past events move to the archive automatically |
| Open status | "Open now · until 03:00", "Opens today at 18:00" or "Closed today", including closing after midnight and one-day closures |
| Editor (`/admin`) | Phone-first: Today, Events, Menu, Inbox, Circle, Stats, More. Every save says which touchpoints it reached |
| Share kit | Post (4:5) and story (9:16) images drawn in the venue's look and colour, captions in English and Spanish per channel (Instagram, Google, Facebook, WhatsApp) with tagged links (`?src=instagram`) so Stats knows what worked |
| Inbox | Event bookings per date with arrived / no-show / cancelled, and table or hire requests, each tagged with where it came from |
| Search data | Restaurant, opening hours, menu and upcoming events as schema.org JSON-LD |

## Selling it

- `/for-venues` is the sales page (English, `?lang=es` for Spanish): the five problems with small mock-ups, the four sample venues, tracking, the module structure, styles, and a contact form. In demo mode every venue page carries a "This is a sample" banner pointing to it.
- The demo has four sample venues, picked from the bar at the top: Sol (café), Marea (restaurant, the editable one), Lunar (bar and events) and Cala Blanca (beach club). The choice is remembered while browsing.
- Only Marea is editable; the other three are showcases, and the banner, demo bar, editor login and sales page all say so.
- Enquiries are stored in the `leads` table and listed at `/leads` (password in `LEADS_PASSWORD`), with a CSV download. Demo resets do not touch leads.

## Run it locally

```bash
npm install
DEMO_MODE=1 npm start        # http://localhost:3000, editor at /admin, password "marea"
npm test
```

Without `DB_NAME` it stores data in `data/local.json`.

## Environment variables

| Name | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Password for the editor (required unless `DEMO_MODE=1`) |
| `SESSION_SECRET` | Long random string used to sign the login cookie |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection. On Hostinger use host `127.0.0.1` |
| `DEMO_MODE` | `1` shows the look switcher on the site, the demo password on the login page and a reset button |
| `PUBLIC_URL` | Full site address used in links and search data, e.g. `https://venue.foodforthought.agency` |
| `NODE_ENV` | `production` marks the login cookie as secure |
| `LEADS_PASSWORD` | Opens `/leads`, the list of enquiries from the sales page |

Tables are created on first start.

## Deploy

Hosted on Hostinger as a Node.js (Express) app, entry file `server.js`, Node 20. Pushes to `main` deploy automatically.

## Not in this version

- Automatic posting to Instagram, Google or Facebook (the share kit covers this without linking accounts)
- Sending email to Circle members (download the list and use an email tool)
- Online payment for bookings (pay on the day)
- Multiple venues on one install (one install per venue for now)
- A Spanish version of the public site (captions are bilingual)
