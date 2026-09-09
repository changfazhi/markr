import { describe, expect, it } from 'vitest';
import {
  welcomeEmail,
  firstPurchaseEmail,
  payNowExpiryReminderEmail,
  receiptEmail,
} from './templates.js';

describe('welcomeEmail', () => {
  it('promotes premium and links to the app', () => {
    const { subject, html, text } = welcomeEmail();
    expect(subject).toMatch(/welcome/i);
    expect(html).toMatch(/premium/i);
    expect(text).toMatch(/premium/i);
  });
});

describe('firstPurchaseEmail', () => {
  it('congratulates the subscriber and mentions premium features', () => {
    const { subject, html } = firstPurchaseEmail();
    expect(subject).toMatch(/premium/i);
    expect(html).toMatch(/unlimited/i);
  });
});

describe('payNowExpiryReminderEmail', () => {
  it('includes the days-left count and formatted expiry date', () => {
    const { subject, html, text } = payNowExpiryReminderEmail(2, new Date('2026-07-10T00:00:00Z'));
    expect(subject).toMatch(/2 days/);
    expect(html).toMatch(/2 days/);
    expect(text).toMatch(/2 days/);
  });

  it('uses singular "day" when exactly 1 day remains', () => {
    const { subject } = payNowExpiryReminderEmail(1, new Date('2026-07-09T00:00:00Z'));
    expect(subject).toMatch(/1 day\b/);
    expect(subject).not.toMatch(/1 days/);
  });
});

describe('receiptEmail', () => {
  it('formats the amount in the given currency and includes the reference', () => {
    const { html, text } = receiptEmail({
      reference: 'cs_test_123',
      date: new Date('2026-07-08T00:00:00Z'),
      description: 'Markr Premium — PayNow (monthly)',
      amountCents: 1999,
      currency: 'sgd',
    });
    expect(html).toContain('cs_test_123');
    expect(html).toMatch(/\$19\.99|SGD.*19\.99/);
    expect(text).toContain('cs_test_123');
    expect(text).toContain('Markr Premium — PayNow (monthly)');
  });
});
