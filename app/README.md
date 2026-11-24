# OPEN app

The SvelteKit frontend for OPEN. See the [root README](../README.md) for the project overview and [AGENTS.md](AGENTS.md) for the available commands and conventions.

This page shows how to run the app on your machine, with or without the real backend.

## Prerequisites

For the app alone:

- Node 26 (see [`.nvmrc`](../.nvmrc)).
- [pnpm](https://pnpm.io/).

To also run the backend, which lives in the [backend repository](https://github.com/openpickleball/backend):

- [uv](https://docs.astral.sh/uv/getting-started/installation/). It installs Python 3.13 for you.
- [Docker](https://docs.docker.com/get-docker/) with Compose v2. The backend runs Postgres and Valkey from `compose.yaml`. Ports 5432 and 6379 must be free on `127.0.0.1`.
- The backend's own README is the source of truth. If a command below stops working, check it there.

## Run the app

From `app/`:

```sh
pnpm install
pnpm dev
```

The app is at http://localhost:5173. With no `.env`, it talks to the backend (see below). To run it with no backend at all, use a mock mode.

### Settings

Settings go in `app/.env`, which git ignores. There is one:

| Value                     | What it does                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `PUBLIC_API_MOCK=off`     | The default. Every request goes to the real backend.                                      |
| `PUBLIC_API_MOCK=missing` | Only the endpoints the backend does not have yet are answered by mocks. The rest is live. |
| `PUBLIC_API_MOCK=all`     | The whole API is mocked in the browser, with made-up players. No backend needed.          |

The City field at signup asks Photon (`photon.komoot.io`) for suggestions from the browser. In `off` it calls the real Photon, so it needs a network connection. In `missing` and `all` a mock answers with made-up places.

Anything else counts as `off`. The value is fixed when the dev server starts, so restart `pnpm dev` after you change it. In `missing` and `all`, ratings on the profile page are labeled as samples. They are made up, and no OPEN rating is live.

With `all`, you can sign in as `player@example.com` (see `src/lib/mocks/fixtures.ts` for the password and the other made-up players).

### The `/api` proxy

`pnpm dev` forwards `/api` and `/_allauth` to the backend at `http://127.0.0.1:8000` (see `vite.config.ts`). The browser only ever talks to `localhost:5173`, so the session cookie and CSRF protection work without CORS settings.

## Run the whole stack

With the backend cloned next to this repo (or `BACKEND_DIR` set to its path), one command starts everything. From `app/`:

```sh
pnpm dev:stack
```

It starts Postgres and Valkey, runs the migrations, then runs the backend on port 8000, a Celery worker (it prints account emails) and the app on port 5173 with `PUBLIC_API_MOCK=off`. On the first run it creates the backend `.env` with `FRONTEND_URL=http://localhost:5173`. Add `--seed 20` to add 20 made-up players and verify their accounts (see [Verified accounts and logins](#verified-accounts-and-logins)). Each seed run adds a new set.

Ctrl+C stops everything and keeps your local data. To stop it from another terminal, run `pnpm dev:stack --stop`. Postgres and Valkey stop too, unless they were already running before the stack started. Ports 5432, 6379, 8000 and 5173 must be free. The script checks them first and names the container in the way.

The sections below do the same steps by hand.

## Run the backend

From a clone of the backend, next to this one (`../backend`). First copy the settings and point links in emails at the app:

```sh
cp .env.example .env
```

Then edit `.env` and set the web app's address (the default is for another app), so links in emails open the app you are running:

```sh
FRONTEND_URL=http://localhost:5173
```

Then:

```sh
uv sync
docker compose up -d --wait
uv run python manage.py migrate
uv run python manage.py seed_dev_data --players 20
uv run python manage.py runserver
```

To run the server in a container instead of `runserver`, use `docker compose --profile web up -d --wait` after `migrate`. It also starts the Celery worker (see Email), and it uses the same port, so stop one before starting the other.

The backend then answers on http://127.0.0.1:8000. Check it at http://127.0.0.1:8000/api/v1/health/live.

`seed_dev_data` adds made-up players and confirmed matches. Every name comes from a generator and every email is on `example.com`, `example.org` or `example.net`. Each run adds a new set. To start over, run `docker compose down -v` in the backend, then the steps above again.

To stop: press Ctrl+C in the `runserver` terminal, then run `docker compose down` in the backend.

When the backend changes its API, update your backend checkout, then run `pnpm api:pull` and `pnpm api:gen` to update the typed client. `api:pull` copies `openapi/openapi.json` from `../backend` (set `BACKEND_DIR` for another path) and needs no running server. See `src/lib/api/README.md`.

## Email

The backend never sends mail while it handles a request. It saves each message, and a Celery worker sends it. In local development, with `DJANGO_DEBUG` on and `EMAIL_BACKEND` empty, the worker prints the message to its own console. Nothing leaves your machine. Queued mail prints only while the worker is running.

So to receive a verification email, run a worker in a second terminal, in the backend:

```sh
uv run celery -A config worker -Q ratings,email,webhooks,default -l info
```

Sign up in the app. The worker prints the email, with a link like this:

```text
http://localhost:5173/account/verify-email/OA%3A1xThTA%3A...
```

Open that link in the browser. It lands on the app's `/account/verify-email/[key]` page, which verifies the address. If you do not want to run a worker, use the shell snippet in the next section instead.

## Verified accounts and logins

Sign-in needs a verified email. The seed command creates accounts that are not verified, so you cannot sign in with them yet. Until backend issue [#195](https://github.com/openpickleball/backend/issues/195) (seed logins) ships, run this in the backend. It marks every `example.com`, `example.org` and `example.net` account as verified, and prints each player's login and OPEN code:

```sh
uv run python manage.py shell -c "
from allauth.account.models import EmailAddress
from apps.players.models import Player
for p in Player.objects.select_related('account').order_by('pk'):
    a = p.account
    if a.email.rsplit('@', 1)[-1] in ('example.com', 'example.org', 'example.net'):
        EmailAddress.objects.update_or_create(user=a, email=a.email, defaults={'verified': True, 'primary': True})
        print(a.email, p.public_code, p.display_name)
"
```

It is safe to run again. Each line is the email, the OPEN code and the made-up name.

The seeded accounts all use the password `made-up-test-password`, which comes from the backend's test factories. It is for local development only. An account you sign up for yourself keeps the password you chose. To verify it, add its email to the list above, or open its email link.

The command prints no real data. Do not put real player names, emails or matches in your local database if you plan to share screenshots or logs.

### Your own OPEN code

The backend does not show a player their own code yet (backend [#124](https://github.com/openpickleball/backend/issues/124)). Until it does, the app asks for your code once, the first time you record a match or open your matches, and keeps it on that device. Use the code the snippet above printed on the same line as your login. For a player you created some other way, print it with:

```sh
uv run python manage.py shell -c "
from apps.players.models import Player
print(Player.objects.get(account__email='your.email@example.com').public_code)
"
```

## Tests

| Command            | What it runs                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`        | Unit and component tests.                                                                                                                                    |
| `pnpm e2e`         | Playwright tests against a production build with `PUBLIC_API_MOCK=all`. No backend.                                                                          |
| `pnpm e2e:webkit`  | The same tests in WebKit (iPhone 15). Needs `pnpm exec playwright install webkit`.                                                                           |
| `pnpm e2e:pwa`     | Manifest, service worker and offline shell, against a build with the mocks off (port 4184, or `E2E_PWA_PORT`). Do not run it at the same time as `pnpm e2e`. |
| `pnpm e2e:live`    | One happy path against the real local backend. Local only, never run in CI.                                                                                  |
| `pnpm check:build` | After `pnpm build` with the mocks off: checks that `build/` has no msw code, no mock fixtures and no `mockServiceWorker.js`.                                 |

`pnpm e2e` serves the build on port 4183. Set `E2E_PORT` to use another port, for example when two checkouts run at the same time:

```sh
E2E_PORT=4194 pnpm e2e
```

### Live happy path

`pnpm e2e:live` starts `pnpm dev` on port 5174 with `PUBLIC_API_MOCK=off` (set `E2E_LIVE_PORT` to change the port). Then one test signs in, records a singles match against another player, checks that the match page says it is waiting for the other team, and finds the match in the matches list.

It needs the backend running as described above, with seeded players that are verified. Pick two players from the snippet's output, and pass them in the environment:

```sh
LIVE_EMAIL=player1.example@example.com \
LIVE_PASSWORD=made-up-test-password \
LIVE_OWN_CODE=P-AAAA-BBBB \
LIVE_OPPONENT_CODE=P-CCCC-DDDD \
pnpm e2e:live
```

| Value                | What it is                                                                       |
| -------------------- | -------------------------------------------------------------------------------- |
| `LIVE_EMAIL`         | The email of a verified, seeded player.                                          |
| `LIVE_PASSWORD`      | That player's password.                                                          |
| `LIVE_OWN_CODE`      | That player's own OPEN code. The app asks for it once, until backend #124 ships. |
| `LIVE_OPPONENT_CODE` | The OPEN code of a second seeded player.                                         |

The test skips, and says why, when the backend does not answer or `LIVE_EMAIL`, `LIVE_PASSWORD` or `LIVE_OPPONENT_CODE` is missing. It skips before `pnpm dev` starts when a value is missing. Each run adds one pending match to your local database. The scores come from the time of day and differ on every run, because the backend refuses a match that repeats one from the same day. It is not part of `pnpm e2e` or `pnpm test`.
