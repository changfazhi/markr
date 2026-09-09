# Deploy & Smoke Test Checklist — Markr on Cloud Run

Everything you need to run, in order, when you're ready to go live. Nothing in this file
has been run yet — the app is **not deployed**. Background/decisions: `.planning/DEPLOYMENT.md`.

---

## Phase 0 — Rehearse locally with Docker (no cloud, no cost, safe to repeat)

Do this on any machine with Docker installed. It proves the exact container Cloud Run will run.

```bash
cd ~/ProjectMath
docker build -t math-trainer .
docker run --env-file backend/.env -e PORT=8080 -p 8080:8080 math-trainer
```

Then check, in a browser:

- [ ] `http://localhost:8080` — app loads (frontend served by the backend)
- [ ] `http://localhost:8080/health` — returns `{"status":"ok"}`
- [ ] Open a practice question, then **hard-refresh** (Cmd+Shift+R) — page must reload, not 404 (SPA fallback)
- [ ] Sign in, answer a question, check it grades
- [ ] **QR flow:** open `http://<your-LAN-IP>:8080` (find it: `ipconfig getifaddr en0`), click "📱 Upload via phone", scan with your phone on the same Wi-Fi, send a photo — it should appear on the desktop and grade

If all of that passes, the container is good. Stop it with Ctrl+C.

---

## Phase 1 — One-time Google Cloud setup

1. Create a project at https://console.cloud.google.com (or reuse your Firebase project — same project keeps things simple).
2. **Enable billing** on the project (required for Cloud Run, even inside the free tier).
3. Install the gcloud CLI: https://cloud.google.com/sdk/docs/install
4. Log in and point it at your project (run these yourself — they're interactive):

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
```

5. Put the sensitive keys in Secret Manager (values come from `backend/.env`):

```bash
printf '%s' 'THE_VALUE' | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-
printf '%s' 'THE_VALUE' | gcloud secrets create GEMINI_API_KEY --data-file=-
printf '%s' 'THE_VALUE' | gcloud secrets create FIREBASE_PRIVATE_KEY --data-file=-
printf '%s' 'THE_VALUE' | gcloud secrets create STRIPE_SECRET_KEY --data-file=-
# STRIPE_WEBHOOK_SECRET comes later — you only get it after creating the webhook in Phase 3
```

> ⚠️ `FIREBASE_PRIVATE_KEY` in `.env` has literal `\n` sequences — paste it exactly as it
> appears in `.env` (quotes stripped); the backend converts `\n` to newlines itself.

---

## Phase 2 — Deploy

From the repo root (`~/ProjectMath`):

```bash
gcloud run deploy math-trainer \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --max-instances=1 \
  --min-instances=1 \
  --session-affinity \
  --no-cpu-throttling \
  --timeout=3600 \
  --concurrency=250 \
  --memory=512Mi \
  --set-secrets=SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,FIREBASE_PRIVATE_KEY=FIREBASE_PRIVATE_KEY:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest \
  --set-env-vars=SUPABASE_URL=...,FIREBASE_PROJECT_ID=...,FIREBASE_CLIENT_EMAIL=...,STRIPE_PRICE_MONTHLY=...,STRIPE_PRICE_SEMESTERLY=...,STRIPE_PRICE_MONTHLY_PAYNOW=...,STRIPE_PRICE_SEMESTERLY_PAYNOW=...
```

Fill the `...` values from `backend/.env`. First deploy takes a few minutes (Cloud Build
builds the Dockerfile). It prints a service URL like `https://math-trainer-xxxxx.a.run.app` — copy it.

Then set the URL-dependent vars (they didn't exist until now):

```bash
gcloud run services update math-trainer --region asia-southeast1 \
  --set-env-vars=CORS_ORIGIN=https://YOUR-RUN-URL,FRONTEND_URL=https://YOUR-RUN-URL
```

> ⚠️ **Never raise `--max-instances` above 1.** Phone-upload pairing and rate limiting keep
> state in memory; a second instance breaks them silently. See `.planning/DEPLOYMENT.md`.

> ⚠️ **`--no-cpu-throttling` is load-bearing, not an optimization.** By default Cloud Run
> allocates CPU only while a request is in flight — between requests the instance is frozen,
> so the in-process `node-cron` job (the 09:00 SGT PayNow expiry-reminder email) would simply
> never fire on an idle instance, and the pairing-expiry timers would drift. This flag keeps
> CPU allocated for the instance's whole lifetime.

> 💰 `--min-instances=1` keeps one instance always warm and avoids cold starts. Combined with
> `--no-cpu-throttling` this bills the instance continuously (roughly US$15–25/mo for this size)
> rather than per-request. While you're just testing, you can use `--min-instances=0` and accept
> a few seconds' cold start — but know that at zero instances the daily reminder cron only runs
> if traffic happens to keep an instance alive at 09:00 SGT.

---

## Phase 3 — Connect Stripe & Firebase to the live URL

**Stripe webhook:**
1. Dashboard → Developers → Webhooks → Add endpoint: `https://YOUR-RUN-URL/api/billing/webhook`
   (path confirmed in `backend/src/routes/billing.ts`).
2. Subscribe to the same events your local `stripe listen` handled (checkout + subscription events).
3. Copy the signing secret (`whsec_...`), then:

```bash
printf '%s' 'whsec_...' | gcloud secrets create STRIPE_WEBHOOK_SECRET --data-file=-
gcloud run services update math-trainer --region asia-southeast1 \
  --set-secrets=STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest
```

**Firebase:** Console → Authentication → Settings → Authorized domains → add `YOUR-RUN-URL`'s domain
(else Google/email sign-in is rejected on the live site).

---

## Phase 4 — Live smoke test (the actual checklist)

On the deployed URL:

- [ ] `https://YOUR-RUN-URL/health` returns `{"status":"ok"}`
- [ ] App loads; hard-refresh on a deep link (`/practice/...`) still works
- [ ] Sign in works (proves Firebase authorized-domain step)
- [ ] Load a question, submit a typed answer — grades correctly (proves Supabase)
- [ ] AI hint chat replies (proves Gemini key)
- [ ] Photo grading via file upload works (proves Gemini vision + Storage bucket)
- [ ] **The big one — QR flow over the real internet:** desktop on the run.app URL, phone on
      **mobile data (Wi-Fi off)**, scan QR, send photos, Done → feedback appears on desktop.
      This proves WebSockets work through Cloud Run's front end end-to-end.
- [ ] Stripe **test-mode** checkout completes and the tier upgrades
      (check Dashboard → Webhooks → your endpoint → recent deliveries are `200`)
- [ ] Leave the tab idle 10+ minutes, come back, start a new QR pairing — still works
      (socket auto-reconnect after idle timeouts)

If something fails, read logs:

```bash
gcloud run services logs read math-trainer --region asia-southeast1 --limit 50
```

---

## Rollback / turn it off

- Roll back to the previous revision: Console → Cloud Run → math-trainer → Revisions → route traffic to the older one.
- Turn it off entirely (stops all cost except storage): `gcloud run services delete math-trainer --region asia-southeast1`
- Remember: going live means strangers can hit your Gemini-backed endpoints. Your per-IP rate
  limits and free-tier daily quotas are the cost guardrails — keep Stripe in **test mode** until
  you've watched a few days of real traffic.
