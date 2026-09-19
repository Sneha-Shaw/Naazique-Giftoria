# Bloom & Bite — Gift Bouquet Shop

Chocolate bouquets and custom gift hampers. Astro + React islands + Tailwind,
catalogue in MongoDB Atlas, images on Cloudinary, hosted free on Netlify.
Checkout is a pre-filled WhatsApp message — no payment gateway, no backend.

See `/Users/snehashaw/.claude/plans/my-friend-has-a-cozy-pearl.md` for the full
plan, cost breakdown and architecture rationale. `HANDOVER.md` is the
non-technical operator's guide (once the admin panel ships in phase 2).

## Stack

- **Astro** (static output) — the public site prerenders to plain HTML for SEO
  and fast link previews. `output: 'static'`; individual routes will opt into
  `prerender = false` for the admin panel and API routes in phase 2.
- **React islands** for the cart, the bouquet builder, and (soon) the admin UI.
- **Tailwind v4** via the Vite plugin.
- **MongoDB Atlas (M0, free)** — the catalogue lives here. The site reads it
  once per build, not per visitor (see `scripts/fetch-catalog.js`), so runtime
  traffic never touches the database.
- **Cloudinary (free tier)** — image hosting, resizing, WebP, CDN.
- **Netlify (free tier)** — hosting, CDN, and (phase 2) serverless functions.

## Local development

```sh
npm install
cp .env.example .env      # fill in MONGODB_URI once you have an Atlas cluster
npm run seed               # loads the sample catalogue into MongoDB (optional)
npm run dev
```

Without a `.env`, the site still runs: it falls back to the committed snapshot
at `src/data/catalog.json` and logs a warning. This is deliberate — see
"Build-time fallback" below.

## How the catalogue gets from Mongo to the site

```
MongoDB Atlas  →  scripts/fetch-catalog.js (runs before every build)
               →  src/data/catalog.json     (committed snapshot)
               →  src/lib/catalog.js        (pages import from here)
```

`npm run build` runs `fetch-catalog.js` first (via the `prebuild` script). It
reads `products`, `options`, `gallery` and `settings` from Mongo and writes
them to `src/data/catalog.json`. Astro pages import from `src/lib/catalog.js`,
never from the database directly — there is no runtime DB dependency at all.

**Build-time fallback:** if `MONGODB_URI` is unset, or the cluster is
unreachable (Atlas M0 pauses after ~60 days idle), the fetch script leaves the
existing `catalog.json` untouched, logs a loud warning, and the build still
succeeds. A stale price for a few hours beats a broken deploy. Verify this
still holds after any change to `scripts/fetch-catalog.js` by temporarily
pointing `MONGODB_URI` at a bad host and running `npm run build`.

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server (uses the committed snapshot unless `.env` is set) |
| `npm run catalog:pull` | Re-fetch the snapshot from Mongo without a full build |
| `npm run seed` | Create indexes + load `src/data/catalog.json` into Mongo (idempotent, upserts by `slug`) |
| `npm run build` | `prebuild` (fetch catalogue) then `astro build` |
| `npm run preview` | Serve the built `dist/` locally |

## Environment variables

See `.env.example` for the full list and what each one is for. In production
these live in Netlify's environment variable settings, never in the repo.

## Project structure

```
src/
├── lib/          catalog.js, cloudinary.js, whatsapp.js, money.js, db.js
├── stores/       cart.js (nanostores, localStorage-persisted)
├── components/   ProductCard, CartDrawer, BouquetBuilder, Header/Footer, ...
├── layouts/      Base.astro (SEO, OG tags, JSON-LD, WhatsApp float button)
├── pages/        /, /shop, /products/[slug], /build, /gallery, /about
└── data/         catalog.json — the committed build-time snapshot
scripts/
├── fetch-catalog.js   Mongo → catalog.json, with the fallback described above
└── seed.js            one-time setup: indexes + sample data
```

## Status

**Phase 1 (public site) — done.** Catalogue, cart, WhatsApp checkout, bouquet
builder, gallery, about/FAQ, SEO basics, Netlify + Atlas + Cloudinary wiring.

**Phase 2 (admin panel)** — not started. Auth, products CRUD, image upload,
settings, publish + revision history. Until then, catalogue edits go through
`src/data/catalog.json` / Mongo directly, or ask the developer.

**Phase 3–4** — bouquet builder is done ahead of schedule; gallery/about are
done. Orders log, stock tracking, and a small dashboard are designed for in
the data model (see the plan) but not yet built.
