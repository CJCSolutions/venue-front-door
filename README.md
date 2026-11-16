# Venue Front Door

**The problem:** a venue changes something (tonight's DJ, a price, a sold-out dish, the hours) and it has to be updated in many places: the website, the QR menu, Google, Instagram, Facebook. Most venues don't keep up, so their website is stale and guests get wrong information.

**What this does:** the venue changes it once, on a phone. The website updates by itself, live, for anyone already looking at it. The QR menu and the search data (schema.org) update too. For the social channels it makes a ready post (image plus caption in English and Spanish) that the venue shares from its own phone in one tap. Nothing is linked to anyone else's Meta or Google account.

The design and page structure are fixed. The venue only edits facts, so it can't break the site. The look is one setting: Poster wall, Gallery, Beach club or After dark.

## What's in it

| Part | What it does |
|---|---|
| Public site | Home (tonight or next up), What's on with an archive of past nights, Menu with diet filters, Book form, a page per night |
| Live updates | Open pages check for a new version every 15 seconds and swap in fresh content |
| Tonight logic | Works out tonight from the date. A night runs until 06:00, so a 03:00 set still counts as that night. Recurring nights (weekly, monthly) make a dated copy each time; one date can be cancelled without touching the rest. Past nights move to the archive automatically |
| Open status | "Open now · until 03:00", "Opens today at 18:00" or "Closed today", including closing after midnight and one-day closures |
| Editor (`/admin`) | Phone-first: add a night, change a price, mark sold out, close today, change hours, switch look. Every save says which touchpoints it reached |
| Share kit | Post (4:5) and story (9:16) images drawn in the venue's look, plus captions per channel with tagged booking links (`?src=instagram`) |
| Inbox | Booking requests from the site, with where they came from and a status |
| Search data | Restaurant, opening hours, menu and upcoming events as schema.org JSON-LD |

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

Tables are created on first start.

## Deploy

Hosted on Hostinger as a Node.js (Express) app, entry file `server.js`, Node 20. Pushes to `main` deploy automatically.

## Not in this version

- Automatic posting to Instagram, Google or Facebook (the share kit covers this without linking accounts)
- Multiple venues on one install (one install per venue for now)
- A Spanish version of the public site (captions are bilingual)
