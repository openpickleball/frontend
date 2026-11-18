# Frontend v1: from zero to a working player app

**Status:** active

## Goal

`app/` is a responsive SvelteKit web app, installable as a PWA, that lets players look up ratings and record matches against the real backend running locally. It follows the site's design language, keeps API access and data models separate from UI code, and every change lands through a PR that CI checks before merge.

Hosting, Capacitor and app-store builds are out of scope.

## Phases

1. **Research.** Inventory the backend endpoints, audit the design language and any leftover artifacts, and record the state of `app/` and CI. Findings go in `research/`.
2. **Proposal.** Write `proposal.md` (scope, what we can and can't build now, key decisions) and HTML mockups in `mockups/`. Publish a short review page and get sign-off.
3. **Breakdown.** Split the agreed scope into tasks in `tasks.md`. Each task has its files, its acceptance criteria and its dependencies, so agents can work on them in parallel without touching the same files.
4. **Build.** Agents implement tasks in worktrees, write tests, open PRs, and merge them once CI passes and a review agent approves.

## Steps

- [x] Research: backend endpoints and OpenAPI → `research/backend-api.md`
- [x] Research: design language and stale artifacts → `research/design.md`
- [x] Research: `app/` state, tooling and CI → `research/app-and-ci.md`
- [x] Proposal and architecture decisions → `proposal.md`
- [x] Mockups → `mockups/`
- [x] Review page published and signed off (https://claude.ai/artifact/DutKgygg1Dodvq38PXJ2dL)
- [x] Task breakdown → `tasks.md`
- [ ] CI hardening, if the proposal calls for it (T0 does the basics; the rest is in T3 and T4)
- [ ] Implementation tasks (tracked in `tasks.md`)

## Research findings (2026-11-17)

- **Backend:** django-ninja at `/api/v1/` and allauth headless at `/_allauth/`. Available now: auth (email and password, with email verification), `accounts/me`, `POST matches/`, confirm and dispute, `GET players/{code}/matches`. Missing: ratings (no model or endpoint), player profile create and read (backend#124), player search, `GET /matches/{code}`. No OpenAPI file is committed; the backend serves its schema at runtime at `/api/v1/openapi.json`.
- **Design:** one design language, defined in `site/src/input.css:24-36` (light-dark tokens and a `data-theme` toggle). `app/` is an untouched starter. Leftover artifacts are listed in `research/design.md`.
- **App and CI:** checks pass. No component DOM tests, no e2e tests. The ruleset doesn't require branches to be up to date before merging. frontend#22 already scopes the PWA work.

## Working agreements

- Frontend only. File backend gaps as issues on `openpickleball/backend`. File frontend follow-ups as issues on `openpickleball/frontend`.
- Models: Sonnet for research, implementation and verification. Opus for architecture, design and code review.
- Parallelism: up to 4 research agents at once. Up to 3 implementation agents at once, each in its own worktree with files no other agent touches. One review agent per PR.
- The orchestrator may merge a PR once CI is green and a review agent has approved it.
- Use only made-up data in fixtures, mockups and screenshots.

## Decisions

- Stack: SvelteKit, shipped as a responsive web app that works as a PWA on mobile. Capacitor is deferred. (Settled with the project owner, 2026-11-17.)
- The backend repo is the source of truth for endpoints.
- MVP audience: players looking up ratings and recording matches. The final scope depends on which endpoints exist.
- Development runs against a local backend. Hosting is out of scope.
- Q1 Offline match queue: deferred to a frontend follow-up issue (F1). v1 shows an offline error instead. (2026-11-17)
- Q2 Ratings against the real backend: "Coming soon" card. Mock mode shows a labelled sample card. (2026-11-17)
- Q3 Until backend#124: players enter their own OPEN code once, stored on the device. (2026-11-17)
- Q4 Submitting a match confirms for the submitter's team; the submit button says so. Raise it with the backend team too. (2026-11-17)
- Q5 Merge ruleset: yes. Once the `app-e2e` job exists on `main`, the owner turns on "require branches to be up to date" and makes `app-e2e` required. (2026-11-17)
- Engineering decisions in `proposal.md` §2–§11 approved as a set. (2026-11-17)
