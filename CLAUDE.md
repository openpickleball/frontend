# CLAUDE.md

`AGENTS.md` files are the source of truth for this repo. They are imported below so Claude Code loads them. Put shared guidance there, not here, and keep this file to notes that only apply to Claude Code.

@AGENTS.md
@site/AGENTS.md
@app/AGENTS.md
@plans/AGENTS.md

## Running things

`.claude/launch.json` has three entries:

- `site` serves `site/public/` on port 4173. Run `pnpm build` (or `pnpm dev`) in `site/` first, because `public/assets/css/main.css` is generated and not committed.
- `app` runs the SvelteKit dev server on port 5173.
- `design` serves the repo root on port 4174, for prototypes such as `/design/icon-d.html`.

## Before you finish

- `app/` changes: run `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test` and `pnpm build` in `app/`. CI runs the same checks.
- `site/` changes: run `pnpm build` in `site/`, then check the page in both themes (black and ivory) and with reduced motion.
- Changes under `site/` that merge to `main` deploy to openpb.org. Edits to `site/AGENTS.md` don't.
- Fill in every section of `.github/PULL_REQUEST_TEMPLATE.md`: the change and its issue (`Closes #N`), the plan (or "none"), how you verified the change, and the checklist.

## Copy on openpb.org

Visitors are pickleball players, not developers. Write in plain language, and only describe what exists today. No OPEN rating is live yet. See the Decisions in `plans/site-content-v2/plan.md` before changing any wording.

## Git exception

This section overrides a contributor's global no-commit rule for the `/work-issue` workflow only.

- The workflow may commit (`git commit -s`, with explicit paths) and push, but only on the `issue-<N>-*` branch it creates or resumes.
- After a rebase it may push that branch with `--force-with-lease`. It never force-pushes any other branch.
- It may open a pull request against `main`, edit its description, label it (creating the `ready-for-review` label if it does not exist), and reply to review comments on it.
- It never commits or pushes to `main`, never merges, and never enables auto-merge. A human reviews and merges every pull request.
