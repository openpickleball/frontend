# Plan: Add a content security policy to the app and document its App Platform hosting (issue #239, part of #22)

**Status:** active

Risk tier: High. It sets the app's security policy (forced High). A wrong policy breaks the app in the browser in ways unit tests cannot see, and it touches the service worker's shell and every page.

Domain skills: superpowers:test-driven-development: invoke. superpowers:verification-before-completion: invoke. chrome-devtools-mcp:chrome-devtools: invoke for the live drive (console CSP violations). django, django-allauth, django-ninja-api, django-celery: not applicable, because no backend code changes. frontend-design, impeccable: not applicable, because nothing visible changes. vercel-react-*: not applicable, because the app is Svelte.

## Goal

The built app carries a Content Security Policy that allows only what it uses, and a maintainer can add the app to the backend's App Platform spec from a written block, knowing what the platform cannot do (response headers).

## Background (measured, not assumed)

- App Platform path routing only works between components of one app, so the app must be a `static_sites` component in the backend's `.do/production.yaml` (backend#288) for `/api/`, `/_allauth/` and `/oauth/` to stay same-origin. The backend keeps `CORS_ALLOW_CREDENTIALS` off (backend ADR 0040), so a separate app would break sign-in.
- App Platform's spec has no field for static site response headers (app-spec reference, `static_sites` and `ingress`). The policy must travel in the page as a `<meta http-equiv="content-security-policy">`.
- A meta CSP ignores `frame-ancestors`, `report-uri` and `sandbox`. Framing protection (`frame-ancestors 'none'`, `X-Frame-Options: DENY`) cannot be set by this app on App Platform. That gap is documented, not solved, here.
- Ingress rules strip the matched prefix by default. The API rules need `preserve_path_prefix: true`.
- SvelteKit `kit.csp` with `mode: 'hash'` on the SPA fallback page (measured on `main` 7ef77af, see Proof): it writes a meta tag into `build/index.html`, hashes SvelteKit's own inline bootstrap script, does not hash the inline theme script in `src/app.html`, and silently drops `frame-ancestors`.
- The app fetches `https://photon.komoot.io/api/` from the browser for city suggestions (`src/lib/features/places/photon.ts`, `PHOTON_URL`). `connect-src 'self'` alone would break sign-up.

## Acceptance criteria

1. `PUBLIC_API_MOCK=off pnpm build` writes `build/index.html` with exactly one `<meta http-equiv="content-security-policy">`, placed before any `<script>`.
2. The policy contains: `default-src 'self'`; `script-src 'self'` plus a `'sha256-...'` hash for every inline `<script>` in `build/index.html`, and no `'unsafe-inline'` or `'unsafe-eval'` in `script-src`; `connect-src 'self'` plus the origin of `PHOTON_URL` and nothing else; `worker-src 'self'`; `object-src 'none'`; `base-uri 'none'`; `form-action 'self'`. Every other fetch directive is either absent (falls back to `default-src 'self'`) or `'self'`, except an allowance recorded under Decisions with the measured violation that needs it.
3. `src/app.html` has no inline script. The theme is still applied before first paint (no flash) from a same-origin script file, and the existing theme e2e tests pass.
4. `pnpm check:build` fails on a build whose `index.html` has no CSP meta, or has an inline script whose hash is not in `script-src`, and passes on the real `off` build.
5. Every `pnpm e2e` and `pnpm e2e:pwa` test fails if the page reports a CSP violation (console error naming Content Security Policy, or a `securitypolicyviolation` event). The full suites pass, including sign-up with city suggestions (mocked Photon), the offline shell, and the service worker update toast.
6. `pnpm dev` still works with the policy on (Vite client, HMR, the `/api` proxy, MSW in the mock modes), or the policy is off in dev with the reason in a comment. The live drive shows which.
7. The connect-src Photon origin comes from `PHOTON_URL`, not a second copy of the string.
8. `app/README.md` has a "Hosting on App Platform" section with: the `static_sites` block (source `openpickleball/frontend`, `source_dir: app`, build command, `output_dir: build`, `catchall_document: index.html`); the ingress rules for `app.openpb.org` (`/api/`, `/_allauth/`, `/oauth/` to the backend's `web` with `preserve_path_prefix: true`, everything else to the app); the framing gap; and first-deploy checks it could not verify here (Node and pnpm versions the buildpack picks, cache headers on `service-worker.js` and `index.html`). The block is marked as a proposal that the backend spec owns.
9. `app/AGENTS.md` states the rule: new origins the browser talks to go into the CSP module, and `app.html` keeps no inline script.
10. A backend issue asks to add the component and ingress rules to `.do/production.yaml`, linking the README section. #22 is not closed by this PR (`Closes #239`, `Refs #22`).
11. `/oauth/` joins `/api/` and `/_allauth/` as network-only in `src/pwa/routing.ts`, so the worker never serves the app shell for a Django OAuth page.

## Files that change

- `app/src/csp.ts` (new): the directives, as a plain object typed for `kit.csp.directives`, importing `PHOTON_URL`. Pure, so it is unit tested. If the boundaries lint rejects an import from `src/lib/features/` here, move `PHOTON_URL` to a module both can import and say so in the plan.
- `app/src/csp.test.ts` (new): node test of the directives (criteria 2 and 7).
- `app/vite.config.ts`: `kit.csp: { mode: 'hash', directives }`, with a comment pointing to the README section and naming the meta tag limits.
- `app/src/app.html`: replace the inline theme script with `<script src="/theme.js"></script>` (blocking, in the head, before `%sveltekit.head%`).
- `app/static/theme.js` (new): the same code, unchanged in behavior. It is a static file, so the worker precaches it.
- `app/scripts/check-build.mjs`: add the CSP check (criterion 4), or a sibling `scripts/check-csp.mjs` called by `check:build`. A node test with a fixture HTML string proves it fails on a bad page.
- `app/e2e/fixtures.ts` (new) or `app/e2e/helpers.ts`: a `test` extended with an auto fixture that collects CSP violations and fails the test. Every spec in `e2e/` and `e2e-pwa/` imports `test` and `expect` from it.
- `app/src/pwa/routing.ts` and `routing.test.ts`: `/oauth/` network-only.
- `app/README.md`, `app/AGENTS.md`: criteria 8 and 9.
- `plans/app-csp-and-hosting/plan.md`: this file.

## Order of work

1. TDD the directives module and test (criteria 2, 7). Wire it into `vite.config.ts`.
2. Move the theme script to `static/theme.js`. Build and confirm the only inline script left is SvelteKit's and its hash is in the meta.
3. TDD the build check: a failing fixture first, then the check, then run it on the real `off` build.
4. Add the e2e violation fixture. First prove it catches a violation (for example a temporary page script that fetches a disallowed origin, run once and removed, with the failing output recorded under Proof). Then switch every spec to it and run `pnpm e2e` and `pnpm e2e:pwa`. For each violation found, narrow the cause. Add an allowance only when the platform or a dependency needs it (for example `style-src 'unsafe-inline'` for style attributes Svelte or Bits UI write), and record the violation text and the reason under Decisions.
5. `/oauth/` network-only, test first.
6. Live drive (below).
7. Docs: README section, AGENTS.md rule.

## Risks

- Style violations. Svelte, Bits UI and svelte-sonner may set `style` attributes or inject `<style>`. `'unsafe-inline'` in `style-src` is the usual allowance and much lower risk than in `script-src`. Note that SvelteKit skips adding hashes to a directive that has `'unsafe-inline'`, because a hash would disable it.
- Dev mode. Vite injects a client script and uses a websocket for HMR. If the policy breaks dev, turn it off in dev only and say why.
- The theme script as a file adds one blocking same-origin request before first paint. It is tiny and precached, and it keeps the policy free of hand-kept hashes. The alternative (computing its hash in `vite.config.ts`) is recorded under Decisions.
- The mock e2e build runs MSW in a service worker, so `worker-src 'self'` must allow `/mockServiceWorker.js`, and mocked Photon requests are still checked against `connect-src` before the worker sees them.
- A stale cached shell. The worker caches `index.html`, meta included, so an old policy lives until the next build's worker activates. That is the existing update path, not a new risk.
- The README block is unverified against a real deploy. It says so, and the backend issue owns validating it with `doctl apps spec validate`.

## Proof

- Criteria 2, 7: `src/csp.test.ts`.
- Criteria 1, 2, 4: `pnpm check:build` on the `off` build, plus its node test with a bad fixture.
- Criteria 3, 5: `pnpm e2e` and `pnpm e2e:pwa` with the violation fixture, and the recorded run where the fixture catches a planted violation.
- Criterion 11: `src/pwa/routing.test.ts`.
- Live drive (High: changed path plus failure and edge paths): `PUBLIC_API_MOCK=off pnpm build && pnpm preview`, then in Chrome with DevTools: load `/`, a deep route, reload, toggle the theme and reload (no flash), go offline and reload (shell served, still no violation), open the sign-up city field with the mock build (`PUBLIC_API_MOCK=all`) and type a city. Then `pnpm dev` with the mocks on. The console shows no CSP violation in each, and the meta tag is in the served HTML. Then a negative check: run in the console `fetch('https://example.org')` and see it blocked by `connect-src`.

Measured on `main` (7ef77af), with `vite.config.ts` restored afterwards: adding `csp: { mode: 'hash', directives: { 'script-src': ['self'], 'object-src': ['none'], 'base-uri': ['none'], 'frame-ancestors': ['none'] } }` and running `PUBLIC_API_MOCK=off pnpm build` gave `build/index.html` two inline scripts, hashes `sha256-+XGGSQ0alBg0QYVyMUpB62IitRUzU5Y5q18wZd61DWk=` (the theme script from `app.html`) and `sha256-cdP/6g02mcIkciOXpIF/HUGDavY9RhWFCFJD/YT06dM=` (SvelteKit's bootstrap), and the meta `object-src 'none'; script-src 'self' 'sha256-cdP/...'; base-uri 'none'`. So the theme script is not hashed, and `frame-ancestors` is dropped without a warning.

## Decisions

- Serve the app as an App Platform static site in the backend's app, with a meta CSP, and document the framing gap (rather than a container that sends headers). Chosen by the maintainer in this run. (2026-11-26)
- The App Platform block lives in the app README as a proposal. The spec itself belongs to the backend repo, because path routing cannot span two apps. (2026-11-26)
- Theme script as a static file, not a hash computed in `vite.config.ts`: no hand-kept or computed hash to drift, and the file is precached. (2026-11-26)
- `/oauth/` is network-only in the service worker, like `/api/` and `/_allauth/`, because Django serves it on the same host. Approved in this run. (2026-11-26)
