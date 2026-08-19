# HomeKin

A family reunion planner: one place for the family directory, the family tree,
the reunion itself — interest, dates, places, events, signups, money, photos,
chat — and the guides that explain all of it.

Built with Next.js (App Router), Supabase (Postgres, Auth, Storage, RLS),
Stripe for card payments, SMTP (Gmail) for email and Mapbox for maps. It
installs to a phone or a Mac Dock as a PWA.

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
| `CRON_SECRET` | for reminders | Bearer token Vercel Cron sends to `/api/cron/reminders` and `/api/cron/reconcile-payments`. Without it both routes refuse to run — and without the first, no deadline reminders go out |
| `CONTACT_EMAIL` | before publishing | The address printed on `/privacy` and `/terms`, and the one people report problems to. Unset, both pages render a visible "not ready to publish" banner and an obvious placeholder address rather than something plausible-looking. Deliberately **not** `NEXT_PUBLIC_` — a public variable is inlined at build time, so setting it in the hosting dashboard would change nothing until the next build |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | for maps | Public token, URL-restricted to your domain |
| `MAPBOX_SECRET_TOKEN` | for maps | Secret token scoped to `geocoding`, for server-side address lookups |

Vercel only applies environment variables to **new** deployments — after
changing one, redeploy.

### Email, and why it goes through Gmail

Everything HomeKin sends — invite codes, RSVP invitations, announcements,
statements, receipts, deadline reminders **and the signup confirmation email** —
goes out over SMTP from `src/lib/email.ts`, pointed at Gmail by default.

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
ordinary account password will not work. `node scripts/send-test-email.mjs`
proves the credentials work in about a second, rather than a week later when
somebody tries to sign up.

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

### Payment deadlines, statements and reminders

An event can carry **payment deadlines** — checkpoints for when money is due,
set when you create the event and editable afterwards. Each one is a name, a
date, and how much: a percentage of what the member owes, a fixed amount per
person, or "whatever is left". An event can have as many as you need, so
"deposit in March, half in May, balance in July" is three rows.

What each member owes by each date is **never stored**. It is the event's
checkpoints applied to that member's balance and headcount, worked out on read
(`src/lib/payment-schedule.ts`). Storing it would go stale the moment somebody
adds a guest or the committee reprices the event — the same bug the payments
ledger exists to prevent.

Payments settle the earliest checkpoint first, so a part payment clears the
deposit rather than smearing across the schedule. Checkpoints that do not add up
to the full cost leave the rest as a trailing "remaining balance" due at the
event, rather than silently inflating the last deadline.

**Members are emailed automatically:**

- A **statement** whenever they sign up, change their headcount or cancel —
  every selection in that reunion, what each costs, what they have paid, the
  payment schedule for each event, and what is still outstanding.
- A **receipt** when a payment is confirmed: a card payment landing via the
  Stripe webhook, or the committee confirming one that arrived another way. A
  member reporting their own Zelle transfer is not emailed — telling them it
  "arrived" before the committee agrees would not be true.
- A **reminder** before each deadline, at the offsets set on that checkpoint
  (14 and 3 days by default). Only to members who are actually short at that
  checkpoint, and once per offset — never twice, guaranteed by a unique index
  on `email_sends` rather than by remembering to check.

Reminders need a scheduler. `vercel.json` runs `/api/cron/reminders` daily; the
route requires `Authorization: Bearer $CRON_SECRET`, so set `CRON_SECRET` in
Vercel or no reminders go out. To test it by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders
```

**Gmail's 500-a-day cap bites hardest here.** Reminders go one per member — they
cannot be BCC-batched, since each names a different amount — so a 200-member
reunion with two checkpoints falling on the same day would spend 400 of the
day's quota, and exceeding it locks the account for everything else the app
sends. A run therefore stops at 400 emails and defers the rest to the next day,
soonest deadlines first. This is the limit that will eventually force a real
domain and a transactional provider.

The committee report at `/reunion/[id]/report` gains a **payment deadlines**
panel — every checkpoint with what was expected, collected, and who is short —
and the CSV export gains `due_now`, `overdue` and `next_due_date` columns.

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

### Card payments: what the webhook guarantees, and what checks it

The Stripe webhook at `/api/webhooks/stripe` is the only thing that records a
card payment. A browser coming back to the success page never marks anything
paid — close the tab at the Stripe redirect and the payment still lands, because
it was never the browser's to report.

Being the only writer makes it a single point of failure, so two guards sit
around it.

**`webhook_events`** logs every delivery by its Stripe event id before any work
starts. Stripe redelivers on any non-2xx and occasionally just because, and a
handler that ran twice would credit the same money twice. The row is claimed at
the top of the request and stamped `processed_at` at the bottom, so the table
distinguishes *handled* from *started and never finished* — a distinction a
plain "seen this id, return 200" would lose. A delivery that failed and recorded
why is retryable as soon as Stripe sends it again; one that vanished without
recording anything is taken over five minutes later, by which time no handler
could still be running; one that completed is refused for good. The unique index on
`payments.stripe_session_id` stays as the second line of defence, and the
Checkout Session is created with an idempotency key derived from the balance's
own state, so a member double-tapping **Pay** gets one session rather than two.

Handled events: `checkout.session.completed` and
`async_payment_succeeded` (record the payment), `checkout.session.expired` and
`async_payment_failed` (let go of the dead session — a balance whose payment did
not happen is simply unpaid, and there is deliberately no failure state to clear
before trying again), `payment_intent.payment_failed` (logged, since a declined
card is what people ask about) and `charge.refunded`.

**`/api/cron/reconcile-payments`** runs nightly and catches what webhooks alone
cannot: an event Stripe never managed to deliver, a handler that threw, a refund
somebody issued from the Stripe dashboard. It nets each payment intent's ledger
rows against what Stripe captured and refunded, and reports four kinds of
disagreement — money taken but not recorded, money recorded but not taken, a
charge that never succeeded, and an amount that no longer matches. Divergences
go to the log with the payment intent id to look up; **nothing is repaired
automatically**. A second thing writing money is the bug the payments ledger
exists to prevent, and a job that quietly invents a payment to make the numbers
agree is worse than one that says they do not.

Charges are attributed by metadata carried down to the payment intent, so an
unrelated charge on a Stripe account the family also uses for something else is
counted rather than reported every night as a lost payment. Card payments taken
before migration `036` have no payment intent recorded and are counted as
unverifiable rather than guessed at.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/reconcile-payments
```

---

## Features

### Directory
- Member profiles with photo, contact details, family branch, bio, social links
  and date of birth (shown with age).
- Per-field visibility: phone, address, email and date of birth can each be
  visible to all signed-in members, to committee and admins only, or to nobody.
- **Dietary, health and mobility needs**, on their own table with its own
  policy — visible to the member, the committee and admins, and to the rest of
  the family only if the member turns on `share_with_family`. That flag is
  opt-in and defaults to off, because defaulting it on would share somebody's
  health note the moment they typed it.
  They are deliberately *not* on `members` with the other visibility settings:
  that table has a single "every signed-in member can read every row" policy, so
  a health note stored there would be readable by the whole family whatever the
  UI showed.
- Search and filter by name and family branch.
- **Households** — the unit a family actually answers as. One adult replies for
  four people, books one room and pays one bill. Money stays keyed to the member
  who owes it; a household only groups people.
- **Spreadsheet import** — `.xlsx` or `.csv`, with a downloadable template.
  Validates everything before writing, previews exactly what will happen, and
  wires up parent/child and spouse relationships in the same pass.
- **Merge duplicates** (admin) — finds likely duplicate profiles and folds one
  into the other, moving signups, balances, payments, relationships, households,
  photo tags, comments, likes and history across.
- **Delete members** (admin), with a preview of everything that goes with them.

### Family tree and map
- Parent/child and partner relationships, with kinds (biological, step,
  adoptive, foster) and partner status.
- A pedigree-style tree: one row per generation, ancestors above the focus
  person and descendants below, couples side by side, children centred under
  their parents. Branches expand and collapse upward and downward from whoever
  you are looking at. The layout is ours (`src/lib/tree-layout.ts`) rather than a
  library's, so a relationship it cannot place is simply not drawn instead of
  throwing.
- **Kinship naming** — "Aunt", "Father-in-law", "2nd cousin once removed" —
  computed from the same relationship rows, on the tree and on any profile.
- Travel map of where members are coming from, geocoded via Mapbox.

### Planning a reunion
- Reunion creation wizard, with a **timeline builder** and **budget estimator**.
- **Reunion phases** — draft, interest, planning, registration, finalized,
  completed. Advisory by design: they decide what the app leads with and
  suggests next, never what it forbids, so an organiser who has not flipped the
  status has not thereby locked a relative out of paying a deposit.
- **Interest round** — a typed form, not a free-text survey: would you come,
  how many adults / youth / children, which months, how long, what budget, what
  lodging, are you willing to help. Typed because none of what follows is
  possible over free text.
- **Interest summary** for the committee, with the headcount as an honest
  **range** — a "probably" eighteen months out is a guess, and counting it as a
  yes produces a confident number a venue gets booked against.
- **Date overlap** — families give the ranges they can travel; the committee
  sees the best windows, who each window leaves out, and how the suggestions
  rank.
- **Location shortlist and voting** — the committee promotes suggestions to a
  shortlist carrying the details that actually decide it (capacity, cost per
  person, accessibility), and the family votes, one vote each. Two steps because
  they answer different questions: where people want to go, and where the
  reunion can go.
- **Planning timeline** — the committee's to-do list in the months beforehand.

### Events and the weekend itself
- Sub-events with dates, times, locations, per-person cost, capacity and
  duration.
- **Booking modes.** `homekin` — the committee prices it and HomeKin bills for
  it. `direct` — the family books and pays on the vendor's own site and the
  committee only needs to know who is going. `group` — the vendor drops the rate
  once enough people commit, so **price tiers** apply and the page can say "3
  more and everyone pays $45".
- Signups with headcount and guest names, capacity-checked.
- **Named attendees** behind the headcount — enough to order the right number of
  children's meals and know who needs step-free access, which a headcount alone
  can never answer.
- **Payment deadlines** per event — percentage, fixed per person, or the
  remaining balance — each with its own reminder schedule.
- **Agenda** — the running order for the weekend, in order, with who is coming.
  The thing that gets printed and left on a table by the door. Distinct from the
  planning timeline, which is the months beforehand.
- RSVP links and invitations that work without an account.
- Surveys — members can revise their own answers, and the committee can take a
  survey down (which takes its responses with it, and says how many first).
- **Delete reunions** (admin), including cleanup of photo and video files in
  storage.

### Money
- Stripe Checkout for card payments, plus manual methods (Zelle, Cash App,
  cheque, other) that members report and the committee confirms.
- A **payments ledger**: one row per payment, with balances derived from it.
  Partial payments, refunds and corrections all work, and a replayed Stripe
  webhook cannot double-count.
- **Refunds issued at Stripe** come back into the ledger by themselves, as
  ordinary negative rows, so a card refunded from the Stripe dashboard stops the
  balance claiming money the family no longer has. Full or partial, and as many
  partials as you like.
- **Nightly reconciliation** compares the last 30 days of card payments against
  Stripe and reports anything that does not agree — see below.
- **Payments dashboard** (committee/admin): collected, outstanding, and every
  balance with its payment history.
- **Emailed statements** on every change to a member's selections, and a receipt
  whenever a payment is confirmed.
- **Deadline reminders** before each payment checkpoint, to the members who are
  actually short, once per reminder offset.
- **Signups & payments report** (committee/admin): per-member totals, search,
  outstanding/settled filters, a payment-deadline panel and CSV export.
- Members see their own history on their profile; committee and admins see
  anyone's.

### Photos, chat and notifications
- Photo albums per reunion, with **tagging**, **comments** and **likes**.
- **Video** as well as photos — MP4, MOV and WebM up to 100MB (images 10MB), ten
  files a batch. A poster frame is captured in the browser at upload so the grid
  does not have to load every video to draw a tile; if that fails the upload
  still succeeds. The limits live in one module so what the UI promises and what
  the bucket enforces cannot drift apart.
- Per-reunion and per-event chat, and announcements.
- A roster of who has been **recently active** — this is last-seen activity, not
  true presence; there is no disconnect signal, so nobody is described as
  "online".
- Unread badges for chat messages and announcements on the dashboard and the
  reunion page.

### Safety, privacy and leaving
- **Report** a photo, a comment, a chat message, an announcement or a person,
  with reasons written in the words a family member would use rather than
  platform vocabulary.
- **Block** somebody. It hides them from you *and* you from them, enforced by
  restrictive RLS policies rather than by filtering in the UI, so nothing
  depends on every query remembering.
- A **committee queue** at `/admin/reports`, reviewed within 24 hours. A report
  survives the content it points at, so deleting the photo does not erase the
  evidence that it was reported.
- **Close your own account** from `/account` — no admin needed, with a preview
  of exactly what is destroyed, including any record of money owed or paid. The
  one refusal is the last admin: promote somebody first, then leave.
- Public `/privacy` and `/terms`, readable with no session, and `/goodbye`,
  which is where deleting your account lands. All three are outside the auth
  redirect on purpose — a login form is the worst possible confirmation that
  deleting your account worked, and it reads as a broken link to anybody
  checking the privacy policy.
- The whole app is `noindex, nofollow`: it is invitation-only and holds a
  family's addresses and photographs.

### Guides
Thirty-three in-app guides at `/guides`, in seven sections, covering every
feature from joining with an invite code to confirming a payment. They are
statically imported and prerendered, so a missing or misnamed guide is a build
error rather than a 404 nobody notices. Every guide is listed for everybody —
a badge explains that a step needs the committee or an admin rather than hiding
the page, because knowing how the reunion is run is useful even if you are not
running it.

### Roles
| Role | Can do |
| --- | --- |
| `member` | View the directory and family tree, answer the interest form and vote on locations, sign up for events, pay, chat, upload photos and video, answer surveys, report content, block people, close their own account |
| `committee` | Everything above, plus manage reunions and events, run the planning and shortlist, invite members, import the directory, confirm payments, run reports, act on the moderation queue |
| `admin` | Everything above, plus manage roles, merge and delete members, delete reunions, generate invite codes |

---

## Installing it

HomeKin is a PWA. `src/app/manifest.ts` gets it onto an iPhone or iPad home
screen and into the Mac Dock with its own icon and no browser chrome, today and
without anybody's review; it is also the groundwork a native shell would need
later, since the icons, colours and name come from there rather than an Xcode
project.

`public/sw.js` is deliberately the most cautious service worker that is still
useful, because of what this app holds — addresses, birthdays, photographs of
children, health notes. **No page HTML is ever cached.** Navigations go to the
network and, failing that, to a single `/offline` page that contains nothing
about anybody. What is cached is the build's own hashed JS and CSS and the
icons: identical for everyone, and the difference between a cold start on hotel
wifi and a spinner. A reunion venue is exactly where signal fails.

Icons are generated from `public/brand/homekin-mark.svg`:

```bash
npm run icons
```

`src/__tests__/pwa-assets.test.ts` reads the committed PNGs and checks their
dimensions and alpha channel, so a hand-edited or deleted icon fails there
rather than as a blank square on somebody's home screen.

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
| `017_event_deadlines` | `event_deadlines` and `email_sends` (which stops a reminder or receipt going out twice) |
| `018_stripe_payment_method` | `payments.stripe_payment_method` — which wallet a Stripe payment used |
| `019_photo_comments_and_likes` | `photo_comments`, `photo_likes`; teaches `merge_members()` about both; indexes `photos` |
| `020_video_uploads` | `photos.media_type`/`thumbnail_path`/`duration_seconds`, video MIME types on the bucket, poster sweep in `delete_reunion()` |
| `021_photo_delete_permission` | Lets the committee delete a photo, which the UI already offered |
| `022_merge_members_payments` | Stops a member merge deleting the merged-away profile's payment history |
| `023_reunion_status` | `reunions.status` — the reunion's lifecycle stage, advisory rather than gating |
| `024_households` | `households` and `household_members`; teaches `merge_members()` about them |
| `025_attendees` | Named attendees on a signup, backfilled from `signups.guest_names` |
| `026_interest_responses` | Typed interest survey per reunion; teaches `merge_members()` about it |
| `027_event_booking_modes` | Direct/group events, group price tiers, and headcount functions the signups policy would otherwise hide |
| `028_merge_helper` | `merge_dedup_move()` — the merge dedup rule stated once instead of five times |
| `029_interest_dates_and_places` | Date ranges, location suggestions and food preferences on the interest form |
| `030_member_support_needs` | Dietary/health/mobility on their own table with a real policy; volunteer fields on `members` |
| `031_location_shortlist` | Committee shortlist of places and one-vote-per-member voting |
| `032_survey_response_update` | An UPDATE policy on `survey_responses`, so changing your mind stops failing silently |
| `033_survey_delete` | Committee/admin can delete a survey; its responses cascade with it |
| `034_delete_my_account` | `delete_my_account()` — the same work as `delete_member()`, authorized the other way round. Refuses only the last admin |
| `035_reports_and_blocks` | `content_reports` and `member_blocks`, with restrictive policies that hide a blocked person in both directions |
| `036_webhook_events_and_refunds` | `webhook_events` and its claim/complete functions; `payments.stripe_payment_intent_id` and `stripe_refund_id`, so a refund taken at Stripe lands in the ledger once |

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

### Blocking and support needs are enforced in the database

Both could have been done in the UI, and neither is. A blocked person is hidden
by restrictive policies in migration `035`, so a query that forgets to filter
still cannot see them; support needs live on their own table in migration `030`
rather than in `members.visibility_settings`, because `members` has a single
"any signed-in member may read any row" select policy and a health note stored
there would have been readable by the whole family regardless of what the page
chose to render.

---

## Testing

```bash
npm test          # unit tests (vitest)
npm run test:db   # schema + SQL function tests against a throwaway Postgres
npm run lint
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
the behaviour of the SQL functions — merges, deletes, the payments ledger,
unread counts, deadlines, photo social, households and attendees, the interest
round, event modes, support needs, and webhook idempotency and Stripe refunds —
including the refusals: non-admins,
merging a profile into itself, an admin deleting their own profile (which is
what guarantees an admin always remains), and merging two members who both hold
a balance for the same event. It never touches your Supabase project.

Unit tests cover the pure logic: the CSV and XLSX readers, import validation,
duplicate detection, birthday parsing, kinship naming, tree layout, budget and
timeline generation, event pricing and capacity, the payment schedule, statement
and reminder wording, interest summarising, date overlap, agenda ordering,
survey and moderation rules, account-deletion wording, media limits, chat
merge/dedupe, presence bucketing and payment reconciliation.

Two suites assert things that are otherwise only enforced somewhere expensive:
`public-routes.test.ts` reads `src/proxy.ts` and fails if `/privacy`, `/terms` or
`/goodbye` slip behind the auth redirect, and `pwa-assets.test.ts` checks the
committed icons against the rules a store only applies at upload time.

---

## Deploying

Hosted on Vercel. Beyond the environment variables above:

1. **Stripe.** Activate the account, add a bank account for payouts, then create
   a **live-mode** webhook endpoint at `/api/webhooks/stripe` subscribed to
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `payment_intent.payment_failed` and `charge.refunded`. Copy that endpoint's
   signing secret — the test-mode one will not work. One endpoint handles
   everything; a second one would deliver the same events twice.
2. **Supabase.** Apply any outstanding migrations, configure SMTP, and
   allow-list your production URL for auth redirects.
3. **Set `CONTACT_EMAIL`** to an address somebody reads. Until you do, `/privacy`
   and `/terms` say so on the page.
4. **Redeploy** after any environment variable change.

---

## Project layout

```
src/
  app/(app)/         signed-in pages: dashboard, directory, family tree,
                     reunions, guides, account, admin
  app/(auth)/        login and signup
  app/api/           webhooks, RSVP links, chat polling, presence, cron
                     reminders and payment reconciliation, checkout, CSV
                     template, auth callbacks
  app/manifest.ts    PWA manifest
  app/privacy|terms|goodbye|offline   public pages, outside the auth redirect
  proxy.ts           session refresh and the public-route list
  components/        shared UI and design-system primitives
  content/guides/    the guide pages, one file each
  lib/               pure logic (csv, xlsx, import, merge, kinship, tree
                     layout, chat, presence, birthday, budget, timeline,
                     agenda, interest, date overlap, pricing, payment
                     schedule, reconciliation, moderation, media, legal)
  lib/actions/       server actions, grouped by feature
  lib/guides/        guide registry and section metadata
  types/database.ts  hand-maintained row types
public/
  sw.js              service worker: shell only, never page HTML
  icons/, brand/     generated icons and the source mark
scripts/             icon generation, SMTP smoke test, admin password reset
supabase/
  migrations/        applied in filename order
  tests/             SQL suite, run by test:db
```

Logic that can be pure lives in `lib/` without Supabase imports, so it can be
tested directly; anything touching the database sits in `lib/actions/` or a
route handler. Note that a `'use server'` module may export async functions and
nothing else — which is why types and wording for a feature (`lib/moderation.ts`,
`lib/account.ts`, `lib/surveys.ts`) sit beside, rather than inside, its actions.

See `AGENTS.md` before making changes — this repository pins a Next.js version
whose APIs differ from older releases, and the bundled docs in
`node_modules/next/dist/docs/` are the reference.
