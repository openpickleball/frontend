# Plan: Add a content security policy to the app and document its App Platform hosting (issue #239, part of #22)

**Status:** done

Risk tier: High. It sets the app's security policy (forced High). A wrong policy breaks the app in the browser in ways unit tests cannot see, and it touches the service worker's shell and every page.

Domain skills: superpowers:test-driven-development: invoke. superpowers:verification-before-completion: invoke. chrome-devtools-mcp:chrome-devtools: invoke for the live drive (console CSP violations). django, django-allauth, django-ninja-api, django-celery: not applicable, because no backend code changes. frontend-design, impeccable: not applicable, because nothing visible changes. vercel-react-*: not applicable, because the app is Svelte.

## Goal

The built app carries a Content Security Policy that allows only what it uses, and a maintainer can add the app to the backend's App Platform spec from a written block, knowing what the platform cannot do (response headers).

## Background (measured, not assumed)

- App Platform path routing only works between components of one app, so the app must be a `static_sites` component in the backend's `.do/production.yaml` (backend#288) for `/api/` and `/_allauth/` to stay same-origin. `/oauth/` is Django's partner token endpoint (POST `token/` and `revoke_token/` only) on the same host. The app never calls it. The backend keeps `CORS_ALLOW_CREDENTIALS` off (backend ADR 0040), so a separate app would break sign-in.
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
5. Every `pnpm e2e` and `pnpm e2e:pwa` test fails if the page reports a CSP violation (console error naming Content Security Policy, or a `securitypolicyviolation` event). The full suites pass, including sign-up with city suggestions (mocked Photon) and the offline shell. The service worker update toast has no e2e test; it is proven by the recorded live drive under Proof (criterion reworded by the maintainer, 2026-11-26).
6. `pnpm dev` still works with the policy on (Vite client, HMR, the `/api` proxy, MSW in the mock modes), or the policy is off in dev with the reason in a comment. The live drive shows which.
7. The connect-src Photon origin comes from `PHOTON_URL`, not a second copy of the string.
8. `app/README.md` has a "Hosting on App Platform" section with: the `static_sites` block (source `openpickleball/frontend`, `source_dir: app`, build command, `output_dir: build`, `catchall_document: index.html`); the ingress rules for `app.openpb.org` (`/api/`, `/_allauth/`, `/oauth/` to the backend's `web` with `preserve_path_prefix: true`, everything else to the app); the framing gap; and first-deploy checks it could not verify here (Node and pnpm versions the buildpack picks, cache headers on `service-worker.js` and `index.html`). The block is marked as a proposal that the backend spec owns.
9. `app/AGENTS.md` states the rule: new origins the browser talks to go into the CSP module, and `app.html` keeps no inline script.
10. A comment on backend#304 links the README section and adds what #304 lacks (the component, domain and ingress rules, the `test_app_spec.py` changes, the hosts). No new backend issue. Maintainer decision (2026-11-26). Posted: https://github.com/openpickleball/backend/issues/304#issuecomment-7193196490. #22 is not closed by this PR (`Closes #239`, `Refs #22`).
11. `/oauth/` joins `/api/` and `/_allauth/` as network-only in `src/pwa/routing.ts`. It is Django's partner token endpoint on the same host, and network-only keeps the worker out of it.

## Files that change

- `app/src/csp.ts` (new): the directives, as a plain object typed for `kit.csp.directives`, importing `PHOTON_URL`. Pure, so it is unit tested. If the boundaries lint rejects an import from `src/lib/features/` here, move `PHOTON_URL` to a module both can import and say so in the plan.
- `app/src/csp.test.ts` (new): node test of the directives (criteria 2 and 7).
- `app/vite.config.ts`: `kit.csp: { mode: 'hash', directives }`, with a comment pointing to the README section and naming the meta tag limits.
- `app/src/app.html`: replace the inline theme script with `<script src="/theme.js"></script>` (blocking, in the head, right after `%sveltekit.head%`, so the CSP meta tag that SvelteKit writes there comes before it, as criterion 1 needs).
- `app/static/theme.js` (new): equivalent code, not a copy (`const` instead of `var`, `catch {}` with a comment instead of `catch (e) {}`, so it passes lint). It is a static file, so the worker precaches it.
- `app/scripts/check-build.mjs`: add the CSP check (criterion 4), or a sibling `scripts/check-csp.mjs` called by `check:build`. A node test with a fixture HTML string proves it fails on a bad page.
- `app/e2e/fixtures.ts` (new) or `app/e2e/helpers.ts`: a `test` extended with an auto fixture that collects CSP violations and fails the test. Every spec in `e2e/` and `e2e-pwa/` imports `test` and `expect` from it.
- `app/src/pwa/routing.ts` and `routing.test.ts`: `/oauth/` network-only.
- `app/README.md`, `app/AGENTS.md`: criteria 8 and 9.
- `app/src/check-csp.test.ts`, `app/src/check-csp-parse.test.ts` and `app/src/check-build.test.ts` (all new): the build check's fixtures and how it reads `index.html`.
- `app/src/lib/domain/zod.ts` (new), `app/src/lib/domain/schemas.ts`, `app/src/lib/domain/zod-config.test.ts` (new), `app/src/zod-import.test.ts` and `app/src/zod-import-dynamic.test.ts` (new), `app/eslint.config.js`: Zod runs jitless, from one module (see Decisions).
- `app/src/routes/routes.test.ts`, `app/src/routes/layout.test.ts`: the theme tests read `static/theme.js`, and app.html has no inline script.
- `app/src/routes/layout.css`, `app/src/lib/ui/theme-toggle/theme.ts`, `app/src/service-worker/index.ts`, `app/src/lib/features/places/photon.ts`, `.github/workflows/ci-app.yml`: comments only.
- `app/e2e/*.spec.ts`, `app/e2e/*.test.ts`, `app/e2e-pwa/pwa.spec.ts`, `app/e2e-live/happy-path.spec.ts`: import `test` and `expect` from `e2e/fixtures.ts`.
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
- The README block is unverified against a real deploy. It says so. Validating it is the backend#304 work: the backend's `config/tests/test_app_spec.py` plus `doctl apps spec validate`.
- The README block is written as an addition to the backend's real `.do/production.yaml` (backend#288, merged as b801f48): app `open-backend-production`, Django service `web`. It adds a `static_sites` entry `app`, `domains` for `app.openpb.org`, and `ingress.rules`, plus a final rule that keeps every other host on `web`. Backend-side steps it lists: allow `app.openpb.org` in `DJANGO_ALLOWED_HOSTS` (backend#183), update `config/tests/test_app_spec.py`, keep `SECURE_CONTENT_TYPE_NOSNIFF` on, and check what `${APP_DOMAIN}` resolves to once a custom domain is added. CSRF needs no extra trusted origin, because the app and Django share the origin. `deploy_on_push` is off (see Decisions).

## Proof

- Criteria 2, 7: `src/csp.test.ts`.
- Criteria 1, 2, 4: `pnpm check:build` on the `off` build, plus its node test with a bad fixture.
- Criteria 3, 5: `pnpm e2e` and `pnpm e2e:pwa` with the violation fixture, and the recorded run where the fixture catches a planted violation.
- Criterion 11: `src/pwa/routing.test.ts`.
- Live drive (High: changed path plus failure and edge paths): `PUBLIC_API_MOCK=off pnpm build && pnpm preview`, then in Chrome with DevTools: load `/`, a deep route, reload, toggle the theme and reload (no flash), go offline and reload (shell served, still no violation), open the sign-up city field with the mock build (`PUBLIC_API_MOCK=all`) and type a city. Then `pnpm dev` with the mocks on. The console shows no CSP violation in each, and the meta tag is in the served HTML. Then a negative check: run in the console `fetch('https://example.org')` and see it blocked by `connect-src`.

Measured on `main` (7ef77af), with `vite.config.ts` restored afterwards: adding `csp: { mode: 'hash', directives: { 'script-src': ['self'], 'object-src': ['none'], 'base-uri': ['none'], 'frame-ancestors': ['none'] } }` and running `PUBLIC_API_MOCK=off pnpm build` gave `build/index.html` two inline scripts, hashes `sha256-+XGGSQ0alBg0QYVyMUpB62IitRUzU5Y5q18wZd61DWk=` (the theme script from `app.html`) and `sha256-cdP/6g02mcIkciOXpIF/HUGDavY9RhWFCFJD/YT06dM=` (SvelteKit's bootstrap), and the meta `object-src 'none'; script-src 'self' 'sha256-cdP/...'; base-uri 'none'`. So the theme script is not hashed, and `frame-ancestors` is dropped without a warning.

Fixture probe (step 4), run once with a temporary `e2e/zz-csp-probe.spec.ts` that loaded `/` and ran `fetch('https://example.org')`, then deleted. The fixture failed the test with:

```
"Connecting to 'https://example.org/' violates the following Content Security Policy directive: \"connect-src 'self' https://photon.komoot.io\". The action has been blocked.",
"Fetch API cannot load https://example.org/. Refused to connect because it violates the document's Content Security Policy.",
"Content Security Policy violation: connect-src blocked https://example.org/",
```

The same run also caught a real violation: `style-src-attr blocked inline`, hash `sha256-tcbDxjMo+xKqM21aCGYbs/QAJqB7yUXC06oPWDapBgc=`, which is `display: contents` from `<div style="display: contents">` in `src/app.html`. That div now uses the Tailwind `contents` class.

The first full `pnpm e2e` with the fixture (111 tests, all failed) found two more, and nothing else:

- `Content Security Policy violation: script-src blocked eval at .../_app/immutable/chunks/S4AP6qqW.js:1:9560`. That is Zod's `allowsEval` probe, `try { return Function(''), !0 } catch { return !1 }`. Fixed in the app: `z.config({ jitless: true })` in `src/lib/domain/zod.ts`, the only module that may import `'zod'` for values (ESLint `no-restricted-imports` for static imports and `no-restricted-syntax` for `import('zod')`, tested in `src/zod-import.test.ts` and `src/zod-import-dynamic.test.ts`). `schemas.ts` imports `z` from it, and `src/lib/domain/zod-config.test.ts` checks the setting. No `'unsafe-eval'`.
- `Applying inline style violates the following Content Security Policy directive 'default-src 'self''. Either the 'unsafe-inline' keyword, a hash ('sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='), or a nonce ('nonce-...') is required ...`, reported as `style-src-attr blocked inline at .../chunks/D8Ln_-J-.js:1:34278` (Svelte's `innerHTML` template clone). The hash is the style attribute of SvelteKit's route announcer, `#svelte-announcer` in `@sveltejs/kit/src/runtime/components/root.svelte`. See Decisions.

`e2e-live/happy-path.spec.ts` uses the same fixture. It runs against `pnpm dev`, whose policy is looser for styles (SvelteKit adds `'unsafe-inline'` to `style-src` and `style-src-attr` in dev), so it cannot catch a style violation. It cannot run here without the backend; it loads and skips. Before the check, the fixture waits one frame in each open page, so late console messages and violation events are counted.

After both, `pnpm e2e` passed 111 of 111 and `pnpm e2e:pwa` 4 of 4, with no violation. No e2e test covers the service worker update toast, so criterion 5's toast part rests on the live drive of the update below (review round 1), not on a suite. The first live drive did not cover it.

Live drive (Chrome DevTools MCP, a `securitypolicyviolation` listener added as an init script on each load):

- `PUBLIC_API_MOCK=off pnpm build && pnpm preview --port 4291`: `/` (redirects to sign-in), the deep route `/account/password/reset`, reload, the theme toggle to ivory and reload (the first animation frame already had `data-theme="light"` and the ivory background, so no flash; `/theme.js` loaded), then offline and `/matches` (shell served by the worker from `shell-...`). No violation in any. `vite preview` renders each page on the fly, so there the policy arrives as a response header, with no meta tag. The cached shell keeps that header.
- The same `off` build served as plain files with an `index.html` fallback (a throwaway node server on 4292, like App Platform's `catchall_document`): the deep route carries the meta tag with the full policy, the announcer keeps its hiding style, reload with a stored theme starts ivory, offline reload serves the shell with the meta tag. No violation.
- Negative check on 4291: `fetch('https://example.org')` failed with `Connecting to 'https://example.org/' violates the following Content Security Policy directive: "connect-src 'self' https://photon.komoot.io". The action has been blocked.`
- `PUBLIC_API_MOCK=all` build, `pnpm preview --port 4293`: sign-up, both screens, typed "River" in City. MSW answered `GET https://photon.komoot.io/api/` with 200 and "Riverbend" showed in the suggestions. No violation.
- `PUBLIC_API_MOCK=all pnpm dev --port 5291` (criterion 6): the policy is on in dev, as a header. SvelteKit adds `style-src 'self' 'unsafe-inline'` and `style-src-attr 'unsafe-inline'` in dev for Vite's injected styles. The page is styled, `[vite] connected.` (HMR websocket), MSW serves the API, a same-origin `/_allauth/browser/v1/config` fetch returns 200, and `fetch('https://example.org')` is blocked by `connect-src`. No other violation.
- Service worker update (review round 1): `PUBLIC_API_MOCK=off pnpm build`, served as plain files with the `index.html` fallback on 4292. Loaded `/account/login` and reloaded until controlled (worker `activated`, cache `shell-1795697966885`, meta tag present). Then a second `PUBLIC_API_MOCK=off pnpm build`, whose worker has a new version (`1795697983077`), copied over the served files. A reload found the new worker, and the "Update available / Reload to get the latest version." toast showed. Reload reloaded the page under the new worker (cache `shell-1795697983077`, nothing waiting, meta tag present). No console message at all, so no violation. `vite preview` was not used for this step, because it renders from the manifest it loaded at start and a rebuild under it would serve stale chunk names. A quick `pnpm preview --port 4291` load of `/matches` on the same build showed no violation either.
- `pnpm e2e:webkit` (review round 1): WebKit first would not start on this host. `pnpm exec playwright install webkit` warned that `libevent-2.1-7t64` was missing, and installing it needs sudo. With `libevent-2.1.so.7` taken from the Ubuntu package (`apt-get download`, no install) and copied into Playwright's WebKit `minibrowser-wpe/sys/lib`, it ran: 109 passed, 2 failed, no CSP violation. Both failures are `browserContext.grantPermissions: Unknown permission: clipboard-write` in `e2e/matches.spec.ts:97` and `e2e/profile.spec.ts:91` ("copies the code"). The same two fail the same way on `origin/main` (7ef77af), so this change did not cause them.
- The only console errors besides these were a 404 for `/favicon.ico` and the expected API failures with no backend (502 from the proxy, 401 from the mocks).

## Decisions

- Serve the app as an App Platform static site in the backend's app, with a meta CSP, and document the framing gap (rather than a container that sends headers). Chosen by the maintainer in this run. (2026-11-26)
- The App Platform block lives in the app README as a proposal. The spec itself belongs to the backend repo, because path routing cannot span two apps. (2026-11-26)
- Theme script as a static file, not a hash computed in `vite.config.ts`: no hand-kept or computed hash to drift, and the file is precached. (2026-11-26)
- The theme script tag goes after `%sveltekit.head%`, not before it. SvelteKit writes the CSP meta tag at the start of `%sveltekit.head%` (measured in `build/index.html`), and a meta policy only covers what follows it, so a script before it would load outside the policy and break criterion 1. It is still a blocking script in the head, so it runs before first paint. (2026-11-26)
- `/oauth/` is network-only in the service worker, like `/api/` and `/_allauth/`, because Django serves its partner token endpoint there. Approved in this run. (2026-11-26)
- `style-src-attr 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='`, not `style-src 'unsafe-inline'`. The only style violation in the suites was SvelteKit's route announcer (measured above). Without the allowance its hiding style is dropped and the announcer text shows on the page. One hash for one attribute is narrower than `'unsafe-inline'`. `src/csp.test.ts` hashes every static style attribute in the installed SvelteKit's `root.svelte`, so an upgrade that changes it fails the unit tests, and the e2e fixture catches any other new one. (2026-11-26)
- Zod runs jitless (`z.config({ jitless: true })`, in `src/lib/domain/zod.ts`, the one module allowed to import `'zod'`) instead of allowing `'unsafe-eval'`. Its eval probe was the only script violation. Zod's JIT only speeds up object parsing, which the forms here do not need. (2026-11-26)
- `src/app.html` uses `class="contents"` instead of `style="display: contents"` on the body wrapper, so it needs no style hash. (2026-11-26)
- The README block sets `deploy_on_push: false`. Deployments may be app-wide (not checked in DigitalOcean's docs), so a frontend push could redeploy `web`, `worker` and `beat` from the GHCR `main` tag and run the PRE_DEPLOY `migrate` job. Frontend changes go live with a deliberate deploy of the production app. Revisit once backend#63 deploys by digest. Maintainer decision. (2026-11-26)
- The backend work is a comment on backend#304, not a new backend issue (criterion 10). Maintainer decision. (2026-11-26)
- Criterion 5 no longer claims a suite covers the service worker update toast. The recorded live drive proves it, and an e2e test for it is a follow-up. Maintainer decision. (2026-11-26)
