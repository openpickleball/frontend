# Frontend v1.1: use what the backend shipped after v1

**Status:** done

## Goal

The app uses the backend features that landed after v1 (`plans/frontend-v1/`):

- Players see which matches need their confirmation and which wait on the other team, instead of a hedged "Pending matches".
- Players find opponents and partners by name when they record a match.
- A match opens straight from its URL, including the link in the confirmation email.

Still out of scope: a player's own code (backend#124) and ratings (backend#53). The one-time code entry and the "Coming soon" ratings card stay until they ship (frontend#35).

## Backend changes this builds on (2026-11-18)

- backend#201: the OpenAPI document is committed at `openapi/openapi.json` and CI checks it.
- backend#204 (closes backend#193): every `MatchOut` carries `my_team`, `my_decision`, `confirmed_by_team` and `created_at` for the signed-in viewer.
- backend#203: `GET /api/v1/me/matches/awaiting-confirmation` lists pending matches where no one on the player's team has confirmed.
- backend#202: `GET /api/v1/players/search?q=` finds players by display name (signed in, throttled).
- backend#210: `GET /api/v1/matches/{code}` for the match's players.

## Steps

- [x] U1 Sync the API schema with the backend's committed copy (frontend#72)
- [x] U2 Show players which matches need their confirmation (frontend#73), after U1
- [x] U3 Find players by name when recording a match (frontend#74), after U1
- [x] U4 Load match detail by code (frontend#75), after backend#210 merges, U1 re-run and U2

U2 and U3 run in parallel: U2 stays in `features/matches`, U3 in `features/record-match`. U2's endpoint lives in `handlers/open.ts` with the other open-API handlers, and U3's search handler has its own file.

## Working agreements

The same as `plans/frontend-v1/plan.md`: one issue and one `issue-<N>-<slug>` branch per step, Sonnet implements, Opus reviews, and CI must pass before merge.

## Decisions

- **The schema comes from a backend checkout, not a running server.** `pnpm api:pull` copies `openapi/openapi.json` from `BACKEND_DIR` (default `../backend`). The snapshot stays pinned in this repo and is refreshed on purpose, so a backend change never breaks frontend CI by itself.
- **The backend decides whose turn it is.** Home and match detail read `my_team`, `my_decision` and `confirmed_by_team` instead of working them out from the stored code.

## Outcome (2026-11-19)

Shipped in #76 (U1, schema sync), #79 (U2, what needs a player's confirmation), #80 (U3, find players by name) and this PR (U4, match detail by code). `/matches/{code}` now reads `GET /api/v1/matches/{code}`. A cached copy shows first when there is one, and the response replaces it. A 404 shows "We couldn't find this match", the same for a match the player was not in and an unknown code.

Still open:

- backend#124: a player's own code, so the one-time code entry can go.
- backend#53: ratings, so the "Coming soon" ratings card can go.
- backend#195, backend#196 and backend#199.
- Frontend follow-ups #33, #34, #35, #36, #57 and #22.
