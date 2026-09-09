import { getResend } from '../db/resend.js';
import {
  welcomeEmail,
  firstPurchaseEmail,
  payNowExpiryReminderEmail,
  receiptEmail,
  type EmailContent,
  type ReceiptInput,
} from '../emails/templates.js';

const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Markr <noreply@yourdomain.com>';

// Every sender here swallows its own errors and returns false instead of throwing —
// a failed transactional email must never break auth/checkout. Callers should only
// persist a "sent" flag when this resolves true, so a failure gets retried later
// instead of being silently marked as done.
async function send(to: string, content: EmailContent): Promise<boolean> {
  try {
    await getResend().emails.send({
      from: EMAIL_FROM,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    return true;
  } catch (err) {
    console.error(`Failed to send email "${content.subject}" to ${to}:`, err);
    return false;
  }
}

export function sendWelcomeEmail(to: string): Promise<boolean> {
  return send(to, welcomeEmail());
}

export function sendFirstPurchaseEmail(to: string): Promise<boolean> {
  return send(to, firstPurchaseEmail());
}

export function sendPayNowExpiryReminder(to: string, daysLeft: number, expiresAt: Date): Promise<boolean> {
  return send(to, payNowExpiryReminderEmail(daysLeft, expiresAt));
}

export function sendReceiptEmail(to: string, input: ReceiptInput): Promise<boolean> {
  return send(to, receiptEmail(input));
}
