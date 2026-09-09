const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const BUSINESS_NAME = process.env.BUSINESS_NAME ?? 'Your Business Name Pte. Ltd.';
const BUSINESS_UEN = process.env.BUSINESS_UEN ?? '';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? 'support@yourdomain.com';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function shell(title: string, bodyHtml: string, bodyText: string): { html: string; text: string } {
  const html = `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
  <h1 style="font-size: 20px; margin-bottom: 16px;">${title}</h1>
  ${bodyHtml}
  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e2e2;" />
  <p style="font-size: 12px; color: #6b6b6b;">
    ${BUSINESS_NAME}${BUSINESS_UEN ? ` (UEN ${BUSINESS_UEN})` : ''} &middot;
    Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color: #6b6b6b;">${SUPPORT_EMAIL}</a>
  </p>
</div>`.trim();

  const text = `${title}\n\n${bodyText}\n\n---\n${BUSINESS_NAME}${BUSINESS_UEN ? ` (UEN ${BUSINESS_UEN})` : ''}\nQuestions? ${SUPPORT_EMAIL}`;
  return { html, text };
}

function ctaButton(label: string, href: string): string {
  return `<p style="margin: 24px 0;">
    <a href="${href}" style="background:#2563eb; color:#fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">${label}</a>
  </p>`;
}

export function welcomeEmail(): EmailContent {
  const bodyHtml = `
    <p>Welcome aboard! You're all set up on Markr — H2 A-Level math practice with instant AI-graded feedback.</p>
    <p>A free account gets you 3 AI photo scans and 3 AI hint messages a day. If you want unlimited scans and hints, plus weakness diagnosis and spaced-repetition review, Premium removes those daily caps.</p>
    ${ctaButton('Start practicing', FRONTEND_URL)}
  `;
  const bodyText = [
    "Welcome aboard! You're all set up on Markr — H2 A-Level math practice with instant AI-graded feedback.",
    'A free account gets you 3 AI photo scans and 3 AI hint messages a day. If you want unlimited scans and hints, plus weakness diagnosis and spaced-repetition review, Premium removes those daily caps.',
    `Start practicing: ${FRONTEND_URL}`,
  ].join('\n\n');

  const { html, text } = shell('Welcome to Markr', bodyHtml, bodyText);
  return { subject: 'Welcome to Markr', html, text };
}

export function firstPurchaseEmail(): EmailContent {
  const bodyHtml = `
    <p>Thanks for subscribing to Markr Premium — your daily AI scan and hint limits are now unlimited.</p>
    <p>A few things worth trying: the AI hint chatbot for a Socratic nudge when you're stuck, "upload via phone" for grading handwritten working, and the review tab for weak-topic diagnosis and spaced-repetition drills.</p>
    ${ctaButton('Explore Premium features', FRONTEND_URL)}
  `;
  const bodyText = [
    "Thanks for subscribing to Markr Premium — your daily AI scan and hint limits are now unlimited.",
    'A few things worth trying: the AI hint chatbot for a Socratic nudge when you\'re stuck, "upload via phone" for grading handwritten working, and the review tab for weak-topic diagnosis and spaced-repetition drills.',
    `Explore Premium features: ${FRONTEND_URL}`,
  ].join('\n\n');

  const { html, text } = shell("You're on Markr Premium", bodyHtml, bodyText);
  return { subject: "You're on Markr Premium", html, text };
}

export function payNowExpiryReminderEmail(daysLeft: number, expiresAt: Date): EmailContent {
  const expiryDate = expiresAt.toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    dateStyle: 'long',
  });
  const dayWord = daysLeft === 1 ? 'day' : 'days';
  const title = `Your Premium plan expires in ${daysLeft} ${dayWord}`;

  const bodyHtml = `
    <p>Your Markr Premium access (PayNow plan) expires on <strong>${expiryDate}</strong> — that's ${daysLeft} ${dayWord} from now.</p>
    <p>Renew before then to keep unlimited AI scans and hints without a gap in access.</p>
    ${ctaButton('Renew now', FRONTEND_URL)}
  `;
  const bodyText = [
    `Your Markr Premium access (PayNow plan) expires on ${expiryDate} — that's ${daysLeft} ${dayWord} from now.`,
    'Renew before then to keep unlimited AI scans and hints without a gap in access.',
    `Renew now: ${FRONTEND_URL}`,
  ].join('\n\n');

  const { html, text } = shell(title, bodyHtml, bodyText);
  return { subject: title, html, text };
}

export interface ReceiptInput {
  reference: string;
  date: Date;
  description: string;
  amountCents: number;
  currency: string;
}

export function receiptEmail(input: ReceiptInput): EmailContent {
  const { reference, date, description, amountCents, currency } = input;
  const amount = new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
  const issuedDate = date.toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'long' });

  const rows: Array<[string, string]> = [
    ['Receipt number', reference],
    ['Date', issuedDate],
    ['Description', description],
    ['Amount', amount],
  ];

  const bodyHtml = `
    <p>Thank you for your payment. This email is your receipt.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      ${rows
        .map(
          ([label, value]) => `
        <tr>
          <td style="padding: 6px 0; color: #6b6b6b; width: 40%;">${label}</td>
          <td style="padding: 6px 0; font-weight: 600;">${value}</td>
        </tr>`,
        )
        .join('')}
    </table>
    <p>Keep this email for your records.</p>
  `;
  const bodyText = [
    'Thank you for your payment. This email is your receipt.',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    'Keep this email for your records.',
  ].join('\n');

  const { html, text } = shell('Payment receipt', bodyHtml, bodyText);
  return { subject: `Your Markr receipt — ${issuedDate}`, html, text };
}
