# OPEN frontend

The public app for [OPEN](https://github.com/openpickleball), the Open Pickleball Evaluation Network.

> **Project status:** OPEN is in early development, and no OPEN rating is live.

| Folder  | What it is                                                        | Status                       |
| ------- | ----------------------------------------------------------------- | ---------------------------- |
| `site/` | Static site: the teaser at `/` with the about sections below it   | Live on GitHub Pages for now |
| `app/`  | Full frontend: SvelteKit + Tailwind, needs a server                | In development, not deployed |

The two are independent projects, each with its own dependencies and lockfile. Work in `app/` never affects the live site. Both use Node 26 (`.nvmrc`) and pnpm.

## Static site (`site/`)

```bash
cd site
pnpm install
pnpm dev
```

`pnpm dev` rebuilds the teaser's CSS as you edit. Serve `site/public/` with any static file server to view the pages, for example `python3 -m http.server --directory site/public`. Only `site/public/` is published.

Pushing changes under `site/` to `main` deploys to www.openpb.org through `.github/workflows/deploy-pages.yml`. PRs run the build only.

## App (`app/`)

```bash
cd app
pnpm install
pnpm dev
```

`.github/workflows/ci-app.yml` checks formatting, lints, type-checks, tests and builds the app. It never deploys. `pnpm install` in `app/` also turns on a pre-commit hook that runs Prettier and ESLint on staged `app/` files.

Keep `tailwindcss` on the same exact version in both projects until the static pages are removed.

## Plans

Larger units of work live in [`plans/`](plans/AGENTS.md), including the [move from the static pages to the full app](plans/app-migration/plan.md).

## Test data

Use only made-up or properly de-identified data. Do not put real player names, contact details, or match histories in this repository, including in test fixtures and screenshots.

## Contributing

See the [contributing guide](https://github.com/openpickleball/.github/blob/main/CONTRIBUTING.md). Every commit must be signed off. Please report security problems privately, as described in the [security policy](https://github.com/openpickleball/.github/blob/main/SECURITY.md).

## License

This repository is licensed under [AGPL-3.0-or-later](LICENSE). See [how OPEN is licensed](https://github.com/openpickleball/.github/blob/main/LICENSING.md). Any hosted version must show users a visible link to its source code.
