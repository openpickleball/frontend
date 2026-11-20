# app/

The full frontend, built with SvelteKit and Tailwind. It is not deployed yet: `plans/frontend-v1/` builds it, and hosting is tracked in frontend#22.

## Commands

- `pnpm dev` starts the dev server.
- `pnpm check` type-checks the app.
- `pnpm format` formats the code with Prettier.
- `pnpm format:check` checks formatting without writing.
- `pnpm lint` runs ESLint.
- `pnpm test` runs the Vitest tests in two projects. Name a component test `*.svelte.test.ts` and it runs in headless Chromium (Vitest browser mode, rendered with `vitest-browser-svelte`). Every other `*.test.ts` runs in node. The first run needs `pnpm exec playwright install chromium`.
- `pnpm test:coverage` runs the same tests and prints a v8 coverage summary, with no threshold.
- `pnpm e2e` runs the Playwright tests in `e2e/` on the Pixel 7 project. It builds the app, serves it with `vite preview` on port 4183 (not 4173, which the `site` preview in `.claude/launch.json` uses) and sets `PUBLIC_API_MOCK=all`. Set `E2E_PORT` to use another port, for example `E2E_PORT=4184 pnpm e2e` when another checkout is running e2e. It never reuses a server that is already listening, so a port clash fails the run.
- `pnpm e2e:webkit` runs the iPhone 15 (WebKit) project instead. It needs `pnpm exec playwright install webkit`.
- `pnpm e2e:live` runs one happy path against `pnpm dev` and the real local backend (`playwright.live.config.ts`, `e2e-live/`). Local only: CI never runs it, and it skips unless the backend and the `LIVE_*` values are set. See [README.md](README.md).
- `pnpm e2e:pwa` runs `e2e-pwa/` against a build with `PUBLIC_API_MOCK=off` (port 4184, or `E2E_PWA_PORT`): manifest, service worker and the offline shell. It builds into `build/` too, so don't run it at the same time as `pnpm e2e`. `pnpm icons` re-renders `static/icons/` from the favicon.
- `pnpm build` produces a production build.

CI runs `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test:coverage` and `pnpm build` (job `app-checks`) and `pnpm e2e` (job `app-e2e`) on every PR, and on pushes to `main` that change `app/`. Both jobs install Chromium, from a cached Playwright browser directory.

## Pre-commit hook

`pnpm install` enables `.githooks/pre-commit`, which runs Prettier and ESLint on staged `app/` files. It only reports problems: run `pnpm format` or fix the lint errors, then stage the result. Without `node_modules`, as in a fresh worktree, it warns and skips, and CI still runs the same checks.

## Reuse before you build

The less custom code we write, the less we maintain. Before writing your own version of something, work down this list and stop at the first option that fits.

1. **The platform.** A native element or attribute when it does the job, for example `<input type="date">`, `<dialog>`, `required` and `inputmode`.
2. **Tailwind defaults.** The default type, spacing, size, width, breakpoint, radius, shadow and motion scales. No arbitrary values in square brackets unless they need `env()` or `calc()`, with a comment saying why.
3. **Our tokens.** The color tokens, fonts, gutter and the `label` and `page-title` utilities in `src/routes/layout.css`. Add a token only when a brand value has no default.
4. **A shadcn-svelte component** from the registry, added with the CLI and restyled to our tokens in the same change. Prefer components built on Bits UI for anything with keyboard, focus or ARIA behavior.
5. **Lucide** for icons.
6. **Our own code**, only when none of the above fits. Say why in the PR.

A component or default that looks a little different from the mockups is acceptable when it saves code we maintain. Raise the difference in the PR instead of building a custom version.

## Layout

- `src/lib/ui/` holds the design system: shadcn-svelte components (copied in with the CLI, then restyled to the site tokens in `src/routes/layout.css`, so don't adopt shadcn's color names), the app shell and the theme toggle. Add components with `pnpm dlx shadcn-svelte@latest add <name>`, then restyle them.
- `src/lib/` is layered: `domain`, `api`, `ui`, `features/*`, `mocks`, and `routes` on top. `eslint-plugin-boundaries` enforces the import rules in `plans/frontend-v1/proposal.md` section 3, and `src/boundaries.test.ts` tests them.
- The app is a single-page app (`adapter-static` with `fallback: 'index.html'`, `ssr = false`), so the build in `build/` is static.
- Breakpoints and widths are Tailwind defaults only. There is one layout step, `lg` (1024px): the top and tab bars give way to the side nav (`w-64`). Dialogs switch from a bottom sheet to a centered dialog at `md` (768px). The page column is `max-w-2xl` plus the gutter, forms and dialogs are `max-w-md`, and every paragraph measure is `max-w-md`. There is no phone-to-tablet layout step. Don't add a custom breakpoint or a one-off width.
- Vertical spacing uses a short set of Tailwind steps, and only these. `1` or `2`: between a label and its field, or lines in a group (`1` only for a tight pair such as a figure over its caption). `4`: between fields, and from a heading to its intro. `8`: between groups, including fieldsets, notices and the blocks inside a section. `12`: between page sections. Don't use `5`, `7`, `9`, `10` or `11` for a vertical margin or gap, and don't add off-grid values like `18px`. Small nudges that line an icon up with text (`mt-0.5`) are fine. Gaps inside a wrapping row of buttons or chips may use `3`.
- The PWA shell is `static/manifest.webmanifest`, `src/service-worker/` (the worker, with its own tsconfig) and `src/pwa/` (routing rules and registration). SvelteKit's auto-registration is off: `hooks.client.ts` registers the worker only when `PUBLIC_API_MOCK` is `off` and not in dev, because MSW owns the worker in the mock modes. `/api/` and `/_allauth/` are never cached.
