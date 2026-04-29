# Phase 2: Production Launch + Trusted Beta

This phase is about getting VA CFR Finder in front of real users safely while learning which workflows need the most polish.

## Goals

- Deploy a stable HTTPS production instance.
- Run a small trusted beta with privacy-safe analytics and feedback.
- Validate search, workspace, evidence checklist, sync, mobile, and exports with real users.
- Build an operating rhythm for condition-data corrections.

## Beta audience

Start with 5-25 trusted testers:

- Veterans comfortable giving product feedback.
- VSOs, claims coaches, or accredited-rep adjacent reviewers.
- Users on mobile and desktop.

Avoid asking users to paste SSNs, claim numbers, complete medical records, or private identifiers.

## What to measure

The app now supports privacy-safe event logging through `/api/analytics`. Track only non-sensitive metadata:

- onboarding completion
- search length and result count
- opened condition id
- workspace additions
- project creation
- export attempts
- feedback submissions

Do not log notes, evidence text, claim narratives, medical record content, or passwords.

## Beta feedback workflow

1. Review `/api/admin/feedback` regularly with admin auth.
2. Group feedback into:
   - incorrect CFR/content
   - missing conditions
   - UX blockers
   - launch/security/privacy concerns
3. Prioritize fixes that affect trust, safety, or task completion.
4. Record CFR/content corrections with source URLs and review dates.

## Operational checklist

- Confirm `/healthz` returns `ok`.
- Confirm `/readyz` returns `ready: true`.
- Confirm production env vars are set from `.env.example`.
- Confirm feedback and analytics logs are being written.
- Confirm runtime `data/users` is excluded from git and backed up.
- Confirm restore from backup has been tested.

## Exit criteria for trusted beta

- No launch-blocking security/privacy issues.
- Top searched conditions manually reviewed.
- Mobile task flow is usable.
- At least one backup restore test succeeds.
- Feedback loop identifies clear Phase 3 priorities.
