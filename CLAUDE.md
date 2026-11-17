# CLAUDE.md

`AGENTS.md` files are the source of truth for this repo. They are imported below so Claude Code loads them. Put shared guidance there, not here, and keep this file to notes that only apply to Claude Code.

@AGENTS.md
@site/AGENTS.md
@app/AGENTS.md
@plans/AGENTS.md

## Running things

`.claude/launch.json` has three entries:

- `teaser` serves `site/public/` on port 4173. Run `pnpm build` (or `pnpm dev`) in `site/` first, because `public/assets/css/main.css` is generated and not committed.
- `app` runs the SvelteKit dev server on port 5173.
- `design` serves the repo root on port 4174, for prototypes such as `/design/content-v2.html`.

## Before you finish

- `app/` changes: run `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test` and `pnpm build` in `app/`. CI runs the same checks.
- `site/` changes: run `pnpm build` in `site/`, then check the page in both themes (black and ivory) and with reduced motion.
- Changes under `site/` that merge to `main` deploy to openpb.org. Edits to `site/AGENTS.md` don't.
- Fill in both sections of `.github/PULL_REQUEST_TEMPLATE.md`: the plan (or "none") and how you verified the change.

## Copy on openpb.org

Visitors are pickleball players, not developers. Write in plain language, and only describe what exists today. No OPEN rating is live yet. See the Decisions in `plans/site-content-v2/plan.md` before changing any wording.
