# HomeKin

A family reunion planner: one place for the family directory, the family tree,
event signups, money, photos and chat.

Built with Next.js (App Router), Supabase (Postgres, Auth, Storage, RLS),
Stripe for card payments, SMTP (Gmail) for email and Mapbox for maps.

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
| `NEXT_PUBLIC_APP_URL` | yes | Your full origin, no trailing slash. Builds Stripe return URLs, invite links, RSVP links and signup confirmation links — a stale value here sends people to a dead page after paying, or to a confirmation link that goes nowhere |
| `STRIPE_SECRET_KEY` | for payments | `sk_test_…` or `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | for payments | `whsec_…`. **Per-mode** — a test-mode secret silently rejects every live event |
| `SMTP_USER` | for email | The sending mailbox, e.g. `you@gmail.com`. Without it and `SMTP_PASS`, nothing is delivered — the app says so rather than reporting success |
| `SMTP_PASS` | for email | A Google **app password** (16 characters), not your account password |
| `SMTP_HOST` / `SMTP_PORT` | no | Default to `smtp.gmail.com` and `587`. Set for any other provider |
| `SMTP_SECURE` | no | Implicit TLS. Inferred from the port (465 → on), so only set to override |
| `EMAIL_FROM` | no | e.g. `HomeKin <you@gmail.com>`. The address **must** be `SMTP_USER` — Gmail rewrites or rejects anything else. Defaults to `SMTP_USER` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | for maps | Public token, URL-restricted to your domain |
| `MAPBOX_SECRET_TOKEN` | for maps | Secret token scoped to `geocoding`, for server-side address lookups |

Vercel only applies environment variables to **new** deployments — after
changing one, redeploy.

### Email, and why it goes through Gmail

Everything HomeKin sends — invite codes, RSVP invitations, announcements **and the
signup confirmation email** — goes out over SMTP from `src/lib/email.ts`, pointed
at Gmail by default.

Gmail rather than a transactional provider because this app has no domain of its
own. Sending from a free address is only legitimate through the provider that
owns it: Gmail, Yahoo and Microsoft all reject or spam-file a `@gmail.com` sender
relayed by a third party, because gmail.com cannot be SPF/DKIM-aligned for
anyone else. Resend, Brevo, SendGrid and Mailgun all require a verified domain
for exactly this reason. Going through `smtp.gmail.com` keeps the family's own
address as the sender with nothing to buy.

**Setup:** turn on 2-step verification at
[myaccount.google.com](https://myaccount.google.com/), create an app password
under **Security → 2-Step Verification → App passwords**, and set `SMTP_USER` to
the Gmail address and `SMTP_PASS` to the 16 characters it gives you. Your
ordinary account password will not work.

**The limit that matters:** free Gmail allows **500 recipients per day**, counting
every To, Cc and Bcc address. Announcements go out in batches of 45 BCC
recipients per message, so one announcement to 90 people spends 92 of the day's
quota. Exceed it and Gmail returns "Daily user sending limit exceeded" and holds
the account until the window clears. That cap, not deliverability, is what will
eventually push this app onto a real domain.

Signup confirmation additionally needs `SUPABASE_SERVICE_ROLE_KEY`, since the
link is minted with the Supabase admin API. Without both that and SMTP
credentials, signup falls back to Supabase Auth's built-in sender, which is
rate-limited to a handful of messages per hour from a shared domain and reliably
lands in spam — the usual reason a confirmation email "never arrives". If you
rely on the fallback, configure custom SMTP under **Supabase → Authentication →
Emails → SMTP Settings**, and add your production domain to **URL Configuration
→ Redirect URLs** or confirmation links lose their invite code.

**Switching to Resend** once you own a domain: `src/lib/email.ts` keeps the
Resend implementation commented out at the bottom with instructions. It is the
better option at that point — no daily quota, real bounce handling, and a `From`
that is not somebody's personal mailbox.

Either way `NEXT_PUBLIC_APP_URL` must be your real origin: the emailed link is
built from it, never from the browser's, so a stale value sends people to a dead
host. Emailed links land on `/api/auth/confirm`, which verifies the token, claims
any directory profile waiting for that address and redeems the invite code in one
request. A used or expired link returns to `/login` saying so, with the magic-link
option for getting a fresh one.

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

Email delivery is covered end to end: `src/__tests__/email-smtp.test.ts` starts a
real SMTP server on localhost (`src/__tests__/helpers/smtp-test-server.ts`), sends
the actual confirmation email through it, and parses what came out the other
side — sender, envelope recipients, BCC privacy, batch splitting, and that a long
confirmation link survives quoted-printable encoding intact. It also covers the
failures: a wrong app password, a refused recipient, and a dead port. No network
and no credentials needed.

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
