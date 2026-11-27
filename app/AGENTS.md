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
- `pnpm check:build` checks that the build in `build/` ships no API mocks (no msw code, no mock fixtures and no `mockServiceWorker.js`) and that `index.html` carries one content security policy that the browser applies before any script, hashes every inline script, and allows no broad or unsafe script source (see `scripts/check-csp.mjs`). Run it after a `PUBLIC_API_MOCK=off` build. A mock build fails it on purpose.

CI runs `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test:coverage`, `pnpm build` and `pnpm check:build` (job `app-checks`) and `pnpm e2e` (job `app-e2e`) on every PR, and on pushes to `main` that change `app/`. Both jobs install Chromium, from a cached Playwright browser directory.

## Content security policy

The app's policy is `src/csp.ts`. SvelteKit writes it into `build/index.html` as a meta tag, because App Platform cannot send headers for a static site (see "Hosting on App Platform" in [README.md](README.md)).

- Every origin the browser talks to goes into `src/csp.ts`, taken from the constant the code uses (as `connect-src` takes `PHOTON_URL`), never a second copy of the string.
- `src/app.html` keeps no inline script and no `style` attribute. Put script in a file under `static/`, and use a class for style.
- Every e2e test fails on a policy violation (`e2e/fixtures.ts`). Every spec imports `test` and `expect` from there, not from `@playwright/test`.
- Add an allowance only for a violation the platform or a dependency causes, and record the violation text under Decisions in `plans/app-csp-and-hosting/plan.md`.

## Pre-commit hook

`pnpm install` enables `.githooks/pre-commit`, which runs Prettier and ESLint on staged `app/` files. It only reports problems: run `pnpm format` or fix the lint errors, then stage the result. Without `node_modules`, as in a fresh worktree, it warns and skips, and CI still runs the same checks.

## Reuse before you build

The less custom code we write, the less we maintain. Before writing your own version of something, work down this list and stop at the first option that fits.

1. **The platform.** A native element or attribute when it does the job, for example `<input type="date">`, `<dialog>`, `required` and `inputmode`.
2. **Tailwind defaults.** The default type, spacing, size, width, breakpoint, radius, shadow and motion scales. No arbitrary values in square brackets unless they need `env()` or `calc()`, with a comment saying why. `pnpm lint` enforces this with the local ESLint rule `local/no-arbitrary-tailwind-values` (`src/lint/`), which checks `.svelte` files and the `.ts` files under `src/lib/ui/`. It allows `calc()`, `env()` and `var()` values and arbitrary variants such as `data-[state=open]:` and `has-[>svg]:`. For any other value, switch to a default, or add an exception with a reason: `// eslint-disable-next-line local/no-arbitrary-tailwind-values -- reason` in script, or `<!-- eslint-disable local/no-arbitrary-tailwind-values -- reason -->` before the element and a matching `eslint-enable` after it in a template.
3. **Our tokens.** The color tokens, fonts, gutter and the `label` and `page-title` utilities in `src/routes/layout.css`. Add a token only when a brand value has no default.
4. **A shadcn-svelte component** from the registry, added with the CLI and restyled to our tokens in the same change. Prefer components built on Bits UI for anything with keyboard, focus or ARIA behavior.
5. **Lucide** for icons.
6. **Our own code**, only when none of the above fits. Say why in the PR.

A component or default that looks a little different from the mockups is acceptable when it saves code we maintain. Raise the difference in the PR instead of building a custom version.

## Layout

- `src/lib/ui/` holds the design system: shadcn-svelte components (copied in with the CLI, then restyled to the site tokens in `src/routes/layout.css`, so don't adopt shadcn's color names), the app shell and the theme toggle. Add components with `pnpm dlx shadcn-svelte@latest add <name>`, then restyle them.
- The app shell (`src/lib/ui/app-shell/`) builds the side nav from `lg` on shadcn-svelte's Sidebar parts in `src/lib/ui/sidebar/`: header, content, menu and footer. Only the fixed sidebar is kept. There is no Provider, so no open state, cookie, Cmd or Ctrl+B shortcut, or phone drawer. Below `lg`, `tab-bar.svelte` stays the nav. The Sidebar's colors are `--color-sidebar-*` aliases of our tokens in `src/routes/layout.css`. To add groups, submenus or a collapsible rail, add the parts with the CLI, restore the files it overwrites and restyle them.
- `src/lib/` is layered: `domain`, `api`, `ui`, `features/*`, `mocks`, and `routes` on top. `eslint-plugin-boundaries` enforces the import rules in `plans/frontend-v1/proposal.md` section 3, and `src/boundaries.test.ts` tests them.
- The app is a single-page app (`adapter-static` with `fallback: 'index.html'`, `ssr = false`), so the build in `build/` is static.
- Breakpoints and widths are Tailwind defaults only. There is one layout step, `lg` (1024px): the top and tab bars give way to the side nav (`w-64`). Dialogs switch from a bottom sheet to a centered dialog at `md` (768px). The page column is `max-w-2xl` plus the gutter, forms and dialogs are `max-w-md`, and every paragraph measure is `max-w-md`. There is no phone-to-tablet layout step. Don't add a custom breakpoint or a one-off width.
- Vertical spacing uses a short set of Tailwind steps, and only these. `1` or `2`: between a label and its field, or lines in a group (`1` only for a tight pair such as a figure over its caption). `4`: between fields, and from a heading to its intro. `8`: between groups, including notices and the blocks inside a section. `12`: between page sections, including the fieldsets of a form. Don't use `5`, `7`, `9`, `10` or `11` for a vertical margin or gap, and don't add off-grid values like `18px`. Small nudges that line an icon up with text (`mt-0.5`) are fine. Gaps inside a wrapping row of buttons or chips may use `3`.
- Three heading levels, and only these. Page title: the `h1`, with the `page-title` utility. Section title: each page section's `h2`, with the `section-title` utility (`text-xl font-semibold`). Group label: a group inside a section, such as "Your team", in `text-base font-semibold text-secondary`. The small uppercase `label` utility is for kickers and captions, never a heading.
- One section pattern: a line above, then the title, then the content. `12` above the line, `4` from the line to the title, `4` from the title to the content. Use `Section` from `src/lib/ui/section/`, which renders the `<section>`, its `h2` and `aria-labelledby`, with an optional `aside` next to the title for a count or a link. In a form, a section is a `FieldSet` with `sectionClass` from the same folder and a `FieldLegend`. A list right under a section title drops its own top border, and a list at the end of a section drops its bottom border, because the next section's line closes it (`MatchList` has `underTitle` and `inSection`). So there are never two lines in a row. Status panels and alerts are callouts, not sections: they stay boxed.
- The PWA shell is `static/manifest.webmanifest`, `src/service-worker/` (the worker, with its own tsconfig) and `src/pwa/` (routing rules and registration). SvelteKit's auto-registration is off: `hooks.client.ts` registers the worker only when `PUBLIC_API_MOCK` is `off` and not in dev, because MSW owns the worker in the mock modes. `/api/`, `/_allauth/` and `/oauth/` are never cached.
- The mocks stay out of `off` builds. The `apiMocks` plugin in `vite.config.ts` sets `__API_MOCKS__` to `false` there, so the mock import in `hooks.client.ts` is dead code and is dropped. It also serves `mockServiceWorker.js` from the msw package in dev and copies it into mock builds only, so there is no copy in `static/`. Never import `src/lib/mocks/` from app code outside that guard.
