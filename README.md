# Naazique Giftoria

Chocolate bouquets and custom gift hampers. Astro + React islands + Tailwind,
catalogue in MongoDB Atlas, images on Cloudinary, hosted free on Netlify.
Checkout is a pre-filled WhatsApp message — no payment gateway, no backend.

See `/Users/snehashaw/.claude/plans/my-friend-has-a-cozy-pearl.md` for the full
plan, cost breakdown and architecture rationale. `HANDOVER.md` is the
non-technical operator's guide (once the admin panel ships in phase 2).

## Stack

- **Astro**, server-rendered — every public page (`/`, `/shop`,
  `/products/[slug]`, `/gallery`, `/about`) reads MongoDB live on each request
  (`export const prerender = false` + `src/lib/catalog.js`), same as the admin
  panel and API routes. Nothing is baked in at build time: add a product in
  `/admin`, refresh the site, it's there — no rebuild, no manual sync step.
  All of it still renders to complete HTML server-side, so SEO and link
  previews (WhatsApp, Instagram, Google) work exactly as well as a fully
  static site would.
- **React islands** for the cart and the admin UI.
- **Tailwind v4** via the Vite plugin.
- **MongoDB Atlas (M0, free)** — the catalogue lives here and is read on every
  pageview via `src/lib/catalog.js`'s `getLiveCatalog()`. At this business's
  scale that's a non-issue; it's the trade made in exchange for "changes are
  just live," which is what routine catalogue editing actually needs.
- **Cloudinary (free tier)** — image hosting, resizing, WebP, CDN.
- **Netlify (free tier)** — hosting, CDN, and serverless functions (every page
  is a function now, not just `/admin`/`/api`).

## Local development

```sh
npm install
cp .env.example .env      # fill in MONGODB_URI once you have an Atlas cluster
npm run seed               # loads the sample catalogue into MongoDB (optional)
npm run dev
```

Without a `.env`, the site still runs: `getLiveCatalog()` falls back to the
committed snapshot at `src/data/catalog.json` and logs a warning. This is
deliberate — see "Resilience" below. Note that `.env` changes require
restarting `npm run dev` — Node reads it once at process start, not on file
change.

## Resilience — what happens if Atlas is down

```
Every page request  →  src/lib/catalog.js: getLiveCatalog()
                          ├─ tries MongoDB Atlas first
                          └─ on any failure, falls back to the committed
                             src/data/catalog.json snapshot instead of the
                             page failing to render
```

If `MONGODB_URI` is unset, or the cluster is unreachable (Atlas M0 pauses
after ~60 days idle), `getLiveCatalog()` catches the error, logs it, and
serves the static snapshot instead — stale data beats a broken page. That
snapshot is refreshed by `npm run catalog:pull` (or any `npm run build`, which
runs it via `prebuild`); it's a safety net, not the primary data source
anymore. Verify the fallback still works after any change to
`src/lib/catalog.js` by temporarily pointing `MONGODB_URI` at a bad host and
loading the site.

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server, reading MongoDB live via `.env`'s `MONGODB_URI` |
| `npm run catalog:pull` | Refresh the static fallback snapshot from Mongo |
| `npm run seed` | Create indexes + load `src/data/catalog.json` into Mongo (idempotent, upserts by `slug`) |
| `npm run build` | `prebuild` (refresh the fallback snapshot) then `astro build` |
| `npm run preview` | Serve the built `dist/` locally (still reads MongoDB live — this isn't a static export) |

## Environment variables

See `.env.example` for the full list and what each one is for. In production
these live in Netlify's environment variable settings, never in the repo.

## Project structure

```
src/
├── lib/          All .ts — catalog.ts (getLiveCatalog — the live read +
│                 fallback), db.ts, schemas.ts (zod; every other type is
│                 z.infer'd from these), revisions.ts (auto-checkpointing),
│                 auth.ts, adminAuth.ts, adminPage.ts, rateLimit.ts,
│                 cloudinary.ts, whatsapp.ts, money.ts, adminApi.ts,
│                 clientUpload.ts
├── stores/       cart.js (nanostores, localStorage-persisted)
├── components/   ProductCard, CartDrawer, Header/Footer, admin/...
├── layouts/      Base.astro (SEO, OG tags, JSON-LD, WhatsApp float button) —
│                 takes `settings` as a prop, passed down by each page's own
│                 getLiveCatalog() call; never imports it statically
├── pages/        /, /shop, /products/[slug], /gallery, /about,
│                 /admin/{products,gallery,settings,history}, /api/*
│                 — all `prerender = false`, all read live
└── data/         catalog.json — the fallback snapshot, not the source of truth
scripts/
├── fetch-catalog.js   Mongo → catalog.json, refreshes the fallback snapshot
├── seed.js            one-time setup: indexes + sample data
└── seed-admin.js      interactive: create/reset the admin login
```

**Why `scripts/*.js` and `astro.config.mjs` construct their own `MongoClient`
instead of importing `src/lib/db.ts`:** every other file in the app resolves a
`.js`-suffixed import to the matching `.ts` file automatically — that's Vite's
"Bundler" module resolution, and it's how every `.astro`/`.jsx` file here gets
away with writing `from './db.js'` when the real file is `db.ts`. These few
files are different: they're executed directly by `node`, outside Vite
entirely, and plain Node has no such resolution trick. Importing `db.ts` from
one of them fails immediately — and did, silently, for a while, because
`scripts/fetch-catalog.js`'s own "Atlas is unreachable" fallback logic caught
the failure and treated it identically to a real outage, serving stale data
from every build without ever raising an error. Each of these files now opens
its own short-lived `MongoClient` instead of importing `db.ts`, sidestepping
the resolution problem entirely rather than trying to work around it.

## Testing the admin flow without a real Atlas cluster

`mongodb-memory-server` (devDependency) downloads and runs a real local
`mongod` — no Docker, no Atlas account, nothing sent over the network. Useful
for a full dry run of login → products → rollback before wiring up the real
database:

```sh
node -e "
import('mongodb-memory-server').then(async ({ MongoMemoryServer }) => {
  const m = await MongoMemoryServer.create({ instance: { port: 27117, dbName: 'giftshop' } });
  console.log(m.getUri('giftshop'));
});
"
# paste that URI into .env as MONGODB_URI, then in another terminal:
npm run seed
npm run seed:admin
npm run dev
```

This is what verified the flow during development — including catching a real
bug in the rollback endpoint (a Mongo `$set`/`$setOnInsert` conflict on
`createdAt` that only showed up when actually exercising a restore, not from
reading the code). Worth re-running this after any change to
`scripts/seed.js`, `src/lib/db.js`, or anything under `api/admin/`.

## Status

**Phase 1 (public site) — done.** Catalogue, cart, WhatsApp checkout,
gallery, about/FAQ, SEO basics. Originally built on a build-time snapshot
model; **switched to reading MongoDB live on every request** (see
"Resilience" above) once it became clear routine catalogue edits needing a
rebuild wasn't good enough — the static snapshot is now purely a fallback for
when Atlas is unreachable, not the primary data source.

**Phase 2 (admin panel) — done.** Email/password auth (bcrypt + JWT cookie,
rate-limited, generic errors on failure), products/gallery/settings CRUD, and
signed Cloudinary uploads with client-side downscaling. All `/api/admin/*`
and `/admin/*` routes are guarded server-side.

There is no manual "Publish" step — every save is already live (the site
reads MongoDB directly, per request; see "Resilience" above), so a Publish
button asking her to make it live would just be wrong. What used to be a
manual publish click is now automatic: every successful save (product,
gallery, or settings) writes a checkpoint to `revisions`
(`src/lib/revisions.ts`), and `/admin/history` lists them with one-click
Restore. Verified end-to-end against both a local MongoDB and the real Atlas
cluster: login, rate limiting, validation, archive-not-delete, the full
checkpoint/rollback cycle, and — critically — a product added directly to
Atlas appearing on the live site immediately with zero rebuild.

**Deployed** to Netlify via GitHub, connected to a real Atlas M0 cluster.
Still open: the `whatsappNumber` in Atlas settings is still the placeholder
`919999999999` — set the real one via `/admin/settings` before launch.

**Phase 3** — gallery and about/FAQ are done (built in phase 1). The custom
bouquet builder (`/build`) was built, then removed at the user's request —
custom orders now go through the WhatsApp enquiry links on the home and shop
pages instead of an in-browser builder.

**Phase 4 — not started.** Orders log, stock tracking, and a small dashboard.
The data model (`products.status`/`stock`, `users.role`) was designed for
these from the start — see the plan — so they should be additive, not a
rewrite.
