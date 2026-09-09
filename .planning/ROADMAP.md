# Roadmap: Markr — Landing Page Payment Entry Point (v1.1)

## Overview

Stripe billing already works end-to-end and the `UpgradeModal` is globally mounted (callable
anywhere via `openUpgradeModal()`), but the public landing page's Pricing "Go Pro" CTA is still a
dead `href="#"` link. This milestone is a single frontend-wiring phase: connect that CTA to the
existing upgrade flow, adding a "log in first, then auto-open the upgrade modal" path for logged-out
visitors while leaving the existing Header "Get Premium" button and the plain login→roadmap redirect
untouched.

Phase numbering continues from the previous milestone (v1.0 shipped Phases 1–2: the persistent
study-plan sidebar). v1.1 begins at Phase 3.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (3.1, 3.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

_Phases 1–2 completed in milestone v1.0 (Persistent Study Plan Sidebar)._

- [ ] **Phase 3: Landing Page "Go Pro" Payment Entry Point** - Wire the landing page Pricing CTA to the existing upgrade flow, with a login-then-auto-upgrade path for logged-out visitors

## Phase Details

### Phase 3: Landing Page "Go Pro" Payment Entry Point

**Goal**: Visitors can start a Premium upgrade directly from the landing page's Pricing section — a logged-in visitor gets the upgrade modal instantly; a logged-out visitor logs in first and then lands in the upgrade modal automatically.
**Depends on**: Nothing new (builds on the already-shipped Stripe checkout flow and the globally-mounted `UpgradeModal`)
**Requirements**: PAY-01, PAY-02, PAY-03
**Success Criteria** (what must be TRUE):

  1. Clicking "Go Pro" in the landing page Pricing section starts the real upgrade flow — it no longer behaves as a dead `href="#"` link that scrolls the page to the top (PAY-01)
  2. A logged-in visitor who clicks "Go Pro" sees the `UpgradeModal` open immediately on the landing page, with no extra navigation or redirect (PAY-03)
  3. A logged-out visitor who clicks "Go Pro" is shown the login modal first; after a successful sign-in the `UpgradeModal` opens automatically, rather than only being redirected to `/roadmap` (PAY-02)
  4. A plain sign-in (via the nav "Log in" link, not "Go Pro") still redirects to `/roadmap` and does NOT open the upgrade modal — the "Go Pro" intent is distinguished from an ordinary login (guards PAY-02 against regressing the existing `justLoggedIn` → `/roadmap` transition)

**Plans**: 1/2 plans executed
**Wave 1**

- [x] 03-01-PLAN.md — Wire the "Go Pro" CTA in LandingPage.tsx: instant UpgradeModal for logged-in visitors, login-then-auto-upgrade for logged-out visitors, with the plain-login → /roadmap redirect preserved

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 03-02-PLAN.md — Human-verify checkpoint: confirm all three "Go Pro" flows plus the plain-login non-regression / intent-leak guard at runtime

**UI hint**: yes

_Out of scope for this phase: any change to the Header "Get Premium" button (stays as an unmodified second entry point) and going live with real Stripe payments / production deployment (tracked separately)._

## Progress

**Execution Order:**
Phases execute in numeric order: 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 3. Landing Page "Go Pro" Payment Entry Point | 1/2 | In Progress|  |
