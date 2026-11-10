# frontend

| Folder   | What it is                                                     | Guide                              |
| -------- | -------------------------------------------------------------- | ---------------------------------- |
| `site/`  | Static site live on GitHub Pages: teaser and about at `/`      | [site/AGENTS.md](site/AGENTS.md)   |
| `app/`   | Full SvelteKit frontend, not deployed yet                      | [app/AGENTS.md](app/AGENTS.md)     |
| `plans/` | Plans for multi-PR units of work                               | [plans/AGENTS.md](plans/AGENTS.md) |

`site/` and `app/` are independent projects with separate dependencies and lockfiles. There is no root `package.json`, so run `pnpm` from inside the project you're changing.

## Conventions

- Use Node 26 (`.nvmrc`) and pnpm.
- Sign off every commit (`git commit -s`). The DCO check fails PRs with unsigned commits.
- Use only made-up or de-identified data. Never commit real player names, contact details or match histories, including in fixtures and screenshots.
- Keep `tailwindcss` on the same exact version in `site/` and `app/` until the static pages are removed.
- Before starting multi-step work, check `plans/` for an existing plan.
