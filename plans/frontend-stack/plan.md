# Choose the frontend stack

**Status:** done

## Goal

Pick the framework for the player-facing app before building more of `app/`. The choice has to give us a fast responsive web app first and leave a cheap path to mobile apps later. The full comparison of SvelteKit, React Native (Expo) and Flutter is in [decision.md](decision.md). [decision.html](decision.html) has the same content as a formatted page; open it in any browser.

## Steps

- [x] Share `decision.md` with the team and collect input, including answers to its open questions.
- [x] Agree on the stack, record it under Decisions, and set the status in `decision.md` to decided.
- [x] If the choice isn't SvelteKit, replace the starter in `app/` and update `app/AGENTS.md`. It is SvelteKit, so nothing to replace. `plans/app-migration/` is marked superseded.
- [x] Set up the shared TypeScript core (generated API client, validation, domain types) as its own package, separate from UI code. Moved to `plans/frontend-v1/` (tasks T2 and T3), where it lives as `app/src/lib/domain/` and `app/src/lib/api/`, not a separate package.
- [x] Add the PWA manifest and service worker, with an offline queue for score entry. Moved to `plans/frontend-v1/` (T10). The offline queue is deferred to a follow-up issue.

## Decisions

- SvelteKit, shipped as a responsive web app that works as a PWA on mobile. Capacitor is deferred. Expo only if a fully native app is ever needed. (2026-11-17)
- Hosting is out of scope here. See frontend#22.
