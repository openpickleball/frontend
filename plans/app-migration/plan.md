# Move from the teaser to the full app

**Status:** planned

## Goal

Replace the static pages in `site/` (the teaser at `/` and the about page at `/about/`) with the SvelteKit app in `app/` on the same custom domain, without taking the teaser down before the app is proven.

## Steps

- [ ] Choose a host and replace `adapter-auto` in `app/` with that host's adapter.
- [ ] Copy the `@theme` block from `site/src/input.css` into `app/src/routes/layout.css`. Any teaser markup you want to keep can be pasted into Svelte components.
- [ ] Rebuild the home page from `site/public/index.html` in the app: the teaser with the about sections below it, including the scroll transition. The about sections already use the teaser's design language (`plans/about-redesign/`).
- [ ] Deploy `app/` (root directory `app`) and test it on the host's own URL while the teaser stays live.
- [ ] Point the custom domain at the new host. This is the actual switch. To roll back, point it back at GitHub Pages.
- [ ] Once the app is stable, delete `site/` and `.github/workflows/deploy-pages.yml` in one PR, then turn off GitHub Pages in the repo settings.

## Custom domain

openpb.org is set as the custom domain under Settings → Pages, and www.openpb.org redirects to it. Moving to a new host means pointing both DNS names there.

## Decisions

None yet.
