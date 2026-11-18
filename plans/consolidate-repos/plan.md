# Consolidate open-ui into frontend

**Status:** active

## Goal

`openpickleball/frontend` is the one repository for OPEN's web frontend. It serves one page at openpb.org: the Horizon teaser with the about content below it (`/about/` redirects to `/#about`). It also carries the SvelteKit app in `app/`, plans and agent tooling. The app is not deployed yet; `plans/frontend-v1/` covers building it.

## Steps

- [x] Copy open-ui's tracked files into frontend in one signed-off commit. Its history stays in open-ui, because those commits aren't signed off and would fail the DCO check.
- [x] Move frontend's page to `site/public/about/` and point its canonical, `og:url` and `og:image` at `/about/`.
- [x] Add a shimmering "Learn more" link under the teaser headline.
- [x] Replace `pages.yml` with open-ui's `deploy-pages.yml`, which builds the CSS before publishing, and add `ci-app.yml`.
- [x] Open the PR from a branch on this repository. The first attempt came from a fork and was closed once write access was granted.
- [x] After the PR has run once, add `app-checks` and `teaser-build` as required checks in the "Protect main" ruleset. This needs a repository admin.
- [x] Turn on "Enforce HTTPS" under Settings → Pages. It was already on, and http://www.openpb.org redirects to https.
- [ ] When this merges, change the custom domain under Settings → Pages from www.openpb.org to openpb.org, then check that "Enforce HTTPS" is still on once GitHub reissues the certificate. This needs a repository admin.
- [ ] After the deploy, check that `/` and `/about/` load on openpb.org and that www.openpb.org redirects to it. (Still open on 2026-11-17: Pages still reports www.openpb.org as the custom domain, openpb.org answers with a redirect and www serves the site.)
- [x] Archive `ccirrincione/open-ui` with a README that points here.

## Decisions

- The canonical domain will be the bare openpb.org, because it is shorter and reads better in link previews. Once it is the custom domain under Settings → Pages, GitHub redirects www.openpb.org to it. Switching the custom domain is the step above; www is still the custom domain today.
- The old page lived at `/about/`. Its content now sits under the teaser on `/`, and `/about/` redirects to `/#about` (see `plans/about-redesign/`).
- `.vscode/` stays ignored, so open-ui's `app/.vscode/` settings were not brought over.
- The teaser's GitHub link points to `openpickleball/frontend`. It doubles as the visible source link the AGPL requires on the home page.
