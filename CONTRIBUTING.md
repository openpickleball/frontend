# Contributing to the OPEN frontend

This guide covers the workflow for this repository. It adds to the [organization contributing guide](https://github.com/openpickleball/.github/blob/main/CONTRIBUTING.md), which still applies: read it first. Report security problems privately, as described in the [security policy](https://github.com/openpickleball/.github/blob/main/SECURITY.md), never in a public issue.

To set up the projects, follow the [README](README.md).

## Two rules that are never negotiable

**No real player data, anywhere.** Do not put real player names, contact details, ratings, or match histories in code, fixtures, mock API responses, issues, pull requests, or screenshots. Use made-up or properly de-identified data.

**OPEN stays free.** The [mission charter](https://github.com/openpickleball/.github/blob/main/CHARTER.md) rules out subscriptions, paid tiers, advertisements, and premium features. Do not add payment flows or anything that puts part of OPEN behind a payment. Players can always export their data.

## What is in this repository

| Folder    | What it is                                                |
| --------- | --------------------------------------------------------- |
| `site/`   | The static site live at openpb.org                        |
| `app/`    | The full SvelteKit frontend, in development, not deployed |
| `plans/`  | Plans for work that spans more than one pull request      |
| `design/` | Design prototypes and the tools that export the logo      |

`site/` and `app/` are separate projects, each with its own dependencies and lockfile. Run `pnpm` from inside the one you are changing. Both use Node 26 (`.nvmrc`) and pnpm.

## Pick up an issue

New here? Start with an issue labeled [`good first issue`](https://github.com/openpickleball/frontend/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22).

1. Comment on the issue to say you are taking it, so two people do not do the same work. If someone already claimed it, pick another one or ask in the issue.
2. Read the issue in full. If it names a plan in `plans/`, read that plan, including its Decisions, before you start.
3. Ask questions in the issue. A question early saves a rewrite later.

Every pull request links an issue, so if none exists for your change, open one first.

## Branches and pull requests

1. Fork the repository, or, if you have write access, create a branch from an up-to-date `main`. Name it `issue-<N>-<slug>`, for example `issue-15-app-page-title`.
2. Keep each pull request to one change. Split unrelated fixes into their own pull requests.
3. Link the issue in the pull request description with `Closes #N`, so it closes when the pull request merges.
4. Fill in every section of the pull request template, including how you verified the change.
5. Add or update tests and docs when behavior changes.
6. Keep the branch up to date with `main` before review.

A pull request merges only when these checks pass:

- `app-checks`: `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test:coverage` (the tests with a coverage summary, in the node and browser projects), and `pnpm build` in `app/`.
- `app-e2e`: `pnpm e2e` in `app/`, the Playwright end-to-end tests at phone size, with axe accessibility checks.
- `teaser-build`: `pnpm build` in `site/`.
- `sign-off`: every commit carries a DCO sign-off.

A maintainer reviews and merges every pull request. Merging a change under `site/` to `main` deploys openpb.org, so check site changes in a browser before you ask for review: both themes (black and ivory), a phone-sized window, and with reduced motion turned on.

## Sign off every commit

Every commit needs a [Developer Certificate of Origin](https://developercertificate.org/) sign-off. Add it with `-s`:

```bash
git commit -s -m "Describe your change"
```

If the `sign-off` check fails, add the missing sign-offs and push again. For the last commit only:

```bash
git commit --amend -s --no-edit
```

For every commit on your branch, fetch the current `main` and rebase onto it. In a fork, first add this repository as a remote once: `git remote add upstream https://github.com/openpickleball/frontend.git`.

```bash
git fetch upstream && git rebase --signoff upstream/main
```

For a branch in this repository, use `git fetch origin && git rebase --signoff origin/main` instead.

Both rewrite your branch, so push with `git push --force-with-lease`. Only do this on your own branch.

## Code style

The tools are the source of truth for style. Do not argue formatting in review: run them.

- In `app/`: [Prettier](https://prettier.io/) for formatting, [ESLint](https://eslint.org/) for lint, and `svelte-check` for types, with TypeScript in strict mode. `pnpm install` in `app/` turns on a pre-commit hook that runs Prettier and ESLint on staged `app/` files.
- In `site/`: edit `src/input.css`, not the generated `public/assets/css/main.css`. Use the color tokens in `src/input.css`, not hex values.
- Keep `tailwindcss` on the same exact version in `site/` and `app/` until the static site is removed.

These conventions are the ones a tool cannot check:

- **Only say what is true today.** No OPEN rating is live. Do not describe a rating method, data, or roadmap on the site until it is published, and do not label anything an OPEN rating.
- **Do not name competing rating systems** in code, copy, docs, design notes, issues, or comments. Say "standard external rating system" or "external rating".
- **Write for players.** Visitors are pickleball players, not developers. Use plain, short sentences. No emojis and no em dashes.
- **Links that leave openpb.org** open in a new tab with `target="_blank" rel="noopener"` and a visually hidden "(opens in a new tab)".

## Tests

Every change to app behavior needs tests that would fail without it. A bug fix needs a test that reproduces the bug. Write them with [Vitest](https://vitest.dev/) next to the code they test, as in `app/src/routes/page.test.ts`, and run them with `pnpm test` in `app/`.

Vitest runs two projects. A file named `*.svelte.test.ts` renders components in a real headless browser (Chromium), and every other test file runs in node. The first run needs `pnpm exec playwright install chromium`. `pnpm test:coverage` runs the same tests and prints a coverage summary.

End-to-end tests live in `app/e2e/`. Run them with `pnpm e2e` in `app/`: it builds the app, serves it on port 4183 and runs Playwright at phone size with axe accessibility checks.

For local development, the `PUBLIC_API_MOCK` environment variable controls the mock API (`app/src/lib/mocks`):

- `off` (the default): no mocks. Requests go to the backend.
- `missing`: mocks only the endpoints the backend does not have yet.
- `all`: mocks every endpoint, so you need no backend. The e2e tests use this.

Any other value counts as `off`. Use made-up data in mocks, as everywhere else.
