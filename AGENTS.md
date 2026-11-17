# frontend

| Folder   | What it is                                                     | Guide                              |
| -------- | -------------------------------------------------------------- | ---------------------------------- |
| `site/`  | Static site live on GitHub Pages: teaser and about at `/`      | [site/AGENTS.md](site/AGENTS.md)   |
| `app/`   | Full SvelteKit frontend, not deployed yet                      | [app/AGENTS.md](app/AGENTS.md)     |
| `plans/` | Plans for multi-PR units of work                               | [plans/AGENTS.md](plans/AGENTS.md) |

`site/` and `app/` are independent projects with separate dependencies and lockfiles. There is no root `package.json`, so run `pnpm` from inside the project you're changing.

## Conventions

- Use Node 26 (`.nvmrc`) and pnpm.
- Keep `tailwindcss` on the same exact version in `site/` and `app/` until the static pages are removed.
- Before starting multi-step work, check `plans/` for an existing plan.

## Hard rules

1. **No real player data, anywhere.** Not in code, fixtures, mock API responses, docs, logs, issues, pull requests, or screenshots. Use made-up or properly de-identified data.
2. **Do not compute ratings in the frontend.** Ratings come from the backend, which calls the engine. If a number looks wrong, the fix belongs in the engine or the rating spec, not here.
3. **Only say what is true today.** No OPEN rating is live. Do not label anything shown on the site or in the app as an OPEN rating until one is published.
4. **Do not name competing rating systems** in code, copy, docs, design notes, issues, or comments. Say "standard external rating system" or "external rating".
5. **Charter limits.** No paid tiers, premium features, ads, or payment flows. Players can always export their data. Do not build anything that conflicts with the [mission charter](https://github.com/openpickleball/.github/blob/main/CHARTER.md).
6. **Security checks live in the backend.** Score confirmation, organizer verification, identity linking, and anything that lets one party change another player's match or rating are enforced by the backend. The frontend can hide a control, but never treat a client-side check as the protection.

## Contribution conventions

These add to the [organization contributing guide](https://github.com/openpickleball/.github/blob/main/CONTRIBUTING.md).

- Every commit needs a DCO sign-off (`git commit -s`). The `sign-off` check fails PRs with unsigned commits. It runs only on PRs, so commits pushed straight to `main` must be signed off by hand.
- Founding phase: repository admins may push directly to `main` while the project is getting established. Everyone else, and admins once this phase ends, uses one change per PR.
- Every PR links an issue with `Closes #N`. If there is no issue for the change, open one first. Dependabot PRs are the exception.
- Name branches `issue-<N>-<slug>`, for example `issue-15-app-page-title`.
- Fill in every section of `.github/PULL_REQUEST_TEMPLATE.md`.
- Commit messages: imperative mood, subject under 72 characters, body explains why.
- Add or update tests and docs when behavior changes.
- License: AGPL-3.0-or-later. A hosted version must show users a visible link to its source code.
- Before proposing a feature, ask whether it makes the standard more accurate, more trusted, or easier to adopt. If not, it probably belongs in a partner's product.

## Writing style

Docs, comments, and copy use plain, short sentences. No emojis and no em dashes. Say "player", "match", and "organizer", not generic words like "user" or "entity".
