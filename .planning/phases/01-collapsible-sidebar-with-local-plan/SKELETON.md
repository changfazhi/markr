# Walking Skeleton — Markr Persistent Study Plan Sidebar

**Phase:** 1
**Generated:** 2026-06-27

## Capability Proven End-to-End

A student on any page can open a persistent sidebar, see today's locally-stored study plan with live correct/attempted/pending status icons derived from the attempts API, and click a quest to navigate to that practice question — without losing their place in the app.

> This is an **additive feature** to an existing full-stack app (React 19 + Vite + Tailwind + Express + Supabase). The project scaffold, routing, DB, and deployment already exist. This SKELETON records the architectural decisions for the *sidebar milestone* specifically — the thinnest end-to-end slice of the new feature.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Mount point | `StudyPlanSidebar` rendered inside `RootLayout` in `frontend/src/App.tsx`, as a sibling of `<main>` wrapped in a `div.relative.flex-1.overflow-hidden` | React Router does not unmount `RootLayout` across navigations, so the sidebar (and its open/closed state) survives route transitions — the core "never lose your place" value (D-01) |
| Sidebar positioning | `position: fixed` (trigger tab + panel + backdrop), outside the flex flow | Does not push or obstruct main content when collapsed (SIDE-06); matches the existing `TopicDrawer` overlay pattern |
| Open/closed state | Local `useState` inside `StudyPlanSidebar`; **not** persisted, resets to collapsed on refresh (D-02) | Simple UI state; SPA nav keeps it open naturally without persistence |
| Plan data source | `localStorage` key `study_plan_v1` only — no Firestore, no new backend routes (D-07) | Phase 1 is local-only; Phase 2 adds Firestore sync. Hook must not import Firebase |
| Shared storage helpers | Extract `loadStoredPlan` / `savePlan` / `PLAN_KEY` / `todayStr` / `StoredPlan` from `StudyPlanPage.tsx` into `frontend/src/lib/studyPlan.ts` (D-05) | Single source of truth; `StudyPlanPage` and `useStudyPlan` both import it — no duplicated logic |
| Quest status | Derived client-side from `api.attempts.list()` (existing endpoint); `correct` if any correct attempt, else `attempted` if any attempt, else `pending` | No separate status store; same derivation already proven in `StudyPlanPage` |
| Status refresh trigger | `useStudyPlan(isOpen)` re-fetches attempts each time the panel opens (`useEffect` keyed on `isOpen` → true), not on an interval (D-03) | Up-to-date icons after returning from a practice question, without polling while closed |
| Directory layout | `components/layout/StudyPlanSidebar.tsx`, `components/sidebar/QuestItem.tsx`, `hooks/useStudyPlan.ts`, `lib/studyPlan.ts` (D-06) | Matches existing convention (layout chrome in `components/layout`, data logic in `hooks`, shared utils in `lib`) |
| Styling | Tailwind via `cn()`; both light + `dark:` variants on every element; no inline styles, no CSS Modules | Project convention; UI-SPEC locks all visual values |

## Stack Touched in Phase 1

- [x] Project scaffold — already exists (React 19 + Vite + Tailwind + TS); no new scaffold
- [x] Routing — sidebar reachable on every `RootLayout` route; quest click navigates to `/practice/:topicId?question_id=...`
- [x] Data — real read of `localStorage` plan + real read of `GET /api/attempts` to derive status (no writes in Phase 1)
- [x] UI — interactive sidebar (trigger tab, panel, backdrop, quest rows) wired to the hook
- [x] Deployment — runs under existing local full-stack command (`cd backend && npm run dev`, `cd frontend && npm run dev`)

## Out of Scope (Deferred to Later Slices)

- Firestore persistence keyed to Firebase UID (PERS-01, PERS-02, PERS-03) — Phase 2
- Live status refresh without the panel-open trigger (SYNC-01, SYNC-02) — Phase 2
- Editing the AI-generated plan (plan is read-only)
- Multiple plans per day; sidebar badge / incomplete-quest count (v2)
- Replacing the standalone `/study-plan` page — coexistence is intended
- Any new backend route — Phase 1 uses only the existing `GET /api/attempts`

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2: Firestore Sync and Live Quest Status** — augment `useStudyPlan` (or add a sibling hook) to read/write the plan to Firestore under the Firebase UID with `localStorage` as a fast-load cache, and refresh quest status on return from a practice page without a reload. The mount point, positioning, and attempts-derived status model stay unchanged.
