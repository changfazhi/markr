# Markr

## What This Is

Markr is a LeetCode-style H2 A-Level Math practice platform for Singapore students. v1.0 added a persistent, collapsible study plan sidebar that stays accessible from every page in the app. This milestone (v1.1) adds a working payment entry point on the public landing page, since Stripe billing already exists but is only reachable from inside the logged-in app.

## Core Value

Visitors can start a Premium upgrade directly from the landing page's pricing pitch, without first having to find their way into the app.

## Current Milestone: v1.1 Landing Page Payment Entry Point

**Goal:** The landing page's Pricing section "Go Pro" CTA (currently a dead `href="#"` link) starts the real upgrade/checkout flow — prompting login first for logged-out visitors, then opening the upgrade modal.

**Target features:**
- Wire the landing page "Go Pro" CTA to the existing Stripe checkout flow
- Logged-out click → open login modal → on successful sign-in, automatically open the upgrade modal
- Logged-in click → open the upgrade modal directly
- Leave the existing Header "Get Premium" button (roadmap page) unchanged

## Requirements

### Validated

- ✓ AI-generated daily study plan via `/api/review/study-plan` — existing
- ✓ Study plan page at `/study-plan` showing quest list with correct/attempted/pending states — existing
- ✓ Today's plan persisted in `localStorage` (day-keyed, rehydrated on return) — existing
- ✓ Firebase Auth integration — existing
- ✓ Quest items link directly to practice questions via `navigate('/practice/:topicId?question_id=...')` — existing
- ✓ Persistent collapsible study plan sidebar in `RootLayout`, Firestore-synced, live quest status — shipped in v1.0 (Phases 1–2)
- ✓ Stripe billing integration (test mode): card + PayNow, monthly/semesterly (6-month) plans, checkout + customer portal + webhooks, tier gating for AI hints/grading via Firebase custom claims — existing (built outside GSD tracking, commit `bde11ff`)
- ✓ "Get Premium" button in `Header.tsx` opens the upgrade modal via `openUpgradeModal()` (`useAuth()`) — existing, roadmap page only
- ✓ `UpgradeModal` mounted globally at `AuthContext` provider root — callable from anywhere via `useAuth()` — existing

### Active

- [ ] Landing page "Go Pro" CTA (`LandingPage.tsx` Pricing section) triggers the real upgrade flow instead of being a dead link
- [ ] Logged-out visitor clicking "Go Pro" is prompted to log in first, then automatically lands in the upgrade modal after successful sign-in
- [ ] Logged-in visitor clicking "Go Pro" opens the upgrade modal immediately

### Out of Scope

- Multiple concurrent study plans — one active plan per user per day only
- Push notifications or reminders — deferred to a future milestone
- Editing the AI-generated plan manually — plan is read-only, regeneration only
- Mobile-specific layout for the sidebar — responsive collapse is sufficient for now
- Removing or changing the existing Header "Get Premium" button — stays as a second entry point
- Going live with real Stripe payments / production deployment — tracked separately (see `.planning/codebase/RUNBOOKS.md` and `.planning/DEPLOYMENT.md`)

## Context

- **Existing persistence**: `StudyPlanPage` already saves to `localStorage` under `study_plan_v1`; Firestore is authoritative, localStorage is a read-cache.
- **RootLayout**: `App.tsx` wraps all routes (except `/` and `/m/:token`) with `RootLayout`, which renders `<Header />` + `<Outlet />`.
- **Landing page is standalone**: `/` renders `LandingPage.tsx` directly (no `RootLayout`, no `Header`) — it has its own inline nav/footer markup and handles auth-aware links via `handleClick()` delegation (`LandingPage.tsx:495`).
- **Login → app transition**: `LandingPage.tsx` already tracks the logged-out→logged-in transition (`prevUserRef`/`justLoggedIn`, `LandingPage.tsx:484-489`) to `navigate('/roadmap')` after login. The new "prompt login, then upgrade" flow needs a similar transition-tracking mechanism, but triggering `openUpgradeModal()` instead of (or in addition to) the roadmap redirect — only when the visitor's intent was "Go Pro", not a plain login.
- **`openLoginModal(message?: string)`** (`AuthContext.tsx:71`) does not currently support a post-login callback/intent — it only takes a display message. Wiring "login → then open upgrade modal" will need to pass through some form of pending intent.
- **Pricing section markup**: `LandingPage.tsx:396-411` — the "Pro" card's CTA is `<a href="#" class="pm-hov-lift">Go Pro</a>` (`LandingPage.tsx:402`), currently unhandled by `handleClick()` (falls through, does nothing but browser-default `#` scroll-to-top).

## Constraints

- **Stack**: React 19 + Vite + Tailwind + TypeScript frontend; Express + TypeScript backend; Supabase for attempts/questions/billing fields; Firebase for auth + custom claims; Stripe for billing
- **No new backend routes needed**: this milestone is frontend-only wiring — `POST /api/billing/checkout` and the upgrade modal already exist
- **Auth dependency**: the login-then-upgrade flow depends on Firebase Auth's existing sign-in modal (`LoginModal.tsx`) — no changes to auth itself

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Sidebar in `RootLayout`, not per-page | Ensures it survives route transitions without remounting | Shipped v1.0 |
| Firestore for plan storage, localStorage as cache | Firestore gives cross-device sync; localStorage keeps it snappy on reload | Shipped v1.0 |
| Collapsed by default | Doesn't crowd the main content area; users opt in to see the plan | Shipped v1.0 |
| Quest status derived from attempts, not stored separately | Single source of truth; avoids double-write bugs | Shipped v1.0 |
| Reuse existing `UpgradeModal`/`openUpgradeModal()` rather than a new landing-page-specific modal | Modal is already globally mounted via `AuthContext`; avoids duplicating checkout logic | — Pending |
| Keep Header "Get Premium" button unchanged | User explicitly wants it as a second, unmodified entry point | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-27 after initialization*
