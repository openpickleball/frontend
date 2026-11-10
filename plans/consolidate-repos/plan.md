# Consolidate open-ui into frontend

**Status:** active

## Goal

`openpickleball/frontend` is the one repository for OPEN's web frontend. It serves the Horizon teaser from open-ui as the home page at www.openpb.org, with a "Learn more" link to the page frontend served before, now at `/about/`. It also carries open-ui's SvelteKit app, plans and agent tooling. The two pages keep their own design languages for now. Unifying them is later work.

## Steps

- [x] Copy open-ui's tracked files into frontend in one signed-off commit. Its history stays in open-ui, because those commits aren't signed off and would fail the DCO check.
- [x] Move frontend's page to `site/public/about/` and point its canonical, `og:url` and `og:image` at `/about/`.
- [x] Add a shimmering "Learn more" link under the teaser headline.
- [x] Replace `pages.yml` with open-ui's `deploy-pages.yml`, which builds the CSS before publishing, and add `ci-app.yml`.
- [x] Open the PR from a branch on this repository. The first attempt came from a fork and was closed once write access was granted.
- [ ] After the PR has run once, add `app-checks` and `teaser-build` as required checks in the "Protect main" ruleset. This needs a repository admin.
- [ ] Turn on "Enforce HTTPS" under Settings → Pages. This needs a repository admin.
- [ ] After the deploy, check that `/` and `/about/` load on www.openpb.org and that the bare openpb.org redirects to www.
- [ ] Archive `ccirrincione/open-ui` with a README that points here.

## Decisions

- The canonical domain is www.openpb.org, because that is the custom domain set on frontend's GitHub Pages. The bare openpb.org redirects to it.
- The old page lives at `/about/`.
- `.vscode/` stays ignored, so open-ui's `app/.vscode/` settings were not brought over.
- The teaser's GitHub link points to `openpickleball/frontend`. It doubles as the visible source link the AGPL requires on the home page.
- `about/` keeps its own plain CSS and JS, and the Tailwind scan skips it.
