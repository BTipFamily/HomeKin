# HomeKin

A family reunion planner: one place for the family directory, the family tree,
event signups, money, photos and chat.

Built with Next.js (App Router), Supabase (Postgres, Auth, Storage, RLS),
Stripe for card payments, Resend for email and Mapbox for maps.

---

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill it in — see below
npm run dev
```

Open <http://localhost:3000>.

You also need a Supabase project with the migrations applied — see
[Database](#database). Without them the app builds and runs but most pages fail
at the first query.

---

## Environment variables

Copy `.env.local.example` to `.env.local` for local work, and set the same keys
in your Vercel project (**Production**, and **Preview** if you use it).

| Variable | Required | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public client key, governed by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only key that bypasses RLS. Never expose it to the browser |
| `NEXT_PUBLIC_APP_URL` | yes | Your full origin, no trailing slash. Builds Stripe return URLs, invite links and RSVP links — a stale value here sends people to a dead page after paying |
| `STRIPE_SECRET_KEY` | for payments | `sk_test_…` or `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | for payments | `whsec_…`. **Per-mode** — a test-mode secret silently rejects every live event |
| `RESEND_API_KEY` | for email | Without it, nothing is delivered. The app now says so rather than reporting success |
| `EMAIL_FROM` | for email | e.g. `HomeKin <noreply@yourdomain.com>`. Must be on a domain verified in Resend; the built-in fallback is a domain you do not own and will be rejected |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | for maps | Public token, URL-restricted to your domain |
| `MAPBOX_SECRET_TOKEN` | for maps | Secret token scoped to `geocoding`, for server-side address lookups |

Vercel only applies environment variables to **new** deployments — after
changing one, redeploy.

### Email is two separate systems

`RESEND_API_KEY` covers what HomeKin sends itself: invite codes, RSVP
invitations and announcements. It does **not** cover the signup confirmation
email, which Supabase Auth sends. Supabase's built-in sender is rate-limited to
a handful per hour from a shared domain and reliably lands in spam, so before
inviting real people configure custom SMTP under **Supabase → Authentication →
Emails → SMTP Settings**, and add your production domain to **URL Configuration
→ Redirect URLs** or confirmation links lose their invite code.

---

## Features

### Directory
- Member profiles with photo, contact details, family branch, bio, social links
  and date of birth (shown with age).
- Per-field visibility: phone, address, email and date of birth can each be
  visible to all signed-in members, to committee and admins only, or to nobody.
- Search and filter by name and family branch.
- **Spreadsheet import** — `.xlsx` or `.csv`, with a downloadable template.
  Validates everything before writing, previews exactly what will happen, and
  wires up parent/child and spouse relationships in the same pass.
- **Merge duplicates** (admin) — finds likely duplicate profiles and folds one
  into the other, moving signups, balances, relationships, photo tags and
  history across.
- **Delete members** (admin), with a preview of everything that goes with them.

### Family tree and map
- Parent/child and partner relationships, with kinds (biological, step,
  adoptive, foster) and partner status.
- Travel map of where members are coming from, geocoded via Mapbox.

### Reunions and events
- Reunion creation wizard, with a **timeline builder** and **budget estimator**.
- Sub-events with dates, times, locations, per-person cost, capacity and
  duration.
- Signups with headcount and guest names, capacity-checked.
- RSVP links that work without an account.
- Surveys, photo albums with tagging, and announcements.
- **Delete reunions** (admin), including cleanup of photo files in storage.

### Money
- Stripe Checkout for card payments, plus manual methods (Zelle, Cash App,
  cheque, other) that members report and the committee confirms.
- A **payments ledger**: one row per payment, with balances derived from it.
  Partial payments, refunds and corrections all work, and a replayed Stripe
  webhook cannot double-count.
- **Payments dashboard** (committee/admin): collected, outstanding, and every
  balance with its payment history.
- **Signups & payments report** (committee/admin): per-member totals, search,
  outstanding/settled filters and CSV export.
- Members see their own history on their profile; committee and admins see
  anyone's.

### Chat and notifications
- Per-reunion and per-event chat.
- A roster of who has been **recently active** — this is last-seen activity, not
  true presence; there is no disconnect signal, so nobody is described as
  "online".
- Unread badges for chat messages and announcements on the dashboard and the
  reunion page.

### Roles
| Role | Can do |
| --- | --- |
| `member` | View the directory and family tree, sign up for events, pay, chat, upload photos, answer surveys |
| `committee` | Everything above, plus manage reunions and events, invite members, import the directory, confirm payments, run reports |
| `admin` | Everything above, plus manage roles, merge and delete members, delete reunions, generate invite codes |

---

## Database

Migrations live in `supabase/migrations/` and are applied **in filename order**.
Run them in the Supabase SQL editor (or `supabase db push` if you use the CLI).

| Migration | What it adds |
| --- | --- |
| `001`–`009` | Core schema, RLS, phase 2, storage buckets, relationships, geocoding, reunion planning |
| `010_date_of_birth` | `members.date_of_birth` and its visibility setting |
| `011_merge_members` | `merge_members()` — folds one member into another |
| `012_invite_email_and_normalization` | Invite email tracking; lowercases member emails so signups match existing profiles |
| `013_delete_member` | `delete_member()` |
| `014_delete_reunion` | `delete_reunion()` |
| `015_payments_ledger` | `payments` table; balances derived from it by trigger |
| `016_presence_and_read_receipts` | `members.last_seen_at`, `read_receipts`, `my_unread_counts()` |

If a feature's button appears but fails when clicked, an unapplied migration is
the first thing to check — the UI does not gate on schema version.

### Why some operations are Postgres functions

Merging members, deleting a member and deleting a reunion each touch a dozen or
more tables with unique constraints in play, and each has a step foreign keys
cannot do — `photos.tagged_members` is a `uuid[]` with no FK, and photo *files*
live in Storage. They are single functions so the row work is one transaction; a
half-finished merge would scatter rows with no way to tell where they came from.

`reunions` deliberately has **no RLS delete policy**: routing every deletion
through `delete_reunion()` is what stops a future `.delete()` elsewhere skipping
the storage cleanup.

### Money is derived, not assigned

`balances.amount_paid` and `balances.status` are computed by trigger from the
`payments` table. Nothing in the application writes them. This is deliberate:
when they were plain columns, the Stripe webhook overwrote partial payments and
confirming a manual payment erased them, both irrecoverably. Record a payment by
inserting a row; correct one by editing or deleting that row; refund by
recording a negative amount.

---

## Testing

```bash
npm test          # unit tests (vitest)
npm run test:db   # schema + SQL function tests against a throwaway Postgres
```

`npm run test:db` needs a local Postgres (`apt install postgresql-16`). It
creates a temporary cluster, applies every migration from scratch, and asserts
the behaviour of the SQL functions — including the refusals: non-admins, merging
a profile into itself, an admin deleting their own profile (which is what
guarantees an admin always remains), and merging two members who both hold a
balance for the same event. It never touches your Supabase project.

Unit tests cover the pure logic: the CSV and XLSX readers, import validation,
duplicate detection, birthday parsing, budget and timeline generation, chat
merge/dedupe and presence bucketing.

---

## Deploying

Hosted on Vercel. Beyond the environment variables above:

1. **Stripe.** Activate the account, add a bank account for payouts, then create
   a **live-mode** webhook endpoint at `/api/webhooks/stripe` subscribed to
   `checkout.session.completed`, `checkout.session.async_payment_succeeded` and
   `checkout.session.async_payment_failed`. Copy that endpoint's signing secret —
   the test-mode one will not work.
2. **Supabase.** Apply any outstanding migrations, configure SMTP, and
   allow-list your production URL for auth redirects.
3. **Redeploy** after any environment variable change.

---

## Project layout

```
src/
  app/(app)/         signed-in pages: dashboard, directory, reunions, admin
  app/(auth)/        login and signup
  app/api/           webhooks, RSVP links, chat polling, presence, CSV template
  components/        shared UI and design-system primitives
  lib/               pure logic (csv, xlsx, import, merge, history, chat,
                     presence, birthday, budget, timeline)
  lib/actions/       server actions, grouped by feature
  types/database.ts  hand-maintained row types
supabase/
  migrations/        applied in filename order
  tests/             SQL suite, run by test:db
```

Logic that can be pure lives in `lib/` without Supabase imports, so it can be
tested directly; anything touching the database sits in `lib/actions/` or a
route handler.

See `AGENTS.md` before making changes — this repository pins a Next.js version
whose APIs differ from older releases, and the bundled docs in
`node_modules/next/dist/docs/` are the reference.
