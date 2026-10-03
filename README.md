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

**Phase 4 (orders + customer accounts) — done.** WhatsApp Business App (the
free tier this whole plan is built on) gives no programmatic access to a chat
started from a `wa.me` link — there is no webhook, no callback, nothing an
order page could listen for. So checkout can declare an order, but it can
never confirm one — only she can, after actually talking to the customer on
WhatsApp:

- **Checkout requires a customer account** (`src/lib/customerAuth.ts` — fully
  separate from admin auth: its own cookie `gb_customer_session`, its own
  `customers` collection, `aud: 'customer'` enforced on the JWT so a token
  from one system is rejected outright by the other). The point isn't just to
  auto-create orders — it's a reliable name/phone/email to reference instead
  of retyping whatever a customer happened to type in a WhatsApp chat.
- Clicking "Order on WhatsApp" in the cart now does two things at once: opens
  the WhatsApp chat exactly as before (that navigation is never blocked or
  delayed), and — alongside it, not gating it — `POST /api/account/orders`
  (`src/pages/api/account/orders.ts`) records the order as **`pending`**.
  `pending` is a status only checkout can create; it's deliberately excluded
  from `customerCheckoutSchema` as a client-settable field (verified: a
  checkout request that sends `status: "confirmed"` is silently ignored, not
  honored) — only admin moves it to `confirmed`, from `/admin/orders`, after
  actually hearing from the customer on WhatsApp. If the save fails, the
  WhatsApp chat still opens — she can always log it by hand instead, same as
  before this existed.
- Logging an order **by hand** (`/admin/orders/new`, for phone/Instagram
  orders that never went through the site) still means picking an existing
  customer from search and listing items, and skips straight to `confirmed`
  since by then she's already spoken to them.
- The total is always computed server-side from qty × price, never trusted
  from the client, on both paths.
- Status is a short, real workflow — pending → confirmed → preparing → out
  for delivery → delivered (+ cancelled) — not re-entry. `/admin/orders` has
  a "Needs confirmation" filter and updates status with one tap; the
  customer's `/account` reflects it immediately, same live-read model as the
  rest of the site.
- Each order **is** its invoice — no separate invoice system or numbering —
  viewable as a clean, printable page at `/account/orders/[code]` and
  downloadable as a real PDF (`src/lib/invoicePdf.tsx`, `@react-pdf/renderer`)
  from both the customer's own order page and `/admin/orders`. Both the page
  and the PDF endpoint are gated by the same ownership check
  (`order.customerId === session.customerId`) that's the entire reason
  checkout needs an account in the first place: without it, knowing an order
  code would be enough to see someone else's order.

Verified end-to-end against a local test database, including the properties
that actually matter here: a customer's order total is computed server-side
regardless of what the client sends; a signed-in customer gets a 404 (not a
redirect, not an error revealing the order exists) when trying to view
another customer's order by code; an admin session cookie is rejected by
`/api/account/*` and a customer session cookie is rejected by `/api/admin/*`
— confirmed in both directions, not assumed from the separate cookie names.

### Invoice PDFs — three bugs that only showed up when actually deployed

Each of these built, typechecked, and worked perfectly in `astro dev` — and
would have shipped completely broken, because none of them are things a local
dev server exercises. Caught by invoking the real compiled
`.netlify/v1/functions/ssr/ssr.mjs` directly and looking at the actual
rendered PDF (as an image — the text layer of a PDF with a subsetted custom
font has its own, separate quirks and isn't trustworthy either), not by
trusting that `npm run build` succeeding meant it worked.

1. **The default PDF font doesn't have a ₹ glyph.** The base-14 PDF fonts
   (Helvetica etc.) use WinAnsi encoding, which silently renders `₹` as the
   wrong character instead of erroring. Fixed by embedding Noto Sans
   (specifically its `latin-ext` subset — plain `latin` doesn't have it
   either) as base64 in `src/assets/notoSansFonts.ts`.
2. **A file path that works in one build stage can 404 in the next.**
   `fileURLToPath(import.meta.url)` — the usual Vite SSR pattern for
   referencing a sibling asset — resolved to a different location in the
   intermediate Vite SSR build than in the final Netlify function bundle. The
   font is embedded as a base64 string constant instead (see above), which
   sidesteps runtime file resolution entirely. Separately, `pdfkit` (a
   `@react-pdf/renderer` dependency) loads its own standard-font metrics via
   `require()` at runtime from inside its own package — that one genuinely
   needs the files on disk, so `astro.config.mjs`'s `includeFiles` ships them
   explicitly.
3. **`<Text>` with multiple children silently drops glyphs after the first.**
   JSX's `Order #{order.orderCode}` compiles to *two* children passed to
   `<Text>` — and with this embedded font, `@react-pdf/renderer` only
   embeds/subsets glyphs correctly for the first one. Every dynamic value in
   `invoicePdf.tsx` is interpolated as a single template-literal string
   (`` `Order #${order.orderCode}` ``) specifically to avoid this — not a
   style choice, a correctness requirement. If you add a new field to the
   invoice, follow the same pattern or it will render as empty boxes.
