# api/

Transport only: generated types, the two openapi-fetch clients, CSRF handling and `AppError`. No Svelte and no `domain/` imports.

- `schema/open.json`, `schema/allauth.json`: committed snapshots of the backend's OpenAPI documents.
- `generated/`: types made from the snapshots by `pnpm api:gen`. Do not edit. CI re-runs `api:gen` and fails if the folder changes.
- `client.ts`: `createApi()` and the app-wide `api` (`api.open`, `api.allauth`). The generated paths already include their prefix (`/api/v1/...`, `/_allauth/{client}/v1/...`), so the base URL is empty. Pass `allauthParams` on every allauth call. Call `api.initCsrf()` once at startup.
- `provisional.ts`: hand-written types for endpoints the backend does not have yet (`me/player`, player profiles and ratings: backend#124 and backend#53). `index.ts` exports `provisionalApi`, the open client cast to those types, and the mocks have matching handlers in `mocks/handlers/provisional.ts`. It is temporary. When the endpoints ship, run `pnpm api:pull && pnpm api:gen` and then remove, in one PR (frontend#35): `provisional.ts`, the `provisionalApi` export, the provisional mock handlers and store state, and the imports of `api/provisional` in `features/players` and `mocks`. Switch `features/players/services.ts` to `api.open`.
- `csrf.ts`: copies the `csrftoken` cookie into `X-CSRFToken` on unsafe methods and retries once after a CSRF 403.
- `errors.ts`: `toAppError(error, response?)`. `unwrap.ts`: `unwrap(call)` returns data or throws an `AppError`.
  - Only a `fetch` that got no answer is kind `network`. The clients mark it as it happens. A 200 that is not JSON, an aborted call or any other thrown error is kind `server`, with the thrown value in `cause`.
  - `message` is safe to show and says what to do next. It is the backend's text only for `validation` and `duplicate`, where it names the field or the match. A `validation` error with no field says so instead of pointing at highlighted fields.

## Refreshing the snapshots

The backend commits its OPEN API document as `openapi/openapi.json`. To refresh the snapshot:

1. Update a backend checkout to the commit you want. It defaults to `../backend`, next to this repo. Set `BACKEND_DIR` to use another path (a relative path starts at the frontend repo root).
2. Run `pnpm api:pull`. It copies `openapi/openapi.json` to `schema/open.json` and formats it. It stops with a message if the file is missing.
3. Run `pnpm api:gen` and commit both.

allauth headless has no export command, so `pnpm api:pull:allauth` still fetches its document from a backend running on 127.0.0.1:8000. It is the same document `HEADLESS_SERVE_SPECIFICATION` serves. Run it only when the allauth routes change.

The allauth document describes endpoints OPEN disables (phone, codes, sessions). Wrap only the ones we use.
