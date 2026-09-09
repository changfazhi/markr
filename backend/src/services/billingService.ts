import type Stripe from 'stripe';
import { getStripe } from '../db/stripe.js';
import { supabase } from '../db/supabase.js';
import { unwrap } from '../db/unwrap.js';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdmin } from '../db/firebase.js';
import { sendFirstPurchaseEmail, sendReceiptEmail } from './emailService.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

// Raised when the payload didn't come from Stripe — the route answers 400 and there is
// nothing to retry. Every other webhook failure is a 500 so Stripe redelivers.
export class WebhookSignatureError extends Error {
  constructor() {
    super('Webhook signature verification failed');
    this.name = 'WebhookSignatureError';
  }
}

/**
 * A checkout precondition the user can act on (e.g. they already hold a card subscription). Its
 * message is written for the user, so the route surfaces it verbatim; every other failure from
 * `createCheckoutSession` is internal and must be genericised instead (issue #58).
 */
export class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutError';
  }
}

async function findActiveSubscription(stripe: Stripe, customerId: string): Promise<Stripe.Subscription | null> {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
  return subs.data.find((s) => s.status === 'active' || s.status === 'trialing') ?? null;
}

export async function createCheckoutSession(
  userId: string,
  firebaseUid: string,
  email: string,
  priceId: string,
  method: 'card' | 'paynow',
  plan: 'monthly' | 'semesterly',
): Promise<{ url: string }> {
  const stripe = getStripe();

  const row = unwrap(
    await supabase
      .from('users')
      .select('stripe_customer_id, subscription_status, access_expires_at')
      .eq('id', userId)
      .maybeSingle(),
    `Failed to load user ${userId}`,
  ) as {
    stripe_customer_id: string | null;
    subscription_status: string | null;
    access_expires_at: string | null;
  } | null;

  let customerId = row?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { user_id: userId, firebase_uid: firebaseUid },
    });
    customerId = customer.id;
    // A dropped write here would strand a paying customer: Stripe has the customer, we don't.
    await updateUserOrThrow(userId, { stripe_customer_id: customerId });
  }

  // Verify the stored customer still exists in Stripe (guards against manual Dashboard deletions).
  try {
    const existing = await stripe.customers.retrieve(customerId);
    if ((existing as { deleted?: boolean }).deleted) throw new Error('deleted');
  } catch {
    const customer = await stripe.customers.create({
      email,
      metadata: { user_id: userId, firebase_uid: firebaseUid },
    });
    customerId = customer.id;
    await updateUserOrThrow(userId, { stripe_customer_id: customerId, subscription_status: null });
  }

  if (method === 'paynow') {
    // Always allowed — stacks on top of any remaining access and cancels an active
    // card subscription at period end (see the webhook handler for both).
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['paynow'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/roadmap?checkout=success`,
      cancel_url: `${FRONTEND_URL}/roadmap?checkout=canceled`,
      metadata: { user_id: userId, firebase_uid: firebaseUid, paynow_plan: plan },
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return { url: session.url };
  }

  // Card subscription — block only a genuine duplicate (another card subscription already running).
  const activeCardSub = await findActiveSubscription(stripe, customerId);
  if (activeCardSub) {
    throw new CheckoutError(
      'You already have an active card subscription. Manage or cancel it from the billing portal before starting a new one.',
    );
  }

  // If PayNow access is still running, delay the first charge until it runs out instead
  // of double-billing during the overlap.
  const payNowExpiryMs = row?.access_expires_at ? new Date(row.access_expires_at).getTime() : null;
  const trialEnd =
    payNowExpiryMs !== null && payNowExpiryMs > Date.now() + 60_000
      ? Math.floor(payNowExpiryMs / 1000)
      : undefined;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: trialEnd ? { trial_end: trialEnd } : undefined,
    success_url: `${FRONTEND_URL}/roadmap?checkout=success`,
    cancel_url: `${FRONTEND_URL}/roadmap?checkout=canceled`,
    metadata: { user_id: userId, firebase_uid: firebaseUid },
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return { url: session.url };
}

export interface BillingStatus {
  subscriptionStatus: string | null;
  accessExpiresAt: string | null; // PayNow: stored expiry (no auto-renewal)
  renewsAt: string | null; // Card: live current_period_end from Stripe (auto-renews)
}

export async function getBillingStatus(userId: string): Promise<BillingStatus> {
  const row = unwrap(
    await supabase
      .from('users')
      .select('stripe_customer_id, subscription_status, access_expires_at')
      .eq('id', userId)
      .maybeSingle(),
    `Failed to load billing status for user ${userId}`,
  ) as {
    stripe_customer_id: string | null;
    subscription_status: string | null;
    access_expires_at: string | null;
  } | null;

  if (!row) return { subscriptionStatus: null, accessExpiresAt: null, renewsAt: null };

  // PayNow access has a stored expiry and never auto-renews — no need to hit Stripe. A lapsed
  // expiry is retained on the row (see requireAuth), so only report it while it's still running,
  // otherwise /profile would show an ended plan as current with a negative days-left.
  if (row.access_expires_at && new Date(row.access_expires_at) > new Date()) {
    return { subscriptionStatus: row.subscription_status, accessExpiresAt: row.access_expires_at, renewsAt: null };
  }

  // Card subscriptions auto-renew and their period end isn't persisted anywhere —
  // fetch it live from Stripe so "days left" stays accurate without a webhook/column to keep in sync.
  if (row.subscription_status === 'active' && row.stripe_customer_id) {
    const stripe = getStripe();
    const activeSub = await findActiveSubscription(stripe, row.stripe_customer_id);
    const currentPeriodEnd = activeSub?.items.data[0]?.current_period_end;
    if (currentPeriodEnd) {
      return {
        subscriptionStatus: row.subscription_status,
        accessExpiresAt: null,
        renewsAt: new Date(currentPeriodEnd * 1000).toISOString(),
      };
    }
  }

  return { subscriptionStatus: row.subscription_status, accessExpiresAt: null, renewsAt: null };
}

export async function createPortalSession(userId: string): Promise<{ url: string }> {
  const stripe = getStripe();

  const userData = unwrap(
    await supabase.from('users').select('stripe_customer_id').eq('id', userId).maybeSingle(),
    `Failed to load user ${userId}`,
  ) as { stripe_customer_id: string | null } | null;

  const customerId = userData?.stripe_customer_id;
  if (!customerId) throw new Error('No Stripe customer found for this user');

  // Guard against stale customer IDs (e.g. manually deleted from Stripe Dashboard).
  try {
    const existing = await stripe.customers.retrieve(customerId);
    if ((existing as { deleted?: boolean }).deleted) throw new Error('deleted');
  } catch {
    await updateUserOrThrow(userId, { stripe_customer_id: null, subscription_status: null });
    throw new Error('Stripe customer no longer exists. Please subscribe again.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${FRONTEND_URL}/roadmap`,
  });

  return { url: session.url };
}

// supabase-js reports failures on the result object rather than throwing. An unchecked
// write here would leave the user's tier state unchanged — and, because the webhook would
// still return 2xx, no retry would ever correct it.
async function updateUserOrThrow(userId: string, patch: Record<string, string | null>): Promise<void> {
  const { error } = await supabase.from('users').update(patch).eq('id', userId);
  if (error) throw new Error(`Failed to update user ${userId}: ${error.message}`);
}

// The row is written before the Firebase claim in all three functions below. `requireAuth`
// derives the request's tier from the row (see `deriveTier`), so the row landing is what
// actually unlocks or locks Premium; the claim is a hint the frontend paints from before
// `GET /api/me` answers. Writing the row first means a Firebase outage can delay the UI but
// can never leave a cancelled user with paid access, nor a paying user without it.

async function grantPaidTier(firebaseUid: string, userId: string): Promise<void> {
  await updateUserOrThrow(userId, { subscription_status: 'active', access_expires_at: null });
  await getAuth(getFirebaseAdmin()).setCustomUserClaims(firebaseUid, { tier: 'paid' });
}

async function grantPayNowTier(firebaseUid: string, userId: string, expiresAt: Date): Promise<void> {
  await updateUserOrThrow(userId, {
    subscription_status: 'active',
    access_expires_at: expiresAt.toISOString(),
  });
  await getAuth(getFirebaseAdmin()).setCustomUserClaims(firebaseUid, {
    tier: 'paid',
    expires_at: expiresAt.toISOString(),
  });
}

async function revokePaidTier(firebaseUid: string, userId: string, status: string): Promise<void> {
  // A card subscription can end because it was scheduled to cancel at period end after the
  // user rolled over to PayNow (see checkout.session.completed above) — if PayNow access is
  // still running, leave the tier alone instead of clobbering it. An unchecked read here would
  // report a database error as "no expiry" and revoke a user who has paid time remaining.
  const data = unwrap(
    await supabase.from('users').select('access_expires_at').eq('id', userId).maybeSingle(),
    `Failed to read access expiry for user ${userId}`,
  ) as { access_expires_at: string | null } | null;
  const accessExpiresAt = data?.access_expires_at;
  if (accessExpiresAt && new Date(accessExpiresAt) > new Date()) return;

  // `access_expires_at` is left as-is: it is either already null (card subscription) or already
  // in the past (the guard above returned otherwise), so clearing it would only destroy the
  // state requireAuth uses to keep deriving `free`.
  await updateUserOrThrow(userId, { subscription_status: status });
  await getAuth(getFirebaseAdmin()).setCustomUserClaims(firebaseUid, { tier: 'free' });
}

async function lookupUserByCustomer(
  customerId: string,
): Promise<{ id: string; firebase_uid: string; email: string | null } | null> {
  return unwrap(
    await supabase
      .from('users')
      .select('id, firebase_uid, email')
      .eq('stripe_customer_id', customerId)
      .maybeSingle(),
    `Failed to look up user for customer ${customerId}`,
  ) as { id: string; firebase_uid: string; email: string | null } | null;
}

// Marks the once-ever "first purchase" flag atomically (only the caller that flips it from
// NULL actually sends) and, only then, sends the congrats email. If the send fails, the
// claim is rolled back so the next transaction retries instead of the account being
// permanently marked "congratulated" with nothing ever delivered.
async function sendFirstPurchaseEmailIfNeeded(userId: string, email: string): Promise<void> {
  // Checking `error` matters here: without it a database failure is indistinguishable from
  // "0 rows claimed" — i.e. "already congratulated" — and the email is dropped for good.
  const claimed = unwrap(
    await supabase
      .from('users')
      .update({ first_purchase_email_sent_at: new Date().toISOString() })
      .eq('id', userId)
      .is('first_purchase_email_sent_at', null)
      .select('id'),
    `Failed to claim first-purchase email for user ${userId}`,
  ) as Array<{ id: string }> | null;

  if (claimed && claimed.length > 0) {
    const sent = await sendFirstPurchaseEmail(email);
    if (!sent) {
      await updateUserOrThrow(userId, { first_purchase_email_sent_at: null });
    }
  }
}

const UNIQUE_VIOLATION = '23505';

// How long a claimed-but-unfinished event is left alone before another delivery may take
// it over. Bounds the damage from a process that dies mid-handler.
const CLAIM_LEASE_MS = 5 * 60_000;

/**
 * Take exclusive ownership of a Stripe event before any side effect runs.
 *
 * Stripe delivers at-least-once, and the PayNow grant is relative (it adds a period onto the
 * stored expiry), so replaying one payment's event would hand out a second period. The primary
 * key on `stripe_events` makes the claim atomic without a lock.
 *
 * Returns true when this delivery owns the event, false when it was already fulfilled (the
 * caller should ack with 2xx so Stripe stops retrying). Throws when another delivery holds a
 * live claim, so Stripe backs off and retries rather than running the handler twice.
 */
async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const { error } = await supabase.from('stripe_events').insert({ id: event.id, type: event.type });
  if (!error) return true;
  if (error.code !== UNIQUE_VIOLATION) {
    throw new Error(`Failed to claim event ${event.id}: ${error.message}`);
  }

  const row = unwrap(
    await supabase.from('stripe_events').select('status, claimed_at').eq('id', event.id).maybeSingle(),
    `Failed to read back event ${event.id}`,
  ) as { status: string; claimed_at: string } | null;

  if (!row) throw new Error(`Event ${event.id} conflicted but could not be read back`);
  if (row.status === 'completed') return false;

  // Still 'processing': either a concurrent delivery is mid-flight, or a previous one died
  // before finishing. Only take over once its lease has expired.
  const staleBefore = new Date(Date.now() - CLAIM_LEASE_MS);
  if (new Date(row.claimed_at).getTime() > staleBefore.getTime()) {
    throw new Error(`Event ${event.id} is already being processed`);
  }

  const taken = unwrap(
    await supabase
      .from('stripe_events')
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', event.id)
      .eq('status', 'processing')
      .lt('claimed_at', staleBefore.toISOString())
      .select('id'),
    `Failed to take over stale claim on event ${event.id}`,
  ) as Array<{ id: string }> | null;

  if (!taken || taken.length === 0) throw new Error(`Event ${event.id} was claimed by another delivery`);
  return true;
}

// Promotes the claim to 'completed'. Only reached once the handler has fully succeeded — a
// throw anywhere above leaves the row 'processing' so the lease expires and Stripe's retry re-runs it.
async function completeEvent(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('stripe_events')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', eventId);
  if (error) throw new Error(`Failed to complete event ${eventId}: ${error.message}`);
}

// The absolute PayNow expiry computed on the first delivery is stashed on the event row so a
// replay writes the same value rather than re-adding a period onto the already-extended
// access_expires_at (issue #61). `getStoredExpiry` returns it when present; `setStoredExpiry`
// persists it *before* the grant, and throws on a failed write so a dropped persist stops short
// of granting rather than proceeding to compute a fresh (compounding) expiry on the next retry.
async function getStoredExpiry(eventId: string): Promise<Date | null> {
  const row = unwrap(
    await supabase.from('stripe_events').select('computed_expires_at').eq('id', eventId).maybeSingle(),
    `Failed to read stored expiry for event ${eventId}`,
  ) as { computed_expires_at: string | null } | null;
  return row?.computed_expires_at ? new Date(row.computed_expires_at) : null;
}

async function setStoredExpiry(eventId: string, expiresAt: Date): Promise<void> {
  const { error } = await supabase
    .from('stripe_events')
    .update({ computed_expires_at: expiresAt.toISOString() })
    .eq('id', eventId);
  if (error) throw new Error(`Failed to store expiry for event ${eventId}: ${error.message}`);
}

export async function handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error('Missing STRIPE_WEBHOOK_SECRET');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    throw new WebhookSignatureError();
  }

  // Must precede every side effect below, including the Stripe API calls (cancel_at_period_end).
  if (!(await claimEvent(event))) return;

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const firebaseUid = session.metadata?.firebase_uid;
      if (!userId || !firebaseUid) break;

      // This read decides how much access to grant. An unchecked error would read as "no row":
      // the PayNow baseline would silently reset to today (discarding time the user paid for)
      // and the card→PayNow rollover would be skipped, double-billing them. Throw instead, so
      // the route answers 500 and Stripe redelivers.
      const row = unwrap(
        await supabase
          .from('users')
          .select('email, access_expires_at, stripe_customer_id')
          .eq('id', userId)
          .maybeSingle(),
        `Failed to load user ${userId} while granting access`,
      ) as {
        email: string | null;
        access_expires_at: string | null;
        stripe_customer_id: string | null;
      } | null;
      const email = session.customer_details?.email ?? row?.email ?? null;

      if (session.mode === 'subscription') {
        await grantPaidTier(firebaseUid, userId);
      } else if (session.mode === 'payment') {
        // On a replay of a delivery that granted but failed to mark itself completed, reuse the
        // absolute expiry we computed the first time so the grant converges to the same value
        // instead of stacking a second period onto the already-extended baseline (issue #61).
        let expiresAt = await getStoredExpiry(event.id);
        if (!expiresAt) {
          const paynowPlan = session.metadata?.paynow_plan as 'monthly' | 'semesterly' | undefined;
          const msToAdd = paynowPlan === 'semesterly'
            ? 180 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;

          // Stack onto remaining PayNow access; otherwise roll over from an active card
          // subscription (canceling it at period end) so there's no gap or overlap.
          let baselineMs = Date.now();
          const existingExpiryMs = row?.access_expires_at ? new Date(row.access_expires_at).getTime() : null;
          if (existingExpiryMs !== null && existingExpiryMs > baselineMs) {
            baselineMs = existingExpiryMs;
          } else if (row?.stripe_customer_id) {
            const activeSub = await findActiveSubscription(stripe, row.stripe_customer_id);
            const currentPeriodEnd = activeSub?.items.data[0]?.current_period_end;
            if (activeSub && currentPeriodEnd) {
              baselineMs = currentPeriodEnd * 1000;
              await stripe.subscriptions.update(activeSub.id, { cancel_at_period_end: true });
            }
          }

          expiresAt = new Date(baselineMs + msToAdd);
          // Persist BEFORE granting: every crash window before this point is also before the
          // grant, where access_expires_at is untouched and a recompute is still correct.
          await setStoredExpiry(event.id, expiresAt);
        }
        await grantPayNowTier(firebaseUid, userId, expiresAt);
      }

      // Email side-effects — fire-and-forget, must never fail the webhook response.
      if (email) {
        sendFirstPurchaseEmailIfNeeded(userId, email).catch(() => {});
        if (session.amount_total != null && session.currency) {
          const description = session.mode === 'subscription'
            ? 'Markr Premium — card subscription'
            : `Markr Premium — PayNow (${session.metadata?.paynow_plan ?? 'plan'})`;
          sendReceiptEmail(email, {
            reference: session.id,
            date: new Date(event.created * 1000),
            description,
            amountCents: session.amount_total,
            currency: session.currency,
          }).catch(() => {});
        }
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      // Only recurring renewal charges — the first invoice on a new subscription
      // (billing_reason 'subscription_create') is already receipted above via
      // checkout.session.completed, so sending here too would double up.
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason !== 'subscription_cycle') break;

      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;
      const user = await lookupUserByCustomer(customerId);
      if (!user?.email) break;

      await sendReceiptEmail(user.email, {
        reference: invoice.id,
        date: new Date(event.created * 1000),
        description: 'Markr Premium — subscription renewal',
        amountCents: invoice.amount_paid,
        currency: invoice.currency,
      });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const { status } = sub;
      if (status !== 'canceled' && status !== 'past_due' && status !== 'unpaid') break;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const user = await lookupUserByCustomer(customerId);
      if (!user) break;
      await revokePaidTier(user.firebase_uid, user.id, status);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const user = await lookupUserByCustomer(customerId);
      if (!user) break;
      await revokePaidTier(user.firebase_uid, user.id, 'canceled');
      break;
    }

    case 'customer.deleted': {
      const customer = event.data.object as Stripe.Customer;
      const user = await lookupUserByCustomer(customer.id);
      if (!user) break;
      await revokePaidTier(user.firebase_uid, user.id, 'canceled');
      await updateUserOrThrow(user.id, { stripe_customer_id: null });
      break;
    }
  }

  await completeEvent(event.id);
}
