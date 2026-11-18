# api/

Transport only: generated types, the two openapi-fetch clients, CSRF handling and `AppError`. No Svelte and no `domain/` imports.

- `schema/open.json`, `schema/allauth.json`: committed snapshots of the backend's OpenAPI documents.
- `generated/`: types made from the snapshots by `pnpm api:gen`. Do not edit. CI re-runs `api:gen` and fails if the folder changes.
- `client.ts`: `createApi()` and the app-wide `api` (`api.open`, `api.allauth`). The generated paths already include their prefix (`/api/v1/...`, `/_allauth/{client}/v1/...`), so the base URL is empty. Pass `allauthParams` on every allauth call. Call `api.initCsrf()` once at startup.
- `csrf.ts`: copies the `csrftoken` cookie into `X-CSRFToken` on unsafe methods and retries once after a CSRF 403.
- `errors.ts`: `toAppError(error, response?)`. `unwrap.ts`: `unwrap(call)` returns data or throws an `AppError`.

## Refreshing the snapshots

With a local backend running on 127.0.0.1:8000, run `pnpm api:pull` and then `pnpm api:gen`, and commit both.

The first snapshots were made without a database or a running server, from `../backend` after `uv sync`, with `DJANGO_DEBUG=True`, `FRONTEND_URL=http://localhost:5173`, and dummy `DATABASE_URL` and `REDIS_URL` values:

- OPEN API: `uv run python manage.py export_openapi_schema --api config.api.api --output open.json`
- allauth headless has no export command, so the document was fetched with Django's test client in `manage.py shell`: `Client().get('/_allauth/openapi.json')`. It is the same document `HEADLESS_SERVE_SPECIFICATION` serves.

Both were then formatted with Prettier (`pnpm prettier --write src/lib/api/schema`).

The allauth document describes endpoints OPEN disables (phone, codes, sessions). Wrap only the ones we use.
