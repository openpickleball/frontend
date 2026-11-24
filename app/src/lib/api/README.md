# api/

Transport only: generated types, the two openapi-fetch clients, CSRF handling and `AppError`. No Svelte and no `domain/` imports.

- `schema/open.json`, `schema/allauth.json`: committed snapshots of the backend's OpenAPI documents.
- `generated/`: types made from the snapshots by `pnpm api:gen`. Do not edit. CI re-runs `api:gen` and fails if the folder changes.
- `client.ts`: `createApi()` and the app-wide `api` (`api.open`, `api.allauth`). The generated paths already include their prefix (`/api/v1/...`, `/_allauth/{client}/v1/...`), so the base URL is empty. Pass `allauthParams` on every allauth call. Call `api.initCsrf()` once at startup.
- `ApiOption` (`{ api?: Api }`) is the one way to use another client. Every feature service that calls `api` takes it as its last argument and uses the app-wide `api` without it. (Only `fetchRatings` in `features/players` reads `provisionalApi` instead, until frontend#35 removes it.) Node tests pass a client from `createApi({ baseUrl, fetch, getCookies })` with a cookie jar on each call, for example `listMatches(code, 0, { api })`. There is no module-level setter, so nothing has to be restored after a test.
- `provisional.ts`: hand-written types for the one endpoint the backend does not have yet, ratings (`GET /api/v1/players/{code}/ratings`, backend#53). `me/player` and player profiles use the generated types. `index.ts` exports `provisionalApi`, the open client cast to those types, and the mocks have a matching handler in `mocks/handlers/provisional.ts`. It is temporary. When ratings ship, run `pnpm api:pull && pnpm api:gen` and then remove, in one PR (frontend#35): `provisional.ts`, the `provisionalApi` export, the provisional mock handler, `provisionalHttp` and the store's ratings, and the imports of `api/provisional` in `features/players` and `mocks`. Switch `fetchRatings` to `api.open`.
- `csrf.ts`: copies the `csrftoken` cookie into `X-CSRFToken` on unsafe methods and retries once after a CSRF 403.
- `errors.ts`: `toAppError(error, response?)`. `unwrap.ts`: `unwrap(call)` returns data or throws an `AppError`.
  - Only a `fetch` that got no answer is kind `network`. The clients mark it as it happens. A 200 that is not JSON, an aborted call or any other thrown error is kind `server`, with the thrown value in `cause`.
  - `AppError` is a class that extends `Error`, so it has a stack and a cause. `isAppError` also accepts a plain object with the same fields, as tests build them.
  - A request with no answer after 20 seconds (`REQUEST_TIMEOUT_MS`, or `timeoutMs` on `createApi`) is aborted and becomes kind `network` with code `timeout`. An abort the caller asked for stays kind `server` with code `aborted`.
  - A 429, and allauth's login lockout (a 400 with code `too_many_login_attempts`), are kind `throttled`.
  - `message` is safe to show and says what to do next. It is the backend's text only for `validation` and `duplicate`, where it names the field or the match. A `validation` error with no field says so instead of pointing at highlighted fields.

## Refreshing the snapshots

The backend commits its OPEN API document as `openapi/openapi.json`. To refresh the snapshot:

1. Update a backend checkout to the commit you want. It defaults to `../backend`, next to this repo. Set `BACKEND_DIR` to use another path (a relative path starts at the frontend repo root).
2. Run `pnpm api:pull`. It copies `openapi/openapi.json` to `schema/open.json` and formats it. It stops with a message if the file is missing.
3. Run `pnpm api:gen` and commit both.

allauth headless has no export command, so `pnpm api:pull:allauth` still fetches its document from a backend running on 127.0.0.1:8000. It is the same document `HEADLESS_SERVE_SPECIFICATION` serves. Run it only when the allauth routes change.

The allauth document describes endpoints OPEN disables (phone, codes, sessions). Wrap only the ones we use.
