# app/

The full frontend, built with SvelteKit and Tailwind. It is not deployed yet: `plans/app-migration/` covers choosing a host and going live.

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
