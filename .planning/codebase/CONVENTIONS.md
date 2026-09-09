# Coding Conventions

**Analysis Date:** 2026-07-04

## Naming Patterns

**Files:**
- TypeScript/JavaScript files: camelCase (e.g., `attemptService.ts`, `usePracticeSession.ts`, `renderLatex.tsx`)
- React component files: PascalCase (e.g., `PremiumExpiryBanner.tsx`, `MultiPartQuestion.tsx`, `MathField.tsx`)
- No file suffix conventions beyond standard extensions

**Functions:**
- camelCase for all functions (e.g., `normalizeLaTeX()`, `checkAnswer()`, `submitAttempt()`, `buildGradingInstruction()`)
- Helper/utility functions prefixed by their purpose (e.g., `tryNumericEval()`, `latexToMathExpr()`)
- Async functions follow same camelCase (e.g., `getQuestionWithSolution()`, `sendHintMessage()`)

**Variables:**
- camelCase for all variables (e.g., `sessionCorrect`, `partStates`, `activeKey`)
- Boolean variables often prefixed with `is` or `has` (e.g., `isCorrect`, `hasSeeded`, `disabled`)
- Constants exported from modules: SCREAMING_SNAKE_CASE (e.g., `CHAT_RATE_LIMIT_PER_MIN`, `MAX_MESSAGES_PER_QUESTION`, `BUCKET = 'solution-uploads'`)

**Types/Interfaces:**
- PascalCase for all types and interfaces (e.g., `Topic`, `Question`, `QuestionPart`, `PracticeState`, `PartState`)
- Generic type parameters: single uppercase letter (e.g., `T` in `request<T>()`)
- Public/exposed types: suffixed with `Public` if hidden fields differ from internal version (e.g., `QuestionPublic`, `ChatMessagePublic`)
- Request/response types: suffixed with `Body`, `Response`, `Params` (e.g., `SubmitAttemptBody`, `SubmitAttemptResponse`, `GradeSolutionParams`)

**React Hooks:**
- Always prefixed with `use` (e.g., `useTopics()`, `usePracticeSession()`, `useChatSession()`)

## Code Style

**Formatting:**
- No Prettier configured; ESLint rules enforce style
- Spaces over tabs (inferred from source)
- 2-space indentation (standard for JavaScript/React)

**Linting:**
- ESLint enabled with flat config (`frontend/eslint.config.js`)
- Plugins: `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
- Run: `npm run lint` in frontend

**TypeScript:**
- `strict: true` mode enabled
- `noUnusedLocals: true` and `noUnusedParameters: true` enforced
- `noFallthroughCasesInSwitch: true` enforced
- Backend: `NodeNext` module resolution with `.js` extensions on imports (`import { foo } from './bar.js'`)
- Frontend: `bundler` module resolution with ES modules

## Import Organization

**Backend order:**
1. Node.js built-ins with `node:` prefix (e.g., `import http from 'node:http'`, `import { randomUUID } from 'node:crypto'`)
2. Third-party packages (e.g., `import 'dotenv/config'`, `import express from 'express'`, `import { z } from 'zod'`)
3. Internal modules with relative paths ending in `.js` (e.g., `import { supabase } from '../db/supabase.js'`)
4. Type imports (e.g., `import type { Topic, Question } from '../types/index.js'`)

**Frontend order:**
1. React and core library imports (e.g., `import { useState, useEffect } from 'react'`)
2. React Router (e.g., `import { useNavigate } from 'react-router-dom'`)
3. Third-party packages (e.g., `import { renderLatex } from 'katex'`)
4. Internal modules (e.g., `import { useTopics } from '../hooks/useTopics'`)
5. Relative imports (e.g., `import { cn } from '../lib/utils'`)
6. Type imports last (e.g., `import type { Topic } from '../types/api'`)

**Path aliases:**
- Backend: relative paths only (no aliases)
- Frontend: relative paths only (no aliases configured)

## Error Handling

**Patterns:**
- Zod validation in all routes for `req.body` and `req.query` parameters
- Custom error classes for specific conditions: `ChatLimitError`, `GradingError`, `QuotaExceededError` (daily quota), `AiUnavailableError` (cooldown/busy/daily-limit from `aiErrors.ts` — the only error type Gemini-adjacent code may show the user verbatim)
- Try-catch blocks wrap service calls; errors propagate as thrown exceptions
- Routes catch errors and respond with HTTP status codes:
  - `400`: Zod validation failure or user-facing error (e.g., `GradingError`)
  - `401`: Authentication required
  - `402`: Subscription required (payment gate)
  - `404`: Resource not found
  - `429`: Rate limit exceeded
  - `500`: Unexpected server error

**Example from `routes/attempts.ts`:**
```typescript
try {
  const body = submitSchema.parse(req.body);
  const result = await submitAttempt(req.user!.uid, body);
  res.status(201).json(result);
} catch (err) {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request body', details: err.issues });
    return;
  }
  if ((err as Error).message.includes('not found')) {
    res.status(404).json({ error: (err as Error).message });
    return;
  }
  res.status(500).json({ error: (err as Error).message });
}
```

**Frontend:**
- Error messages from API are extracted and shown to user via `throw new Error()` in `lib/api.ts`
- Hook state includes `error: string | null` field
- Components check error state and render error UI conditionally
- Network errors handled in `request()` and `requestFormData()` helpers

## Logging

**Framework:** console methods only (no centralized logging library)

**Patterns:**
- `console.log()` for startup messages (e.g., "Markr backend running on http://localhost:PORT")
- `console.error()` not explicitly used (errors either logged via Express or silently caught)
- Errors in async chains often use `.catch(() => {})` to suppress noise (e.g., in `auth.ts` and `billingService.ts`)

## Comments

**When to comment:**
- Complex logic requiring explanation (e.g., multi-point symbolic evaluation in `attemptService.ts`)
- Important non-obvious intent (e.g., rate-limit strategy, API design rationale)
- Caveats or gotchas (e.g., "never produce full solution" in grading prompt)
- References to external specifications or standards

**Style:**
- Multi-line comments for longer explanations: `/* ... */`
- Single-line comments for brief notes: `// ...`
- Prefer explaining the "why" not the "what"
- JSDoc not used; TypeScript types serve as documentation

**Example from `services/chatService.ts`:**
```typescript
// Thrown when the per-question message cap is hit — mapped to HTTP 429 in the route.
export class ChatLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatLimitError';
  }
}
```

## Function Design

**Size:** Functions kept concise; complex logic broken into helpers

**Parameters:**
- Always typed (no `any`)
- Readonly when intentional (`readonly string[]`)
- Grouped logically when multiple related params (consider passing object)
- Optional params at the end or clearly marked with `?`

**Return values:**
- Always typed (no implicit `any`)
- Use explicit return statements; avoid implicit returns for side-effect functions
- Return objects for multiple values: `{ id: string; phase: PracticePhase }`
- Use `null` for "not found"; `undefined` is rarely used

**Async/await:**
- All I/O functions are async
- No callback-style or Promise chains (except when wrapping third-party)
- Error handling via try-catch, not `.catch()`

**Example from `services/attemptService.ts`:**
```typescript
function normalizeLaTeX(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/\\,/g, '')
    // ... many replacements for robustness
    .toLowerCase();
}

async function submitAttempt(
  userId: string,
  body: SubmitAttemptBody,
): Promise<SubmitAttemptResponse> {
  const question = await getQuestionWithSolution(body.question_id);
  if (!question) throw new Error(`Question ${body.question_id} not found`);
  
  // ... grading logic
}
```

## Module Design

**Architecture pattern:**
- Routes (thin, 20–50 lines): validate input, call service, respond
- Services (logic, 50–300 lines): business rules, database/API calls, error handling
- Middleware: auth, feature gating, logging
- Types: shared interfaces in `src/types/index.ts`
- DB clients: singletons in `src/db/` (Supabase, Firebase, Gemini, Stripe)

**Exports:**
- Named exports preferred: `export function foo() { ... }`
- Default exports for route modules: `export default router;`
- Type exports: `export type Foo = ...` or `export interface Foo { ... }`
- No re-exports through barrel files; import directly from source

**Example structure for a feature:**
```
routes/myfeature.ts      # Router with validation
services/myfeatureService.ts  # Logic and DB calls
types/index.ts           # MyFeatureRequest, MyFeatureResponse
```

## React Components

**File naming:** PascalCase matching component name (e.g., `PremiumExpiryBanner.tsx`)

**Structure:**
- Imports at top
- Props interface first (if any): `interface Props { ... }`
- Helper functions/constants
- Main component function
- Export component

**Hooks:**
- Hooks at top of component before JSX
- `useState` for local UI state
- `useEffect` for side effects with explicit dependency arrays (never empty unless intentional)
- Custom hooks (`useTopics`, `usePracticeSession`) for shared logic

**Props:**
- Always typed via interface (no `React.FC<Props>`)
- Destructure in function signature: `function MyComponent({ prop1, prop2 }: Props)`
- Event handlers: `onClick`, `onChange` (not custom callbacks unless necessary)

**Styling:**
- Tailwind CSS for all styling
- `cn()` utility from `lib/utils.ts` for conditional classes
- Inline `style` only for dynamic values
- Dark mode via `dark:` prefix

**Example from `components/PremiumExpiryBanner.tsx`:**
```typescript
interface Props {
  onRenew: () => void
}

export function PremiumExpiryBanner({ onRenew }: Props) {
  const { accessExpiresAt, tier } = useAuth()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Side effects here
  }, [accessExpiresAt, tier])

  return (
    <div className="flex items-center gap-4 px-6 py-2">
      {/* JSX here */}
    </div>
  )
}
```

## API Client

**Location:** `lib/api.ts`

**Pattern:**
- Centralized `api` object with namespaced methods: `api.topics.list()`, `api.attempts.submit()`
- All requests typed with generics: `request<Topic[]>(...)`
- Auth headers injected automatically via `getAuthHeader()`
- Callbacks for auth/payment errors: `setApiCallbacks()`

**Example:**
```typescript
export const api = {
  topics: {
    list: (level?: MathLevel) => request<Topic[]>(`/api/topics${level ? `?level=${level}` : ''}`),
    get: (id: string) => request<Topic>(`/api/topics/${id}`),
  },
}
```

## Cross-Cutting Concerns

**Authentication:**
- Firebase Auth on frontend (Google OAuth or email/password sign-in — no anonymous mode)
- Firebase Admin SDK on backend for token verification
- Token passed in `Authorization: Bearer <token>` header
- Middleware `gate(feature)` checks both auth and subscription tier (all features are currently `'free'`-tier accessible; `paid` raises usage quotas, not feature access)

**LaTeX rendering:**
- Math: `<Latex component>` for pure LaTeX or `renderLatex()` for mixed text+math
- Rendering uses KaTeX on frontend
- LaTeX always escaped in JSON (backslash doubled in SQL strings)

**Rate limiting:**
- Express middleware: `express-rate-limit` on specific endpoints (e.g., `/api/chat`, `/api/grade`)
- IP-based keying
- Environment variables: `CHAT_RATE_LIMIT_PER_MIN`, `GRADE_RATE_LIMIT_PER_MIN`

**Validation:**
- Zod schemas in routes
- No validation in services (routes guarantee valid input)
- Custom error messages from Zod returned to client

---

*Convention analysis: 2026-07-04*
