# Operational Runbooks

Step-by-step guides for operational tasks that require specific sequencing. Retrieve this file when asked how to perform any of the procedures below.

---

## Stripe: Sandbox → Live Mode

**When:** Ready to accept real payments from real users.
**Prerequisite:** Deployed backend with a public HTTPS URL.

### Step 1 — Activate live mode in Stripe Dashboard

Toggle from "Test" to "Live" in the top-left of the Stripe Dashboard. Products, prices, customers, and webhooks are completely separate per mode — nothing carries over automatically.

### Step 2 — Recreate products and prices in live mode

Test-mode price IDs are invalid in live mode. In live mode Dashboard:
- Create product "Markr Premium" (SGD)
- Create all four prices:
  - Card Monthly: S$5.00/month recurring
  - Card Semesterly: S$25.00 every 6 months recurring — under "Billing period" choose **Custom**, set interval **Monthly** with a count of **6** (Stripe has no native "semi-annual" interval, so this is expressed as `interval=month, interval_count=6`)
  - PayNow Monthly: S$5.00 one-time
  - PayNow Semesterly: S$25.00 one-time
- Copy the four new `price_live_...` IDs

**PayNow in live mode:** Requires Singapore business registration and Stripe verification. Go to Dashboard → Settings → Payment methods → enable PayNow. Stripe may request business documents before approval.

### Step 3 — Create a live webhook endpoint

`stripe listen` is a dev-only tool. Production requires a registered HTTPS endpoint:
- Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://your-domain.com/api/billing/webhook`
- Events to subscribe:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.deleted`
  - `invoice.payment_succeeded` (drives the renewal-charge receipt email — see [Transactional Emails: Resend Setup](#transactional-emails-resend-setup))
- Copy the `whsec_...` signing secret shown after creation

### Step 4 — Configure the Stripe Customer Portal

One-time setup per mode (not in code):
- Dashboard → Settings → Billing → Customer portal
- Enable "Cancel subscriptions" and any other self-service options desired

### Step 5 — Update production environment variables

No code changes needed — the integration is fully env-var-driven:

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...          # from step 3
STRIPE_PRICE_MONTHLY=price_live_...      # card monthly, from step 2
STRIPE_PRICE_SEMESTERLY=price_live_...   # card semesterly (6-month), from step 2
STRIPE_PRICE_MONTHLY_PAYNOW=price_live_...
STRIPE_PRICE_SEMESTERLY_PAYNOW=price_live_...
FRONTEND_URL=https://your-domain.com     # Stripe uses this for success/cancel redirects
CORS_ORIGIN=https://your-domain.com      # CORS allow-list for the backend
```

The live secret key is at Dashboard → Developers → API keys → Secret key (live mode).

### Step 6 — Deploy and smoke-test

Stripe provides live-mode test cards (real card network, no actual charge) for a final sanity check. Available at Dashboard → Developers → Testing (while in live mode).

---

## App: Re-enable PayNow (currently card-only)

**When:** PayNow was disabled at the card-only go-live (the operator had no registered Singapore business, which Stripe requires for live PayNow). Re-enable once a Singapore business (UEN) is registered and Stripe approves PayNow.

**How it's disabled today:** a frontend feature flag — `frontend/src/components/UpgradeModal.tsx` reads `const PAYNOW_ENABLED = import.meta.env.VITE_PAYNOW_ENABLED === 'true'`. It's unset in production, so the Card/PayNow toggle and all PayNow copy are hidden and every checkout goes through as `card`. **No PayNow code was removed** — it's all intact behind the flag.

### Steps to turn it back on

1. **Stripe — enable the payment method:** register/verify the Singapore business, then Dashboard (live mode) → **Settings → Payment methods** → enable **PayNow**. Stripe may request business documents before approval.
2. **Stripe — create the two live PayNow prices** under the "Markr Premium" product (PayNow is a *one-time* payment, not recurring):
   - PayNow Monthly: **S$5.00 one-time**
   - PayNow Semesterly: **S$25.00 one-time**
   Copy the two `price_live_...` IDs.
3. **Backend (Cloud Run) — set the PayNow price env vars:**
   ```bash
   gcloud run services update math-trainer --region asia-southeast1 \
     --update-env-vars STRIPE_PRICE_MONTHLY_PAYNOW=price_live_...,STRIPE_PRICE_SEMESTERLY_PAYNOW=price_live_...
   ```
4. **Frontend — flip the flag:** set `VITE_PAYNOW_ENABLED=true` in `frontend/.env.production`, then rebuild + redeploy (push to `main` → Cloud Build). This un-hides the Card/PayNow toggle.
5. **Smoke-test:** open the upgrade modal → confirm the **PayNow** toggle appears → run a PayNow test payment end-to-end and confirm the webhook grants access.

---

## Stripe: Change Subscription Pricing (Test Mode)

**When:** The premium plan's price or billing period changes. Prices in Stripe are immutable — you cannot edit the amount on an existing Price object, only create a new one and swap the ID.

### Step 1 — Create the new prices in the Test Mode Dashboard

Dashboard (ensure the "Test mode" toggle, top-right, is on) → Product catalog → "Markr Premium" (or create it if missing, currency SGD):
- Card Monthly: S$5.00/month recurring
- Card Semesterly: S$25.00 every 6 months recurring — under "Billing period" choose **Custom**, interval **Monthly**, count **6** (Stripe has no native "semi-annual" interval)
- PayNow Monthly: S$5.00 one-time
- PayNow Semesterly: S$25.00 one-time

Copy each new `price_test_...` ID.

### Step 2 — Update `backend/.env`

```
STRIPE_PRICE_MONTHLY=price_test_...
STRIPE_PRICE_SEMESTERLY=price_test_...
STRIPE_PRICE_MONTHLY_PAYNOW=price_test_...
STRIPE_PRICE_SEMESTERLY_PAYNOW=price_test_...
```

Restart the backend (`npm run dev` in `backend/`) so it picks up the new env values.

### Step 3 — Archive the old prices (optional cleanup)

Old prices with active test subscriptions still work for existing subscribers (Stripe won't retroactively change what they're billed) — archive them in the Dashboard (Product catalog → price → "..." → Archive) once you've confirmed no test subscriptions still reference them, so they stop cluttering the picker.

### Step 4 — Smoke-test checkout

Run through `POST /api/billing/checkout` for both `plan: "monthly"` and `plan: "semesterly"`, both `method: "card"` and `method: "paynow"`, using a [Stripe test card](https://docs.stripe.com/testing) — confirm the checkout page shows the new amount.

---

## Stripe: Reset a Test Account to Free Tier (dev only)

Useful during development to re-test the upgrade flow from scratch.

```bash
cd backend
npx tsx scripts/reset-user-tier.ts <email>
```

Clears: Firebase custom claim → `{ tier: 'free' }`; DB fields → `stripe_customer_id: null`, `subscription_status: null`, `access_expires_at: null`.

The user must sign out and back in (or wait up to 1 hour for token cache to expire) for the UI to reflect the change.

---

## Stripe: PayNow Stacking & Card/PayNow Switching

**What changed:** Checkout used to reject any purchase while `subscription_status === 'active'`. It no longer does — PayNow purchases always stack, and switching between card and PayNow is allowed at any point, in either direction. Logic lives in `backend/src/services/billingService.ts`.

**Scenarios and what happens:**

| Starting state | Action | Result |
|---|---|---|
| PayNow, N days left | Buy another PayNow plan | New period's duration is added on top of the existing `access_expires_at` (stacks, does not restart from today) |
| PayNow, N days left | Start a card subscription | Checkout session is created with `subscription_data.trial_end = access_expires_at` — card isn't charged until the PayNow period actually ends. Tier flips to `paid` immediately (already was), `access_expires_at` clears to `null` since the Stripe subscription is now the source of truth |
| Active card subscription | Buy a PayNow plan | The card subscription is set to `cancel_at_period_end: true` (no double-billing next cycle); the PayNow period is computed from that subscription item's `current_period_end`, not from today |
| Active card subscription | Start another card subscription | Blocked — `findActiveSubscription()` finds the existing active/trialing subscription and throws. This is the only remaining checkout block; user is directed to the billing portal |

**Where to look when debugging:**
- `findActiveSubscription()` — lists a customer's subscriptions and returns one with status `active` or `trialing`.
- `checkout.session.completed` webhook handler, `mode === 'payment'` branch — computes the PayNow stacking baseline (existing `access_expires_at` if still future, else an active card subscription's `items.data[0].current_period_end`, else now).
- `revokePaidTier()` — before downgrading on `customer.subscription.updated`/`deleted` (canceled/past_due/unpaid), it checks whether `access_expires_at` is still in the future and no-ops if so. This matters because a card→PayNow rollover's scheduled `cancel_at_period_end` fires its own cancellation webhook later — without this guard it would wipe out the PayNow access that already replaced it.

**Testing locally:** with `stripe listen` forwarding (see below), buy PayNow, then immediately buy PayNow again — check `users.access_expires_at` advanced by a full extra period rather than resetting. Then start a card subscription — check the Stripe Dashboard shows the subscription as `trialing` with `trial_end` matching `access_expires_at`, not charged yet. Stripe's [test clocks](https://docs.stripe.com/billing/testing/test-clocks) are useful for fast-forwarding past a trial/period end without waiting in real time.

---

## Stripe: Dev Webhook Forwarding

Run in a separate terminal whenever testing any checkout or billing flow locally. Must be running for webhooks to reach `localhost`.

```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
```

Copy the printed `whsec_...` into `backend/.env` as `STRIPE_WEBHOOK_SECRET`. Each developer gets their own unique `whsec_...` — the Stripe secret key and price IDs are shared across the team, but `STRIPE_WEBHOOK_SECRET` is per-machine.

`stripe listen` with no `--events` flag forwards every event type, so `invoice.payment_succeeded` (renewal receipts) reaches `localhost` automatically — no extra config needed for local dev.

---

## Cloud Run: Map a Custom Domain

**When:** You want the app served from a real domain (e.g. `app.markr.com`) instead of the auto-generated `math-trainer-xxxxx.a.run.app` URL. Do this **before** the Stripe live-mode webhook and before inviting real users, because the Stripe webhook URL, `FRONTEND_URL`/`CORS_ORIGIN`, and Firebase authorized domains all need to point at the final domain.

**Prerequisite:** A deployed, working Cloud Run service (see `.planning/DEPLOYMENT.md`) and access to your domain registrar's DNS. This is unrelated to the Resend email-sending domain — that one only signs outbound mail and can be a completely different domain; this one is where the browser loads the app.

> **The `*.run.app` URL keeps working throughout.** Nothing below breaks it. The cutover is additive until Step 4, where you *choose* to make the custom domain the canonical origin. Do Steps 1–3 first, confirm the domain serves the app over HTTPS, and only then flip env/Firebase/Stripe (Steps 4–6) — so you never point a webhook or an OAuth redirect at a domain whose TLS cert hasn't provisioned yet.

### Step 1 — Verify domain ownership

Cloud Run only maps domains you've proven you own.

```bash
gcloud domains verify yourdomain.com
```

This opens Google Search Console; add the TXT record it shows to your registrar and confirm. (Verifying the apex `yourdomain.com` also covers its subdomains like `app.`.)

### Step 2 — Create the domain mapping

Prefer a **subdomain** (`app.yourdomain.com`) over the apex — the apex can only use A/AAAA records, while a subdomain uses a single CNAME and gets a Google-managed TLS cert with no fuss.

```bash
gcloud beta run domain-mappings create \
  --service math-trainer \
  --domain app.yourdomain.com \
  --region asia-southeast1
```

> **Region caveat:** Cloud Run domain mappings aren't available in every region. If this command rejects `asia-southeast1`, use the load-balancer fallback in the box at the end of this section instead — the rest of the steps (DNS aside) are identical.

### Step 3 — Add the DNS records and wait for TLS

The command prints the exact record(s) to create at your registrar:
- **Subdomain (recommended):** one `CNAME` → `ghs.googlehosted.com.`
- **Apex/naked domain:** the four `A` records + four `AAAA` records Google lists (registrars that don't support ALIAS/ANAME at the apex can't CNAME).

> **Cloudflare (or any proxying CDN) — keep these records "DNS only" (grey cloud), NOT "Proxied" (orange).** Cloudflare will nag that *"proxying is required for most security and performance features"* — ignore it for a Cloud Run domain mapping. Leave every A/AAAA (or CNAME) record unproxied, for three reasons:
> 1. **Certificate.** Cloud Run provisions and auto-renews its own Google-managed TLS cert, which requires the domain to resolve **directly to Google's IPs**. Proxying puts Cloudflare's own cert/edge in front and Cloud Run's cert issuance stalls indefinitely (`CertificatePending`).
> 2. **WebSockets.** The Socket.IO "upload via phone" flow relies on the direct connection; routing it through Cloudflare's proxy adds a layer that must be configured for WS or the QR pairing breaks.
> 3. **Rate limiting.** The app keys its limiters on client IP with `trust proxy = 1` (`TRUST_PROXY_HOPS`), expecting **only** Google's front end in front. Behind Cloudflare's proxy every request arrives from a Cloudflare edge IP, collapsing all users into one bucket unless `TRUST_PROXY_HOPS` is bumped and `CF-Connecting-IP` handling is added.
>
> **Security is not reduced by staying grey:** traffic is still end-to-end encrypted by Google's managed cert (and a `.app` domain is HSTS-preloaded, so HTTPS is mandatory browser-side), and the app already enforces app-layer rate limits, per-user cooldowns, daily quotas, and sits behind Google's network-level DDoS protection. Cloudflare's edge WAF/CDN/DDoS is an *optional* future enhancement — enable it only deliberately, together with the `TRUST_PROXY_HOPS`/websocket changes (or by fronting Cloud Run with an external load balancer), never as a casual toggle.

After the records propagate, Google **auto-provisions a managed TLS certificate** — no cert to buy or configure. This takes anywhere from ~15 minutes to a few hours. Track it with:

```bash
gcloud beta run domain-mappings describe --domain app.yourdomain.com --region asia-southeast1
```

Wait until it reports the cert as ready and `https://app.yourdomain.com` loads the app before continuing.

### Step 4 — Point the app's own origin at the custom domain

`FRONTEND_URL` and `CORS_ORIGIN` currently hold the `*.run.app` URL (see `.planning/DEPLOYMENT.md`). `CORS_ORIGIN` is a **single** allow-listed origin and `FRONTEND_URL` is what Stripe uses for checkout success/cancel redirects — both must become the custom domain, or the browser will be blocked by CORS and Stripe will bounce users back to the old URL.

```bash
gcloud run services update math-trainer --region asia-southeast1 \
  --update-env-vars FRONTEND_URL=https://app.yourdomain.com,CORS_ORIGIN=https://app.yourdomain.com
```

(This is an env-only change — it doesn't rebuild the image. `scripts/deploy.sh` re-asserts the scaling flags but not env, so this can be done independently of a code deploy.) Because everything is same-origin single-container, the QR-pairing URL (`window.location.origin`), the relative `/api` fetches, and the same-origin `io()` socket all follow the custom domain automatically once users load it there — no frontend rebuild needed.

### Step 5 — Add the domain to Firebase authorized domains

Firebase Authentication rejects sign-in redirects from origins not on its allow-list.

- Firebase Console → **Authentication** → **Settings** → **Authorized domains** → **Add domain** → `app.yourdomain.com`.

Leave the `*.run.app` domain on the list too if you still test against it. (This is the same step listed in `.planning/DEPLOYMENT.md` → Post-deploy one-offs, now pointed at the real domain.)

### Step 6 — Update the Stripe webhook endpoint

The live webhook must target the custom domain so signature verification and event delivery hit the canonical origin.

- Stripe Dashboard → **Developers → Webhooks** → edit the endpoint (or add a new one and delete the old) → URL `https://app.yourdomain.com/api/billing/webhook`.
- Keep the same subscribed events (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.deleted`, `invoice.payment_succeeded`).
- If you created a **new** endpoint, its signing secret changes — copy the new `whsec_...` into the `STRIPE_WEBHOOK_SECRET` secret and redeploy. Editing the URL on an existing endpoint keeps the secret unchanged.

### Step 7 — Smoke-test on the custom domain

- `https://app.yourdomain.com/health` returns OK.
- Sign in (proves the Firebase authorized-domain change).
- Run a QR photo-grade from a phone on mobile data (proves WebSockets survive the new routing).
- Stripe test-mode (or live-mode test-card) checkout → confirm the success redirect lands on `app.yourdomain.com` and the webhook shows a 2xx in the Stripe delivery log.

> **Fallback — region without domain-mapping support (external Application Load Balancer):** If Step 2 fails on region, put a **Global external Application Load Balancer** in front of the service: reserve a global static IP, create a **serverless NEG** targeting the Cloud Run service, attach it to a backend service, add a Google-managed SSL cert for `app.yourdomain.com`, and point an **A record** at the reserved IP. Enable **session affinity** on the backend service (generated-cookie or client-IP) to preserve the single-instance pairing/socket stickiness. **One extra required change:** an external LB adds a proxy hop, so set `TRUST_PROXY_HOPS=2` (see `CLAUDE.md` → *Authentication & Tiers* → `trust proxy`) or every IP-keyed rate limiter collapses to one bucket. Steps 4–7 are otherwise unchanged.

---

## Transactional Emails: Resend Setup

**When:** Before the welcome, first-purchase, PayNow-expiry-reminder, or receipt emails can actually deliver to real inboxes (see `CLAUDE.md` → Transactional Emails). Code ships with placeholder env vars and works for local testing against Resend's own sandbox, but production sending needs a verified domain.

### Step 1 — Create a Resend API key

Dashboard → API Keys → Create API Key. Copy the `re_...` value into `backend/.env` as `RESEND_API_KEY`.

Without any domain verification, Resend still lets you send test emails **from `onboarding@resend.dev` to the email address on your own Resend account only** — enough to sanity-check templates locally, not enough for real users.

**Multiple developers testing locally, before a domain is verified:** this restriction is per Resend account, not per project — there's no way to allowlist a teammate's inbox on your account. Each teammate should sign up for their own free Resend account and put their own `re_...` key in their own local `backend/.env` (never committed); each of you then only ever receives test sends in your own inbox. Once a domain is verified (see below), this stops mattering — swap everyone back to a single shared production key and any real recipient works.

### Step 2 — Verify a sending domain

Dashboard → Domains → Add Domain. Resend gives you a handful of DNS records (SPF/DKIM, and DMARC if you opt in) to add at your domain registrar. Verification typically takes a few minutes to a few hours depending on DNS propagation.

### Step 3 — Set `EMAIL_FROM`

Once the domain shows "Verified":

```
EMAIL_FROM="Markr <noreply@yourdomain.com>"
```

The local part (`noreply`) can be anything; the domain must match the one just verified.

### Step 4 — Fill in receipt/business identity env vars

```
BUSINESS_NAME=Your Actual Business Name Pte. Ltd.
BUSINESS_UEN=                # optional — leave blank if not applicable
SUPPORT_EMAIL=support@yourdomain.com
```

These appear on every email footer and on the receipt. This is a best-effort simple receipt (reference number, date, description, amount) — it does not implement GST/IRAS tax-invoice formatting; consult an accountant before treating it as a compliant tax invoice if the business becomes GST-registered.

### Step 5 — Smoke-test each of the four classes

**Do this step twice: once now (sandbox, pre-domain) with your own Resend account email as the recipient, and once again after Step 2's domain shows "Verified," using a *different* real inbox — ideally a teammate's, or a second personal address on a different provider (Gmail vs. Outlook).** The first pass only proves the code logic (trigger conditions, content, dedup) is correct — it can't prove arbitrary users will actually receive anything, because sandbox mode only ever delivers to the account owner's own address regardless of what the code does. The second pass, after verification, is what actually confirms the point of getting a domain: that any real user's inbox works, not just yours. Skipping this second pass means deploying with the domain-verified path completely untested.

- **Welcome:** sign in with a brand-new Firebase account (or a test account whose `users.welcome_email_sent_at` you've nulled out) — fires from any authenticated request.
- **First-purchase + receipt:** run through `POST /api/billing/checkout` with a [Stripe test card](https://docs.stripe.com/testing) or PayNow test flow, with `stripe listen` running (see above).
- **Renewal receipt:** use a Stripe [test clock](https://docs.stripe.com/billing/testing/test-clocks) to fast-forward a card subscription past its period end and trigger `invoice.payment_succeeded`.
- **PayNow expiry reminder:** the cron only runs once/day at 09:00 SGT, so to test on demand, set a test account's expiry into the reminder window and call the job directly:

  ```bash
  # In Supabase SQL Editor — pull a PayNow test account's expiry into the reminder window
  UPDATE users SET access_expires_at = now() + interval '2 days', subscription_status = 'active'
  WHERE email = 'test@example.com';
  ```

  ```bash
  # Then, from backend/, run the reminder job directly instead of waiting for the cron tick
  npx tsx -e "import('./src/jobs/payNowExpiryReminder.js').then(m => m.runPayNowExpiryReminders())"
  ```

  Re-running it the same day should be a no-op (dedup via `last_expiry_reminder_sent_on`) — reset that column to `null` on the test row to force a re-send while iterating.
