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

| Value                     | What it does                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `PUBLIC_API_MOCK=off`     | The default. Every API request goes to the real backend.                                                                 |
| `PUBLIC_API_MOCK=missing` | Only the endpoints the backend does not have yet, and City suggestions, are mocked. Today that is only City suggestions. |
| `PUBLIC_API_MOCK=all`     | The whole API is mocked in the browser, with made-up players. No backend needed.                                         |

Anything else counts as `off`. The value is fixed when the dev server starts, so restart `pnpm dev` after you change it. Ratings on the profile page are labeled as demonstration numbers in every mode. In `all` they are made up.

The City field at signup asks Photon (`photon.komoot.io`) for suggestions from the browser. In `off` it calls the real Photon, so it needs a network connection. In `missing` and `all` a mock answers with made-up places.

With `all`, you can sign in as `player@example.com` (see `src/lib/mocks/fixtures.ts` for the password and the other made-up players).

### The `/api` proxy

`pnpm dev` forwards `/api` and `/_allauth` to the backend at `http://127.0.0.1:8000` (see `vite.config.ts`). The browser only ever talks to the backend through `localhost:5173`, so the session cookie and CSRF protection work without CORS settings.

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

The app reads your code from `GET /api/v1/me/player` (backend [#124](https://github.com/openpickleball/backend/issues/124)). When your account has no player yet, the app creates it with `POST /api/v1/me/player`, from the details the backend holds from your signup in that browser session. If the backend holds none (you signed out and in again, or signed in on a different device or browser than the one you signed up in), the app asks for your birth month and year, gender and a display name, then creates the player. The app never asks you to type in your own code, and keeps nothing about it in the browser. If `me/player` fails or can't be reached, the screen shows an error with Try again. To look up the code of a player you created some other way, print it with:

```sh
uv run python manage.py shell -c "
from apps.players.models import Player
print(Player.objects.get(account__email='your.email@example.com').public_code)
"
```

## Hosting on App Platform

This section is a proposal. The app is not deployed yet (frontend#22), and nothing here has been checked against a real deploy. The spec it changes belongs to the backend repository, which owns it and validates it with `doctl apps spec validate`.

### Why the app joins the backend's app

App Platform routes paths only between components of one app. The app calls `/api/`, `/_allauth/` and `/oauth/` on its own origin, and the backend keeps `CORS_ALLOW_CREDENTIALS` off, so sign-in only works when the backend and the app share a host. The app is therefore a `static_sites` component in the backend's spec, `.do/production.yaml` in `openpickleball/backend` (app `open-backend-production`), next to its `web` service.

### The addition to `.do/production.yaml`

```yaml
# The web app (openpickleball/frontend, app/). A static build: the shell, its
# files and the service worker.
static_sites:
  - name: app
    github:
      repo: openpickleball/frontend
      branch: main
      deploy_on_push: true
    source_dir: app
    environment_slug: node-js
    # Builds with the mocks off, then fails the deploy if the build ships mock
    # code or a broken content security policy.
    build_command: pnpm build && pnpm check:build
    envs:
      - key: PUBLIC_API_MOCK
        value: 'off'
        scope: BUILD_TIME
    output_dir: build
    # Every path the app does not have a file for gets the SPA shell.
    catchall_document: index.html

domains:
  - domain: app.openpb.org
    type: ALIAS

ingress:
  rules:
    # Django on the app's host. preserve_path_prefix keeps /api/ and the
    # others in the path; by default App Platform strips the matched prefix.
    - match:
        authority:
          exact: app.openpb.org
        path:
          prefix: /api/
      component:
        name: web
        preserve_path_prefix: true
    - match:
        authority:
          exact: app.openpb.org
        path:
          prefix: /_allauth/
      component:
        name: web
        preserve_path_prefix: true
    - match:
        authority:
          exact: app.openpb.org
        path:
          prefix: /oauth/
      component:
        name: web
        preserve_path_prefix: true
    # Everything else on app.openpb.org is the app.
    - match:
        authority:
          exact: app.openpb.org
        path:
          prefix: /
      component:
        name: app
    # Any other host keeps going to Django, as it does today.
    - match:
        path:
          prefix: /
      component:
        name: web
```

### Backend steps (in the backend repository, not here)

- `DJANGO_ALLOWED_HOSTS` is `${APP_DOMAIN}` only today. `app.openpb.org` must be allowed too (backend#183 sets the hosts).
- If `app.openpb.org` is not the app's primary domain, Django's CSRF trusted origins must include `https://app.openpb.org`.
- Add the block above and validate it with `doctl apps spec validate`.

### What App Platform cannot do

- **Response headers.** A static site component has no field for them. The content security policy (`src/csp.ts`) travels in the page instead, as the `<meta http-equiv="content-security-policy">` that SvelteKit writes into `build/index.html`.
- **Framing protection.** A meta policy ignores `frame-ancestors` (and `report-uri` and `sandbox`), and `X-Frame-Options` is a header. So any site can put the app in a frame. That gap stays open until the app is served by something that sends headers.

`pnpm dev` and `pnpm preview` render pages on the fly, so they send the same policy as a response header, not the meta tag. In dev SvelteKit adds `'unsafe-inline'` to `style-src` for Vite's injected styles. The built `index.html` is what App Platform serves.

### Check on the first deploy

These could not be checked here:

- The Node and pnpm versions the buildpack picks. The app needs Node 26 and the pnpm in `packageManager`. The `.nvmrc` sits at the repository root, outside `source_dir`, and `package.json` has no `engines`, so the buildpack may not see the Node version.
- Cache headers on `service-worker.js` and `index.html`. Both must be revalidated on every load, or players keep an old shell and an old policy until the cache expires. Files under `/_app/immutable/` can be cached for a long time.
- That `/api/`, `/_allauth/` and `/oauth/` reach Django with their prefix, and that the session cookie and CSRF work on `app.openpb.org`.
- That the page shows no content security policy errors in the browser console.

## Tests

| Command            | What it runs                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`        | Unit and component tests.                                                                                                                                                                                           |
| `pnpm e2e`         | Playwright tests against a production build with `PUBLIC_API_MOCK=all`. No backend.                                                                                                                                 |
| `pnpm e2e:webkit`  | The same tests in WebKit (iPhone 15). Needs `pnpm exec playwright install webkit`.                                                                                                                                  |
| `pnpm e2e:pwa`     | Manifest, service worker and offline shell, against a build with the mocks off (port 4184, or `E2E_PWA_PORT`). Do not run it at the same time as `pnpm e2e`.                                                        |
| `pnpm e2e:live`    | One happy path against the real local backend. Local only, never run in CI.                                                                                                                                         |
| `pnpm check:build` | After `pnpm build` with the mocks off: checks that `build/` has no msw code, no mock fixtures and no `mockServiceWorker.js`, and that `index.html` has one content security policy that hashes every inline script. |

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
LIVE_OPPONENT_CODE=P-CCCC-DDDD \
pnpm e2e:live
```

| Value                | What it is                               |
| -------------------- | ---------------------------------------- |
| `LIVE_EMAIL`         | The email of a verified, seeded player.  |
| `LIVE_PASSWORD`      | That player's password.                  |
| `LIVE_OPPONENT_CODE` | The OPEN code of a second seeded player. |

The test skips, and says why, when the backend does not answer or `LIVE_EMAIL`, `LIVE_PASSWORD` or `LIVE_OPPONENT_CODE` is missing. It skips before `pnpm dev` starts when a value is missing. Each run adds one pending match to your local database. The scores come from the time of day and differ on every run, because the backend refuses a match that repeats one from the same day. It is not part of `pnpm e2e` or `pnpm test`.
