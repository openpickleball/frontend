# Choose the frontend stack

**Status:** done

## Goal

Pick the framework for the player-facing app before building more of `app/`. The choice has to give us a fast responsive web app first and leave a cheap path to mobile apps later. The full comparison of SvelteKit, React Native (Expo) and Flutter is in [decision.md](decision.md). [decision.html](decision.html) is a formatted copy of the original analysis; `decision.md` is the current version.

## Steps

- [x] Share `decision.md` with the team and collect input, including answers to its open questions.
- [x] Agree on the stack, record it under Decisions, and set the status in `decision.md` to decided.
- [x] If the choice isn't SvelteKit, replace the starter in `app/` and update `app/AGENTS.md`. It is SvelteKit, so nothing to replace. `plans/app-migration/` is marked superseded.
- [ ] Moved to `plans/frontend-v1/` (T2, T3, T10): set up the shared TypeScript core (generated API client, validation, domain types).
- [ ] Moved to `plans/frontend-v1/` (T2, T3, T10): add the PWA manifest and service worker. The offline queue is deferred to frontend#33.

## Decisions

- SvelteKit, shipped as a responsive web app that works as a PWA on mobile. Capacitor first if app stores are needed; Expo only if a fully native app is needed. Neither is in v1. (2026-11-17)
- Hosting is out of scope here. See frontend#22.
