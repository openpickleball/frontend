# Choose the frontend stack

**Status:** planned

## Goal

Pick the framework for the player-facing app before building more of `app/`. The choice has to give us a fast responsive web app first and leave a cheap path to mobile apps later. The full comparison of SvelteKit, React Native (Expo) and Flutter is in [decision.md](decision.md). [decision.html](decision.html) has the same content as a formatted page; open it in any browser.

## Steps

- [ ] Share `decision.md` with the team and collect input, including answers to its open questions.
- [ ] Agree on the stack, record it under Decisions, and set the status in `decision.md` to decided.
- [ ] If the choice isn't SvelteKit, replace the starter in `app/` and update `app/AGENTS.md`. Either way, update `plans/app-migration/` to match.
- [ ] Set up the shared TypeScript core (generated API client, validation, domain types) as its own package, separate from UI code.
- [ ] Add the PWA manifest and service worker, with an offline queue for score entry.

## Decisions

None yet. Proposed: SvelteKit, shipped as an installable PWA, with Capacitor as the first step into the app stores and Expo only if a fully native app is needed.
