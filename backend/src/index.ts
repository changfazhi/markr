import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import topicsRouter from './routes/topics.js';
import questionsRouter from './routes/questions.js';
import attemptsRouter from './routes/attempts.js';
import conceptsRouter from './routes/concepts.js';
import starsRouter from './routes/stars.js';
import streaksRouter from './routes/streaks.js';
import chatRouter from './routes/chat.js';
import gradeRouter from './routes/grade.js';
import pairRouter from './routes/pair.js';
import reviewRouter from './routes/review.js';
import usageRouter from './routes/usage.js';
import meRouter from './routes/me.js';
import billingRouter from './routes/billing.js';
import feedbackRouter from './routes/feedback.js';
import { globalRateLimit } from './middleware/rateLimit.js';
import { initRealtime } from './realtime.js';
import { startPayNowExpiryReminderCron } from './jobs/payNowExpiryReminder.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

// Cloud Run always fronts the container, so `req.ip` is the front end's address unless we say how
// many proxy hops to unwind. Google appends the real client IP to any inbound X-Forwarded-For, so
// trusting exactly one hop is both correct and unspoofable. Bump to 2 if an external HTTPS load
// balancer is ever put in front. Harmless locally: with no X-Forwarded-For, `req.ip` is the socket
// address either way. Only the IP-keyed feedback limiter depends on this — the rest key by account.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
app.disable('x-powered-by');

// Security headers. Two deliberate deviations from helmet's defaults:
// - CSP off for now: the served SPA needs inline styles (React/KaTeX), data:/blob: images
//   (photo previews, QR), bundled fonts, WebSockets, and Firebase's Google-endpoint calls —
//   a blind-strict CSP would break sign-in and math rendering. Tighten deliberately later,
//   starting from a report-only policy, rather than shipping a guess that enforces.
// - COOP relaxed to same-origin-allow-popups: the default 'same-origin' severs the opener
//   relationship that signInWithPopup's Google popup needs to hand the credential back.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGIN ?? 'https://yourproductiondomain.com')
    : 'http://localhost:5173',
}));

// Backstop limiter over the whole API (IP-keyed — it runs before auth). Generous by design;
// the tight, account-keyed limits stay on the AI routes. Skips the Stripe webhook internally.
app.use('/api', globalRateLimit());

// Billing router mounts BEFORE express.json() so the webhook route can receive raw body
// for Stripe signature verification. Non-webhook billing routes apply express.json() themselves.
app.use('/api/billing', billingRouter);

app.use(express.json());

app.use('/api/topics', topicsRouter);

// /api/topics/:topicId/questions, /api/topics/:topicId/next — topic-scoped question routes
app.use('/api/topics', questionsRouter);

// /api/topics/:topicId/concepts
app.use('/api/topics', conceptsRouter);

// /api/questions/:id — direct question lookup
app.use('/api/questions', questionsRouter);

app.use('/api/attempts', attemptsRouter);
app.use('/api/stars', starsRouter);
app.use('/api/streaks', streaksRouter);
app.use('/api/chat', chatRouter);
app.use('/api/grade', gradeRouter);
app.use('/api/pair', pairRouter);
app.use('/api/review', reviewRouter);
app.use('/api/usage', usageRouter);
app.use('/api/me', meRouter);
app.use('/api/feedback', feedbackRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// In production the container serves the built frontend from ../public (see Dockerfile),
// keeping everything same-origin: relative /api fetches, the Socket.IO connection, and
// the QR code built from window.location.origin all work unchanged.
if (process.env.NODE_ENV === 'production') {
  const frontendDist = process.env.FRONTEND_DIST ?? path.resolve(__dirname, '../public');
  app.use(express.static(frontendDist));
  // SPA fallback so client-side routes (/practice/..., /m/:token) survive a hard refresh.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path === '/health') {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// http.Server (not app.listen) so Socket.IO can attach for live phone-upload pairing.
const httpServer = http.createServer(app);
initRealtime(httpServer);
startPayNowExpiryReminderCron();

httpServer.listen(PORT, () => {
  console.log(`Markr backend running on http://localhost:${PORT}`);
});
