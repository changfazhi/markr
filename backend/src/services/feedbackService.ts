import { getMailer } from '../db/mailer.js';

export type FeedbackCategory = 'bug' | 'idea' | 'question' | 'other';

export interface FeedbackInput {
  message: string;
  category?: FeedbackCategory;
  page?: string;
}

interface FeedbackUser {
  uid: string;
  email: string | null;
  tier: 'free' | 'paid';
}

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: 'Bug',
  idea: 'Idea',
  question: 'Question',
  other: 'Other',
};

export async function sendFeedbackEmail(user: FeedbackUser, input: FeedbackInput): Promise<void> {
  const to = process.env.FEEDBACK_TO_EMAIL ?? 'ProjectMath9999@gmail.com';
  const category = input.category ? CATEGORY_LABELS[input.category] : 'Feedback';
  const sentAt = new Date().toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const body = [
    `From:     ${user.email ?? 'unknown email'} (tier: ${user.tier})`,
    `User ID:  ${user.uid}`,
    `Page:     ${input.page ?? 'unknown'}`,
    `Category: ${category}`,
    `Sent:     ${sentAt} (SGT)`,
    '',
    input.message,
  ].join('\n');

  await getMailer().sendMail({
    from: process.env.GMAIL_USER,
    to,
    // Replying to the feedback email goes straight to the student.
    replyTo: user.email ?? undefined,
    subject: `[Markr feedback] ${category} — ${user.email ?? 'unknown email'}`,
    text: body,
  });
}
