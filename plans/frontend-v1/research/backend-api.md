# Backend API research (as of 2026-11-17, backend `main`)

Source: `/Users/carlo/OpenPB/backend` (read-only). Paths below are relative to it.

## Summary

1. Django 5.2 + django-ninja API at `/api/v1/` (OpenAPI served live), plus django-allauth **headless** auth at `/_allauth/`. Only 7 first-party operations exist.
2. Match flow is available: submit (`POST /matches/`), confirm, dispute, list a player's matches. There is **no `GET /matches/{code}`**.
3. **Ratings do not exist in the API** (no Rating model, no endpoint; "no OPEN rating is live"). Also **no endpoint to create or read a Player profile**, and no player search/lookup. Issue #124 (P0, unstarted) plans `me/player` and `players/{code}`.
4. Auth: email+password sign-up with mandatory email verification. Two clients: `browser` (session cookie + CSRF, same-origin only: CORS credentials are off) and `app` (`X-Session-Token`, works cross-origin).
5. No committed OpenAPI file and I could not generate one (no `uv`, no venv, no `.env`). Live schema: `GET /api/v1/openapi.json` and `GET /_allauth/openapi.json` once the backend runs.

## 1. Endpoints

All first-party operations are in `config/api.py` (mounts at lines ~199-202) and require `auth=account_auth` unless noted. Every operation has an explicit `operation_id`.

| Method | Path | operation_id | Auth | Request | Success | Errors | Cite |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/health/live` | `health_live` | none | - | 200 `{status:"ok"}` | - | `config/health.py:80` |
| GET | `/api/v1/health/ready` | `health_ready` | none | - | 200 `{status:"ok",checks:{database,cache}}` | 503 same shape, `status:"unavailable"`, checks `"ok"\|"fail"` | `config/health.py:86` |
| GET | `/api/v1/accounts/me` | `get_current_account` | session or token | - | 200 `{email}` | 401 | `apps/accounts/api.py:17` |
| POST | `/api/v1/matches/` | `create_match` | session (+CSRF) or token | `MatchCreateIn` (below) | **201** `MatchOut` | 401, 403, 409, 422 | `apps/matches/api.py:136` |
| POST | `/api/v1/matches/{code}/confirm` | `confirm_match` | same | none | 200 `MatchOut` | 401, 403 (CSRF only), 404, 409 | `apps/matches/api.py:205` |
| POST | `/api/v1/matches/{code}/dispute` | `dispute_match` | same | none | 200 `MatchOut` | 401, 403 (CSRF only), 404, 409 | `apps/matches/api.py:222` |
| GET | `/api/v1/players/{code}/matches?limit&offset` | `list_player_matches` | same | query `limit` 1-100 (default 20), `offset` >=0 | 200 `{items: MatchOut[], count}` | 401, 404, 422 | `apps/players/api.py:68` |
| GET | `/api/v1/openapi.json`, `/api/v1/docs` | - | none | - | OpenAPI 3 / Swagger-style docs | - | `config/api.py` (`NinjaAPI(openapi_url, docs_url)`) |

Other mounted paths (not part of the ninja API): `/admin/` (Django admin), `/oauth/token/` and `/oauth/revoke_token/` (partner OAuth2 client credentials; not for the player app) (`config/urls.py`, `apps/partners/urls.py`), `/_allauth/...` (section 3).

### Schemas (`apps/matches/schemas.py`)

`MatchCreateIn` (lines 89-106). All fields below; `team_*` max 10 entries, `games` max 20 entries.

| Field | Type | Notes |
|---|---|---|
| `format` | `"singles" \| "doubles"` | required |
| `played_on` | `YYYY-MM-DD` | required; not after the latest local date on Earth |
| `team_a`, `team_b` | `string[]` | **OPEN Player codes** (e.g. `P-7K3M-QX9H`); any case/hyphens accepted |
| `games` | `{team_a:int, team_b:int}[]` | at least 1, at most 5 games (`MAX_GAMES`) |
| `best_of` | `1 \| 3 \| 5 \| null` | inferred from games if omitted |
| `game_target` | `11 \| 15 \| 21 \| null` | default 11 |
| `scoring_type` | `"side_out" \| "rally" \| null` | default side_out |

`MatchOut` (lines 124-136): `code`, `status` (`pending\|confirmed\|disputed\|voided`), `format`, `played_on`, `best_of`, `scoring_type`, `game_target`, `team_a: ParticipantOut[]`, `team_b: ParticipantOut[]`, `games: {number, team_a, team_b}[]`. `ParticipantOut` = `{code: string|null, display_name}` (code null and name "Private player" when that player's account is inactive, unless viewer is that player). No row ids, submitter, flags, or confirmation rows are ever returned. **Gaps for UI:** `MatchOut` has no "has the viewer already confirmed", no per-team confirmation state, no created/submitted-at timestamp, no viewer-can-confirm flag.

Score rules enforced (`apps/matches/services.py:~295-335`): no ties, no negatives, winner must reach target, win by 2, past target must end exactly +2.

### Error shape (`config/api_errors.py`)

Every ninja error: `{"code": str, "message": str, "errors": [{"field": "body.games.0", "code": str, "message": str}]}`.

| Status | `code` | When |
|---|---|---|
| 401 | `unauthorized` | no/invalid session token or cookie (fixed text "Authentication required."). Checked before CSRF. |
| 403 | `forbidden` | `create_match`: submitter's own Player is not on either team (or no Player at all). Also: signed-in **session** request without valid CSRF token (message distinguishes). Confirm/dispute 403 = CSRF only |
| 404 | `not_found` | unknown/malformed code, **and** also "you may not act on / see this" (confirm/dispute by non-participant; private/inactive player's history). Deliberately indistinguishable (ADR 0008) |
| 409 | `conflict` | confirm a disputed/voided match; dispute a voided match |
| 409 | `duplicate_match` | `create_match` duplicate; `errors[0].field` = `match` or `external_id`; message may include the earlier match code |
| 422 | `validation_error` | schema or score errors; `errors[].field` like `body.team_a.0`, `body.games.1`, `body.played_on`; per-item `code` e.g. `unknown_player`, `tie`, `target_not_reached`, `not_won_by_two`, `played_past_target`, `no_games`, `too_many_games`, `invalid_choice` |
| 405 | - | wrong method on a known path: **plain text**, not JSON |
| 404 | - | path matching no operation: Django's HTML 404 page |
| 500 | - | Django default |

Pagination: ninja `LimitOffsetPagination` -> `{ "items": [...], "count": <total> }`; default 20, max 100, newest first (`played_on`, `created_at`, `pk` desc) (`apps/players/api.py:39-65`). No cursor.

Visibility rules for the history list (`apps/players/api.py:81-90`): own Player -> every status; another signed-in account -> `confirmed` only, and only if the player's `match_history_visibility` is `signed_in` (default), otherwise 404.

Confirmation semantics (`apps/matches/workflow.py`): self-submitted match is `pending`; becomes `confirmed` when at least one player on **each** team has confirmed. Dispute -> `disputed` (moderator resolves; no moderator API). Repeat confirm/dispute is a no-op. Optional daily expiry (`MATCH_CONFIRMATION_EXPIRY_DAYS`, unset by default). A self-submission is created `pending` (`record_match` docstring, `apps/matches/services.py:~1107`); nothing indicates the submitter is auto-confirmed, so the submitter probably must also call `/confirm` for their own team (unverified; confirm with backend). A self-submitter's exact duplicate raises 409.

## 2. OpenAPI schema

| Item | Status |
|---|---|
| Library | django-ninja (not drf-spectacular) |
| Committed schema file | **None** (grep of repo found no `openapi*.json/yaml`) |
| Live, first-party | `GET /api/v1/openapi.json`, docs UI `GET /api/v1/docs` |
| Live, allauth | `GET /_allauth/openapi.json`, `GET /_allauth/openapi.html` |
| Export command | django-ninja ships `python manage.py export_openapi_schema --api config.api.api --output <file>` (standard ninja command; not used in the repo's docs). Issue #42 plans an official OpenAPI export |
| Generated here? | **No.** `uv` is not installed, `backend/.venv` and `.env` do not exist, system python lacks Django. I did not install anything into the backend. `openapi.yaml` was **not** written to the scratchpad |

To generate it yourself (read-only; settings load needs env but `check`-style commands need no DB):

```bash
cd backend && cp .env.example .env   # or export vars inline; DJANGO_DEBUG=True needs no secret key
uv sync
uv run python manage.py export_openapi_schema --api config.api.api --output /tmp/open-openapi.json
# or simply: uv run python manage.py runserver, then curl http://127.0.0.1:8000/api/v1/openapi.json
```

Notes for codegen: operation ids are stable and explicit (made for clients). The OPEN schema documents `ErrorResponse` for 401/422 on every relevant operation. allauth's schema is a separate document and describes extra endpoints OPEN has disabled (phone, codes, user sessions).

## 3. Auth, CORS, CSRF

| Topic | Detail | Cite |
|---|---|---|
| Mechanism | django-allauth 65 **headless only**, no JWT, no social login, no MFA yet. Session-based; partners use OAuth2 client credentials (irrelevant to the player app) | `CLAUDE.md` Authentication; ADR 0014; `config/settings.py:~599-625` |
| Sign-up/login | Yes. Email + password only; email verification **mandatory** (no login until verified). Verification and password reset are emailed **links** to frontend pages, not codes | `settings.py:570-585` |
| Clients | `browser`: `/_allauth/browser/v1/...`, Django session cookie + CSRF. `app`: `/_allauth/app/v1/...`, token in `X-Session-Token` header (returned in the login/signup response `meta.session_token`) | `settings.py:602-603`, `config/auth.py` |
| API auth | `account_auth = [SessionTokenAuth(), SessionAuth()]`: send either `X-Session-Token` or the session cookie. Cookie requests need CSRF on POST (`X-CSRFToken` header, token from the `csrftoken` cookie; allauth's `GET .../config` sets it) | `config/auth.py:78-end` |
| CORS | `django-cors-headers`, applies to `^/(api\|_allauth)/` only. Origins from env `CORS_ALLOWED_ORIGINS` (exact origins, empty = none). `CORS_ALLOW_CREDENTIALS = False`. Allowed extra headers: `x-session-token`, `x-email-verification-key`, `x-password-reset-key` | `settings.py:273-296` |
| Consequence | **Browser client (cookie) works same-origin only** (proxy `/api/` and `/_allauth/` through the SvelteKit dev server/host). Cross-origin from `localhost:5173` only works with the `app` client + `X-Session-Token`, with the origin added to `CORS_ALLOWED_ORIGINS` (storing the token in browser storage is XSS-exposed) | ADR 0014 Consequences |
| Planned prod layout | PWA at `app.openpb.org` calls API **same-origin** (App Platform routes `/api/`, `/_allauth/`, `/oauth/` to Django), using the `browser` client; host-only `__Host-` cookies; `FRONTEND_URL=https://app.openpb.org` (issues #182, #183, #102) | gh issues |
| `FRONTEND_URL` | Required env var; email links go to `${FRONTEND_URL}/account/verify-email/{key}`, `/account/password/reset`, `/account/password/reset/key/{key}`, `/account/signup`. `.env.example` default is `http://localhost:8081` (Expo) - **set it to the SvelteKit dev origin** | `settings.py:617-624` |
| Error format | allauth uses **its own** response/error format (not `ErrorResponse`), so the frontend needs two error parsers | ADR 0014 |

allauth headless endpoints in use (under `/_allauth/{browser|app}/v1/`, per allauth docs; confirm in `/_allauth/openapi.json`): `config`, `auth/signup`, `auth/login`, `auth/session` (GET/DELETE), `auth/email/verify` (GET/POST), `auth/password/request`, `auth/password/reset` (GET/POST), `account/email`, `account/password/change`. OPEN overrides sign-up, reset-request and verify views (`apps/accounts/headless_views.py`). Sign-up and reset respond identically whether or not the address exists.

## 4. Domain models

All public records are addressed by an **OPEN Code** (`apps/public_ids/codes.py`): prefix + random Crockford base32 + check char, grouped in fours. `P` player (8 chars after prefix), `C` club, `E` event, `G` organizer, `M` match (12). The API never exposes row ids.

| Model (app) | Key fields | Relations / notes |
|---|---|---|
| `User` (accounts) | `email` (login, unique case-insens., ASCII) | custom user model, no username |
| `Player` (players) | `display_name` (<=64), `legal_name`, `birth_year`, `birth_month`, `gender_division` (`mens\|womens\|""`), `city`, `region`, `public_code` | 1:1 with Account (`PROTECT`); created only via `create_player()` service (no API) |
| `PlayerPrivacy` (players) | `city_region_/match_history_/rating_history_/stats_/home_club_visibility` = `signed_in` (default) or `private` | 1:1 with Player. Display name and current ratings have no privacy setting |
| `Match` (matches) | `format`, `played_on`, optional `played_at`+utc offset, `status`, `best_of`, `game_target`, `scoring_type`, `external_id`, `location`, `event_label`, `bracket_label`, `fingerprint`, `corrects`, `created_at` | optional `event`, `club`; submitted by an Account or a partner application; append-only ledger (edit = void + new correcting match) |
| `MatchParticipant` | `team` (`A\|B`) | Match <-> Player |
| `Game` | `game_number`, `team_a_score`, `team_b_score` | belongs to Match |
| `MatchConfirmation` | decision `confirm\|dispute` | per actor |
| `MatchFlag` | reason `possible_duplicate` | moderator-facing; not in API |
| `Club` (clubs) | `name`, `city`, `region` | roles via `ClubRole`; no API |
| `Organizer` / `OrganizerMember` (clubs) | `name`, `verified_at`; member role | verification service + admin only; no API |
| `Event` (events) | `name`, `kind` (`tournament\|league\|rec_verified`), `organizer`, `club`, `start_date`, `end_date`, `weight` (#189 removes it) | admin only; no API |
| `PartnerApplication`, `ClubApplicationGrant` (partners) | OAuth app | partner-only |
| `AuditEvent` (audit), `QueuedEmail` (emails) | | internal |
| **Rating** | **does not exist** | domain terms (CONTEXT.md): rating 2.0-8.0 per format (`singles`, `doubles`, `mixed_doubles`, `doubles_men`, `doubles_women`), RD, reliability %. Engine is a separate repo, pinned as a git dep, "demonstration" output only |

## 5. MVP capability matrix

| Capability | Status | What exists / what is missing |
|---|---|---|
| Sign up, verify email, log in/out, reset password | AVAILABLE | allauth headless; email links point at `FRONTEND_URL` pages the frontend must build (`/account/verify-email/{key}`, `/account/password/reset`, `/account/password/reset/key/{key}`, `/account/signup`) |
| Current account | AVAILABLE | `GET /accounts/me` returns only `{email}` - no player info |
| Create my Player profile (get an OPEN code) | **MISSING** | service `create_player` exists, no endpoint. Planned: `POST /api/v1/me/player` (#124, P0, blocked-by #92/#30/#19; #92 and #19 are CLOSED, #30 done, so effectively unblocked) |
| View/edit my profile and privacy | **MISSING** | planned `GET/PATCH /me/player` (#124) |
| Look up a player's rating | **MISSING** | no Rating model/endpoint/engine integration; ratings are "not live"; issues #122 (seed via engine), #140, #83. Frontend can only mock |
| View a player's public profile | **MISSING** | planned `GET /players/{code}` (#124). Only `players/{code}/matches` exists |
| Search/find a player by name (to pick opponents) | **MISSING** | no search/list endpoint; matches require typing OPEN codes. No issue found for search |
| Find my own player code after login | **MISSING** | `accounts/me` has no code; own code derivable only if #124 adds `me/player` |
| Record a match (enter scores) | AVAILABLE | `POST /matches/`; submitter must be a participant and have a Player; teams by OPEN code; client-side validation of scores should mirror the rules in section 1 |
| List matches (a player's) | PARTIAL | `GET /players/{code}/matches` works with paging; no filter by status/date, no "all my matches awaiting me" list, no global feed. Own list shows all statuses |
| View a single match | **PARTIAL** (workaround) | no `GET /matches/{code}`. Fetch it from a participant's list, or reuse the 201/200 body of create/confirm/dispute |
| Confirm / dispute a match | AVAILABLE | `POST /matches/{code}/confirm` and `/dispute` (no body, no dispute reason stored). No "pending for me" inbox and no `MatchOut` field saying whether I already confirmed |
| Edit/void/correct a match | MISSING (service only) | `edit_match`/`void_match` exist in workflow, no API |
| Rating history / stats | MISSING | privacy settings exist; no data |
| Clubs, events, organizer tools | MISSING | models + admin only (#125 planned) |
| Account deletion / data export | MISSING | #116 |
| Email notifications to opponents to confirm | PARTIAL | outbox + template exist; `render_confirmation_request` "renders only, nothing sends it yet" (CLAUDE.md). So confirm requests are not emailed yet |

## 6. Running locally

Prereqs: git, `uv`, Docker with Compose v2, free ports 5432/6379 on 127.0.0.1 (`README.md`, `compose.yaml`).

```bash
cd backend
cp .env.example .env            # then edit: FRONTEND_URL, CORS_ALLOWED_ORIGINS
uv sync
docker compose up -d --wait     # postgres:18 (trust auth, user/db "open") + valkey:8
uv run python manage.py migrate
uv run python manage.py seed_dev_data --players 20   # DEBUG only; made-up data
uv run python manage.py runserver                    # http://127.0.0.1:8000
# optional Celery (account emails are queued): uv run celery -A config worker -Q ratings,email,webhooks,default -l info
# or all-in-container: docker compose --profile web up -d --wait  (app + worker + beat; run migrate first)
```

| Setting | Value for SvelteKit dev (suggest) | Why |
|---|---|---|
| `DJANGO_DEBUG` | `True` | enables dev secret key, console email backend, `seed_dev_data` |
| `FRONTEND_URL` | `http://localhost:5173` (exact origin) | email links; default in `.env.example` is Expo's 8081 |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | only helps the `app` client (token header); credentials CORS is off |
| `CSRF_TRUSTED_ORIGINS` | `http://localhost:5173` if posting cookie-auth cross-origin (not useful; prefer proxy) | |
| Cookie auth | Vite dev proxy `/api` and `/_allauth` -> `127.0.0.1:8000` (same-origin) | matches planned prod layout |
| Verification email | With DEBUG and empty `EMAIL_BACKEND`, emails print to the console of the **Celery worker** (so run a worker, otherwise verification links never appear) | README; ADR 0016 |
| Seed data | `seed_dev_data` makes Clubs, verified Organizers, Events, Players (+ Accounts), and confirmed Matches via the real services (`apps/devdata/seed.py`). Seeded account credentials/emails are Faker-generated: **check the command's output or `apps/accounts/tests/factories.py`** for how to log in; I did not run it. Simplest path: sign up in the UI and read the verification link from the worker log | |

No fixtures/JSON dumps. Tests: `uv run pytest` (needs the compose Postgres). Existing `apps/accounts/tests/headless.py` shows the allauth call sequence in code.

## 7. In progress / planned (GitHub `openpickleball/backend`, milestone v0.1 MVP)

| Issue | What | Relevance |
|---|---|---|
| #124 (P0, M) | Player profile endpoints: `POST/GET/PATCH /me/player`, `GET /players/{open_id}` | Blocks the whole player UI. Nothing started (no assignee) |
| #125 (P0, S) | Organizer event endpoints | later |
| #42 | OpenAPI export | codegen source |
| #182, #183 | ADR + infra: PWA at `app.openpb.org`, same-origin routing of `/api/`, `/_allauth/`, `/oauth/`; browser client | confirms SvelteKit PWA + cookie auth |
| #102 | Prod security: CORS/CSP/cookies, `__Host-` prefix, may allow credentialed CORS for first-party origins | |
| #100, #99, #117 | Login limits, MFA, passkeys (browser client; native passkeys #185) | auth flow will grow |
| #114 | Age screen / 13+ rule at sign-up | will add fields to sign-up/profile |
| #116 | Account deletion + retention | |
| #122, #140, #83, #174, #175 | Rating seeding via engine, rating freshness endpoint, partner rating lookup, peak-rating eligibility | ratings API has no issue for a player-facing "my rating" endpoint other than #124's profile; confirm with backend team |
| #157 | Player home club | profile field |
| #169 | Profile pictures (blocked by #124) | |
| #35 / #36 | Email sending for match confirmation requests | not yet sending |
| ADRs 0014 (auth), 0015 (match endpoints) status **Proposed**; ADR 0005 versioning/error format; ADR 0008 public ids; ADR 0002 player identity | | `docs/adr/` |

## Open questions to raise with the backend team

1. Timeline for #124 and for any rating-read endpoint (profile with ratings? `GET /players/{code}` including current ratings per format?).
2. Add `GET /matches/{code}` and a viewer-aware field (`can_confirm`, `confirmed_by_me`, per-team confirmation counts), plus a "my pending" list.
3. Player search by display name (needed to pick opponents without typing codes), or a share-my-code mechanism.
4. Should `accounts/me` return the player code / profile existence?
5. Dev CORS: is credentialed CORS for `localhost` planned (#102), or must we proxy?
