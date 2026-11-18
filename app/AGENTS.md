# app/

The full frontend, built with SvelteKit and Tailwind. It is not deployed yet: `plans/frontend-v1/` builds it, and hosting is tracked in frontend#22.

## Commands

- `pnpm dev` starts the dev server.
- `pnpm check` type-checks the app.
- `pnpm format` formats the code with Prettier.
- `pnpm format:check` checks formatting without writing.
- `pnpm lint` runs ESLint.
- `pnpm test` runs the Vitest tests.
- `pnpm build` produces a production build.

CI runs `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test` and `pnpm build` on every PR, and on pushes to `main` that change `app/`.

## Pre-commit hook

`pnpm install` enables `.githooks/pre-commit`, which runs Prettier and ESLint on staged `app/` files. It only reports problems: run `pnpm format` or fix the lint errors, then stage the result. Without `node_modules`, as in a fresh worktree, it warns and skips, and CI still runs the same checks.

## Layout

- `src/lib/ui/` holds the design system: shadcn-svelte components (copied in with the CLI, then restyled to the site tokens in `src/routes/layout.css`, so don't adopt shadcn's color names), the app shell and the theme toggle. Add components with `pnpm dlx shadcn-svelte@latest add <name>`, then restyle them.
- `src/lib/` is layered: `domain`, `api`, `ui`, `features/*`, `mocks`, and `routes` on top. `eslint-plugin-boundaries` enforces the import rules in `plans/frontend-v1/proposal.md` section 3, and `src/boundaries.test.ts` tests them.
- The app is a single-page app (`adapter-static` with `fallback: 'index.html'`, `ssr = false`), so the build in `build/` is static.
