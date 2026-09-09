# Architecture

**Analysis Date:** 2026-07-04

## System Overview

Markr is a full-stack web application for Singapore H2 A-Level math practice. Students answer questions across 24 topics, receive AI-generated hints, submit handwritten solutions via photo, and track progress through streaks and analytics. The system is split into a React 19 frontend (Vite) and Express TypeScript backend (Supabase + Gemini integration).

```text
┌──────────────────────────────────────────────────────────────────┐
│                      Frontend (React 19 + Vite)                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Pages (HomePage, PracticePage, HistoryPage, etc.)         │  │
│  │  `frontend/src/pages/*.tsx`                                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                             │                                     │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │  Components (Question, Chat, Progress, Layout)              │  │
│  │  `frontend/src/components/**/*.tsx`                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                             │                                     │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │  Hooks (usePracticeSession, useChatSession, etc.)           │  │
│  │  Contexts (AuthContext)                                    │  │
│  │  `frontend/src/hooks/*.ts` + `frontend/src/contexts/*.tsx` │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                             │                                     │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │  API Abstraction & Socket.IO                                │  │
│  │  `frontend/src/lib/api.ts`, `frontend/src/lib/socket.ts`   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                             │
                   ┌─────────▼─────────┐
                   │  HTTP/WebSocket   │
                   │  (Vite proxy)     │
                   └─────────┬─────────┘
                             │
┌──────────────────────────────────────────────────────────────────┐
│                 Backend (Express + TypeScript)                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Routes (topics, questions, attempts, chat, grade, pair)   │  │
│  │  `backend/src/routes/*.ts`                                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                             │                                     │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │  Services (Business Logic)                                  │  │
│  │  topicService, questionService, attemptService,            │  │
│  │  chatService, gradingService, pairService, etc.           │  │
│  │  `backend/src/services/*.ts`                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                             │                                     │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │  Database & External Integrations                           │  │
│  │  Supabase (questions, attempts, chat history)              │  │
│  │  Gemini (hints, photo grading, transcription)              │  │
│  │  Firebase (auth), Stripe (billing)                         │  │
│  │  `backend/src/db/*.ts`                                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Socket.IO (Phone upload realtime pairing)                 │  │
│  │  `backend/src/realtime.ts`                                 │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Pages** | Route-level containers; load data, manage page-wide state | `frontend/src/pages/*.tsx` |
| **Question Components** | Render questions, answer inputs (text, multi-box, photo, MCQ) | `frontend/src/components/question/*.tsx` |
| **Chat Panel** | Socratic hint history + input; bridges to chatService | `frontend/src/components/chat/ChatPanel.tsx` |
| **Photo Grading UI** | Photo capture, transcription editor, grading feedback | `frontend/src/components/question/PhotoAnswer.tsx` etc. |
| **Layout Components** | Header, sidebar, study plan drawer | `frontend/src/components/layout/*.tsx` |
| **Progress Components** | StatsBar, StreakNotification, topical accuracy | `frontend/src/components/progress/*.tsx` |
| **usePracticeSession** | Core question-session state machine; coords attempts/grades | `frontend/src/hooks/usePracticeSession.ts` |
| **AuthContext** | Firebase login, subscription tier, global modal toggles | `frontend/src/contexts/AuthContext.tsx` |
| **Routes (backend)** | HTTP handler; parse/validate → call service → respond | `backend/src/routes/*.ts` |
| **Services** | Business logic: answer validation, AI calls, progress calc | `backend/src/services/*.ts` |
| **Supabase Client** | Query builder + RLS enforcement | `backend/src/db/supabase.ts` |
| **Gemini Integration** | Hint generation + photo grading + transcription | `backend/src/db/gemini.ts` + `gradingService.ts` |
| **Auth Middleware** | Firebase token verification + subscription gating | `backend/src/middleware/auth.ts` |
| **Socket.IO/Realtime** | Room-based event broadcast for phone-upload pairing | `backend/src/realtime.ts` |

## Pattern Overview

**Overall:** Layered Request-Response with Real-Time Pairing

**Key Characteristics:**
- **Thin routes** — minimal logic; delegate to services
- **Rich services** — answer grading, AI integration, progress math
- **Centralized API** — single `api.*` object on frontend for all HTTP
- **Session-based** — UUID in localStorage; no user auth required for free features (paid gated at route level)
- **State machine** — PracticeSession tracks multi-part question workflow (`answering → submitted → revealed → complete`)
- **Lazy photo + text modes** — toggle between photo/MathLive input on same question
- **Socket.IO pairing** — desktop subscribes to phone-upload token; real-time photo stream + grading

## Layers

**Frontend Layer: Pages**
- Purpose: Route-specific containers; fetch initial data; page-level state
- Location: `frontend/src/pages/`
- Contains: `.tsx` page components (HomePage, PracticePage, HistoryPage, etc.)
- Depends on: Hooks (usePracticeSession, useTopics), AuthContext, api
- Used by: Router in App.tsx

**Frontend Layer: Components**
- Purpose: Reusable UI: questions, inputs (MathField, photo), chat, progress bars
- Location: `frontend/src/components/`
- Contains: Subdirectories by concern (question/, chat/, math/, layout/, etc.)
- Depends on: Hooks, types, lib utilities (renderLatex, cn, api)
- Used by: Pages and other components

**Frontend Layer: Hooks & Contexts**
- Purpose: State management and data fetching; decouple logic from render
- Location: `frontend/src/hooks/`, `frontend/src/contexts/`
- Contains: usePracticeSession (question workflow), useTopics, useChatSession, AuthContext
- Depends on: api, types
- Used by: Pages and components

**Frontend Layer: API Abstraction**
- Purpose: Centralized fetch wrapper; auth header injection; error mapping (401 → unauthorized, 402 → payment required)
- Location: `frontend/src/lib/api.ts`
- Contains: Namespaced object (api.topics.*, api.questions.*, etc.)
- Depends on: Firebase auth, types
- Used by: All hooks and services

**Backend Layer: Routes**
- Purpose: HTTP request handler; parse/validate input with Zod; call service; return JSON
- Location: `backend/src/routes/`
- Contains: Express Router per feature (topics, questions, attempts, chat, grade, pair, etc.)
- Depends on: Service functions, Zod schemas, middleware (auth, gate)
- Used by: Express app in index.ts

**Backend Layer: Services**
- Purpose: Business logic; coordinate db queries + external APIs
- Location: `backend/src/services/`
- Contains: One service per major feature (attemptService, gradingService, chatService, etc.)
- Depends on: Supabase client, Gemini client, types
- Used by: Routes and other services (e.g., attemptService calls questionService)

**Backend Layer: Database & External Clients**
- Purpose: Third-party client initialization; no query logic
- Location: `backend/src/db/`
- Contains: supabase.ts (Supabase client), gemini.ts (Gemini AI), firebase.ts (Firebase admin), stripe.ts (Stripe client)
- Depends on: Environment variables, SDK libraries
- Used by: Services

**Backend Layer: Middleware**
- Purpose: Request-level concerns: authentication, feature gating
- Location: `backend/src/middleware/`
- Contains: auth.ts (Firebase token verification + tier checking)
- Depends on: Firebase admin SDK, Supabase
- Used by: Routes via gate('feature') wrapper

**Backend Layer: Real-Time (Socket.IO)**
- Purpose: Publish/subscribe for phone-upload QR pairing
- Location: `backend/src/realtime.ts`
- Contains: initRealtime(), emitToPair()
- Depends on: Socket.IO, http.Server
- Used by: pairService (broadcasts pair:image, pair:graded events)

## Data Flow

### Primary Request Path: Submit Answer

1. Student types/photographs answer on **PracticePage** (`frontend/src/pages/PracticePage.tsx`)
2. **AnswerInput** or **PhotoAnswer** component collects input + calls `session.submitAnswer()` or `session.submitPhotos()`
3. **usePracticeSession** hook dispatches `SUBMIT_START` action (phase: submitted) and calls `api.attempts.submit()` or `api.grade.submit()`
4. **Frontend API layer** (`frontend/src/lib/api.ts`) wraps fetch with Firebase auth token + error handling
5. **Route handler** (`backend/src/routes/attempts.ts` or `grade.ts`) receives POST, validates with Zod, extracts user ID from auth middleware
6. **Service function** (`attemptService.submitAttempt()` or `gradingService.gradeSolution()`) runs business logic:
   - Fetch question + solution (answer_correct?)
   - For typed: check answer via `checkAnswer(answerType, correct, given, tolerance)`
   - For photo: send images to Gemini via `gradingService`, parse structured response
   - Upsert attempt row (+ gradings row for photo)
   - Update streak + topic progress cache
7. **Service returns** `SubmitAttemptResponse` with `is_correct`, `correct_answer`, `solution_latex` (null until all parts done)
8. **Route** responds 201 with JSON
9. **usePracticeSession** receives response, dispatches `SUBMIT_SUCCESS` or `GRADE_SUCCESS`, transitions phase → `revealed`
10. **SolutionReveal** component renders answer + feedback

**Multi-Part Questions:** Each part's submission follows the same flow (step 2–9), keyed by `part_label`. Topic status flips to ✓ only when **all graded parts** are correct.

### Secondary Request Path: AI Hint Chat

0. Student opens **Hints tab** on **PracticePage** (mount, page refresh, new tab, or new device all trigger this): **useChatSession** calls `api.chat.startThread(questionId)` → `GET /api/chat` mints a random `thread_id` and returns it *without* any stored history — the visible conversation always starts empty, on purpose (see "Chat history reset" below)
1. Student types a message in **ChatPanel**
2. **ChatPanel** component calls `chat.send(message)`
3. **useChatSession** hook calls `api.chat.send(questionId, threadId, message)`
4. **Route** (`backend/src/routes/chat.ts`) passes to `chatService.sendHintMessage(userId, questionId, threadId, message, tier)`
5. **chatService** builds system instruction with question + solution (server-only), fetches only this thread's prior messages as conversation context, and calls Gemini
6. Gemini returns Socratic hint (guardrail: never the answer)
7. Service persists both turns in `chat_messages`, tagged with the current `thread_id`, and returns the thread's message list to the client
8. **ChatPanel** appends to message list and rerenders

**Chat history reset (added 2026-07-06):** the hint conversation is scoped to a `thread_id` that's re-minted every time the chat is opened — refreshing the page, closing/reopening the question, opening a new tab, or opening the same question on a different device all start a visually empty conversation, and Gemini only sees the current thread as context. Rows are never deleted: `chat_messages` keeps every message a user has ever sent for a question (across all threads) so the anti-abuse counters below can't be reset by reopening the chat. Migration: `028_chat_thread_id.sql`.

**Rate limiting:** IP-based (`express-rate-limit`), 15/min default. Per-question cap of 40 messages (`CHAT_MAX_MESSAGES_PER_QUESTION`) → HTTP 429 — counted across **all** of a user's messages for that question, regardless of thread. Two more layers sit between the route and Gemini (added 2026-07-06, shared with photo grading/diagnosis): a per-user cooldown (`cooldownService.ts`, 5s chat / 60s grading, HTTP 429 `AI_COOLDOWN`) and a global pacing gateway (`geminiGateway.ts`) that queues/paces/retries calls against the Gemini key's real per-minute and per-day limits, surfacing `AI_BUSY`/`AI_DAILY_LIMIT` on exhaustion — see `INTEGRATIONS.md`.

### Tertiary Request Path: Phone Upload QR Pairing

1. Student opens **PracticePage**, clicks "📱 Upload via phone"
2. **QrPairModal** component calls `api.pair.create(questionId)`
3. **Route** (`backend/src/routes/pair.ts`) generates unguessable token, stores in pairService Map, responds with token + URL
4. **QrPairModal** renders QR of `<origin>/m/:token`
5. Student opens QR on phone → **MobileUploadPage** (`frontend/src/pages/MobileUploadPage.tsx`)
6. **MobileUploadPage** calls `api.pair.context(token)` (auth-free), then emits `pair:phone-connected` via Socket.IO
7. **Desktop** receives `pair:phone-connected` event via `usePairSocket`, fires `session.beginExternalGrading()`
8. Student photographs solution on phone; each upload POSTs to `/api/pair/:token/photo`
9. **Route** streams image to desktop via `emitToPair(token, 'pair:image', image_data)`
10. Desktop UI shows live preview in **PhotoAnswer** component
11. Student clicks **Done** on phone → POST `/api/pair/:token/done`
12. **Route** calls `gradeSolution()` (same as desktop photo grading) and emits `pair:grading` → `pair:graded` or `pair:error`
13. Desktop receives event and displays feedback

**State Management:** Pair token lives in `pairService` (in-memory Map, 10-min TTL). Socket.IO rooms keyed by token ensure isolation.

## Key Abstractions

**PracticeSession State Machine:**
- Purpose: Tracks a student's interaction with one question (typing, submitting, photo grading, revealing)
- Implementation: `usePracticeSession` hook with reducer; encapsulates phases: `answering → submitted → revealed → complete`
- Used: PracticePage manages one session; transitions on answer submission / grading
- Examples: `frontend/src/hooks/usePracticeSession.ts` (state machine), `frontend/src/pages/PracticePage.tsx` (consumer)

**Question Models (Full vs. Public):**
- Purpose: Hide solutions and correct answers from client until after attempt
- Implementation: Backend services export `Question` (full) and `QuestionPublic` (stripped) types; routes strip before sending
- Example: `backend/src/types/index.ts` defines `Question` and `QuestionPublic` (omit correct_answer, solution_latex, parts[].correct_answer)

**Multi-Part Questions (parts JSONB):**
- Purpose: Represent sub-questions within one question (e.g., "a", "b", "c")
- Implementation: `questions.parts` is array of `QuestionPart` objects (label, prompt_latex, answer_type, correct_answer, etc.)
- When present: Frontend renders per-part input boxes; one attempt per part; topic status only ✓ when all graded parts correct
- Examples: Multi-box parts have `answers[]` field for parallel inputs (e.g., "find a, b, c" → 3 input boxes, graded independently)

**API Namespace:**
- Purpose: Single object for all client-side HTTP; centralizes auth injection and error handling
- Implementation: `frontend/src/lib/api.ts` exports `api` object with namespaced methods (api.topics.*, api.attempts.*, etc.)
- Error mapping: 401 → `onUnauthorized()` callback (triggers login modal), 402 → `onPaymentRequired()` (triggers upgrade modal)
- Example: `api.grade.submit(questionId, images) → POST /api/grade` with multipart FormData

**Socket.IO Realtime:**
- Purpose: One-way broadcast for phone-upload pairing (desktop listens for phone events)
- Implementation: `backend/src/realtime.ts` exports `initRealtime(httpServer)` + `emitToPair(token, event, data)`
- Rooms: Each pairing token is a room; desktop subscribes via `pair:subscribe` event; no auth (token = secret)
- Example: `pairService.gradePhotosFromMobile()` calls `emitToPair()` to send `pair:graded` event

## Entry Points

**Frontend: Browser**
- Location: `frontend/src/main.tsx` → `App.tsx`
- Triggers: `npm run dev` (Vite dev server) or load `/dist/index.html` (production)
- Responsibilities:
  1. Render AuthProvider + RouterProvider
  2. Router dispatches to pages based on path (/ → LandingPage, /roadmap → HomePage, /practice/:topicId → PracticePage, etc.)
  3. Pages load data via hooks (usePracticeSession, useTopics, etc.)

**Backend: Express Server**
- Location: `backend/src/index.ts`
- Triggers: `npm run dev` (tsx watch on port 3001) or `npm start` (compiled node)
- Responsibilities:
  1. Load environment variables (`dotenv`)
  2. Create Express app + http.Server (for Socket.IO)
  3. Mount middleware (CORS, auth gate)
  4. Mount routes (topics, questions, attempts, chat, grade, pair, review, billing)
  5. Initialize Socket.IO + listen on PORT

**Socket.IO Gateway:**
- Location: `backend/src/realtime.ts`
- Attached to: http.Server (same port as Express)
- Responsibilities:
  1. Accept WebSocket connections from frontend
  2. Handle `pair:subscribe` / `pair:unsubscribe` to join/leave pairing rooms
  3. Expose `emitToPair(token, event, data)` for services to broadcast

## Architectural Constraints

- **Threading:** Node.js single-threaded event loop; CPU-heavy tasks (Gemini) are non-blocking (awaited)
- **Global state:** Socket.IO server singleton in `realtime.ts` (module-level `let io`); pairService uses in-memory Map (resets on server restart)
- **Module resolution:** TypeScript + `NodeNext` (esm by default); all imports must include `.js` extension
- **Environment:** Backend relies on `.env` for Supabase, Gemini, Firebase, Stripe keys; never sent to browser
- **Rate limiting:** IP-keyed via `express-rate-limit`; routes gate chat (15/min), grading (5/min) by IP. Layered with a per-user cooldown and a global Gemini-call pacing gateway (`cooldownService.ts`, `geminiGateway.ts`) — see the AI Hint Chat section above.
- **Circular imports:** Generally avoided by organizing routes → services → db (no reverse deps); one exception: reviewService calls questionService, questionService calls topicService (safe, no cycle)
- **RLS:** Supabase uses Row-Level Security; all queries run as `anon` or `service_role` context (frontend requests are `anon`, backend has service key for seeding)
- **Type safety:** Strict TS throughout; Zod validates all external input (req.body, req.query, API responses expected locally)

## Anti-Patterns

### Calling Supabase Directly from Routes

**What happens:** A route imports `supabase` and queries directly instead of delegating to service
**Why it's wrong:** Violates separation of concerns; service layer is meant to encapsulate db + business logic; makes tests/mocks harder
**Do this instead:** Create a service function in `backend/src/services/` (e.g., `attemptService.getAttemptsBySession()`) and call it from the route. Services own all database access.

### Hardcoding Secrets or API Keys

**What happens:** `.env` values leak into frontend via unguarded constants or console.log
**Why it's wrong:** GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY must stay backend-only; browser can see all code
**Do this instead:** Store only Firebase config (public) in frontend. Backend routes proxy all Gemini/Supabase calls; never expose keys to frontend

### Mixing Zod Parsing and Business Logic in Routes

**What happens:** Route does `const body = req.body; if (body.x) { ...business logic... }`
**Why it's wrong:** Routes become fat; no single responsibility; hard to reuse validation or logic
**Do this instead:** Use Zod in route to parse/validate (e.g., `submitSchema.parse(req.body)`), then call service with parsed object. Service has clean input contract.

### Submitting Answers Without Session Context

**What happens:** Attempt row saved without `session_id` or attempt to grade without checking question exists
**Why it's wrong:** Progress tracking breaks; attempts hang as orphans; security: user A could grade user B's photo if no auth
**Do this instead:** Extract user ID from auth middleware (`req.user!.uid`), always include in every query/insert. Services operate on behalf of authenticated user.

## Error Handling

**Strategy:** Zod for input validation (400 errors), service functions throw descriptive errors, routes catch and map to HTTP codes.

**Patterns:**

1. **Input Validation:** Route uses `schema.parse(req.body)` → catches `ZodError` → responds 400 with issues list
   - Example: `backend/src/routes/attempts.ts` lines 8–25

2. **Not Found:** Service throws error with "not found" message → route catches → responds 404
   - Example: `getQuestionWithSolution()` throws if question doesn't exist

3. **Business Logic Errors:** Service throws descriptive error → route catches → responds 400 or 500
   - Example: `chatService` throws `ChatLimitError` → route responds 429

4. **Photo Grading Rejection:** `gradingService` returns `gradable: false` + `rejection_reason` → service throws `GradingError` → frontend receives 400 GRADE_REJECTED (soft error, stays on question)

5. **Authentication:** Middleware `requireAuth` catches bad token → responds 401 with clear message

6. **Feature Gating:** Middleware `gate('feature')` checks tier → responds 402 if not paid (frontend intercepts, shows upgrade modal)

**Frontend Error Handling:**
- `api.ts` catches 401/402 and invokes callbacks (onUnauthorized, onPaymentRequired)
- `usePracticeSession` catches submission errors and dispatches ERROR action → renders `<ErrorMessage>`
- Network errors bubble as `Error('...')` and are caught by component error boundaries

## Cross-Cutting Concerns

**Logging:** Console-based (development); no structured logging library. Services log key milestones (answer submitted, photo graded, hint generated).

**Validation:** 
- Frontend: Real-time input type checking (MathField rejects invalid LaTeX), form state validation (disable submit until valid)
- Backend: Zod schemas on all HTTP inputs; db constraints (NOT NULL, unique indexes) on writes

**Authentication:**
- Frontend: Firebase Authentication (Google OAuth or email/password — no anonymous mode). ID token in Authorization header.
- Backend: `requireAuth` middleware verifies token, upserts user row, injects `req.user`. Routes call `gate('feature')` to enforce tier — currently every feature is `'free'`-accessible (`config/featureTiers.ts`); `paid` buys higher usage quotas, not feature access (see `INTEGRATIONS.md`).

**Answer Grading:**
- Exact (LaTeX): normalize, try numeric eval, try symbolic eval (multi-point substitution)
- Range (numerical): parse float, check abs diff ≤ tolerance
- MCQ: normalize, string match
- Null (show-that): no grading, part unsubmitted

---

*Architecture analysis: 2026-07-04*
