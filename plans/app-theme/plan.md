# Bring the teaser's theme into the app (issue #14)

**Status:** done

Risk tier: Medium. CSS and font files, plus a few edited lines in existing files. A build and a unit test cover the generated CSS, but font loading and the switch between the black and ivory themes can only be confirmed in a browser. Eleven files change. Four of them are copied font and license files.

Domain skills: superpowers:test-driven-development: invoke (implementer). chrome-devtools-mcp:chrome-devtools: invoke for the live drive (computed styles, loaded fonts, both color schemes). context7: invoke if Tailwind v4 `compile` or Vite asset URL behavior is unclear. frontend-design: not applicable because no new design is made, the existing tokens are copied. a11y-debugging: not applicable because no markup or interaction changes. All others (Django, Expo, React, email, payments, auth): not applicable, CSS only.

## Goal

The SvelteKit app in `app/` has the teaser's design tokens, fonts and color-scheme handling, so components can use `bg-primary`, `text-secondary`, `font-display`, `px-gutter` and the other theme values and see the same colors and fonts as openpb.org. This is step 2 of `plans/app-migration/plan.md`.

## Decisions

- Scope (asked on 2026-11-17): copy the `@theme` block, the two `@font-face` rules with their font files, and the `:root` `color-scheme` base rules. On its own, the `@theme` block would leave the app always ivory (`light-dark()` needs `color-scheme`) and on fallback fonts. The theme toggle, the `light:` variant, the `data-theme` head script, and the teaser's custom utilities (`mark`, `hero-green`, `shimmer`, `wrap`, `label`, `arrow-link`, scroll animations) are not copied. They belong to the home page rebuild (step 3).
- The `:root[data-theme=...]` rules are copied along with `:root { color-scheme: light dark; }`, since they are part of the same base block and cost nothing. Nothing sets `data-theme` in the app yet, so the system setting decides.
- Fonts live in `app/src/lib/assets/fonts/` and are referenced from `layout.css` by relative URL, so Vite fingerprints them. The OFL license files must ship with the fonts, as the OFL requires when the fonts are redistributed. Nothing imports a text file, so Vite would leave them out of the build if they sat next to the woff2 files. They live in `app/static/fonts/` instead, which SvelteKit copies into the build as is and serves at `/fonts/OFL-KronaOne.txt` and `/fonts/OFL-InstrumentSans.txt`. (Changed 2026-11-17 after review: the first commit had them in `app/src/lib/assets/fonts/`, where the build dropped them.) No `<link rel="preload">` yet. The home page rebuild can add one.
- The test reads `layout.css` and Tailwind's `index.css` with Vite `?raw` imports, not `node:fs`, because the app has no `@types/node` and adding it would be a new dependency. Vitest replaces every CSS import with an empty string by default, so `app/vite.config.ts` sets `test.css.include` to `/\.css\?raw$/`. That only lets raw source reads through. The file-exists test uses `import.meta.glob` on the fonts folder for the same reason. (Recorded 2026-11-17, during implementation.)
- Prettier writes CSS strings with single quotes, so `layout.css` has `'Krona One'` where the teaser has `"Krona One"`. CSS treats the two the same. The test turns single quotes into double quotes in the compiled output before it compares values.
- `app/src/app.html`'s `<body>` gets the teaser's body classes (`bg-primary font-body text-secondary antialiased`), so the app shell uses the theme. This shows the tokens work in a real page.

## Acceptance criteria

1. `app/src/routes/layout.css` contains, after `@import 'tailwindcss';`, the `@theme` block from `site/src/input.css` with the same token names and values: `--color-primary`, `--color-secondary`, `--color-muted`, `--color-line`, `--color-faint`, `--color-surface`, `--spacing-gutter`, `--font-display`, `--font-body`.
2. `layout.css` has `@font-face` rules for "Krona One" (400, normal, `font-display: swap`) and "Instrument Sans" (400 to 700, normal, `font-display: swap`), pointing at `app/src/lib/assets/fonts/krona-one-latin.woff2` and `app/src/lib/assets/fonts/instrument-sans-latin-var.woff2`. Those files are byte-identical copies of the ones in `site/public/assets/fonts/`, and `OFL-KronaOne.txt` and `OFL-InstrumentSans.txt` are copied, byte-identical, to `app/static/fonts/`, so the build ships them.
3. `layout.css` has the base rules `:root { color-scheme: light dark; }`, `:root[data-theme="light"] { color-scheme: light; }` and `:root[data-theme="dark"] { color-scheme: dark; }` inside `@layer base`.
4. Compiling `layout.css` with Tailwind for the candidates `bg-primary`, `text-secondary`, `text-muted`, `border-line`, `text-faint`, `bg-surface`, `px-gutter`, `font-display` and `font-body` emits a rule for each that uses the matching theme variable, and emits the variable definitions with the teaser's values. A Vitest test proves this.
5. `app/src/app.html`'s `<body>` has `class="bg-primary font-body text-secondary antialiased"`.
6. In a browser, the dev server's `/` shows a black background and white text with the system in dark mode, and an ivory background (`#f7f3e8`) and dark text (`#17150f`) in light mode. The body text renders in Instrument Sans, which `document.fonts` reports as loaded, and the woff2 request succeeds.
7. `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test` and `pnpm build` pass in `app/`.
8. Step 2 of `plans/app-migration/plan.md` is ticked. The comment above the `@theme` block in `site/src/input.css` no longer says to copy it at swap time. It says the block is mirrored in `app/src/routes/layout.css` and the two must stay in step until `site/` is deleted. A matching comment sits above the block in `layout.css`. `pnpm build` in `site/` still passes.

## Files that change

- `app/src/routes/layout.css`: tokens, font faces, base rules.
- `app/src/lib/assets/fonts/` (new): two woff2 files, copied from `site/public/assets/fonts/`.
- `app/static/fonts/` (new): the two OFL license files, copied from `site/public/assets/fonts/`.
- `app/src/app.html`: body classes.
- `app/src/routes/layout.test.ts` (new): the compile test for criterion 4.
- `app/vite.config.ts`: let Vitest read `?raw` CSS imports (see Decisions).
- `site/src/input.css`: the comment above `@theme` only.
- `plans/app-migration/plan.md`: tick step 2.
- `plans/app-theme/plan.md`: this file. Set the status to `done` at the end.

## Order of work

1. Write `app/src/routes/layout.test.ts`. It reads `layout.css` and compiles it with `compile` from `tailwindcss`, passing a `loadStylesheet` that resolves `tailwindcss` to `tailwindcss/index.css`, read with a Vite `?raw` import (see Decisions). It calls `build()` with the criterion 4 candidates and asserts: each token's definition with its exact value (for example `--color-primary: light-dark(#f7f3e8, #000000)`), each utility's rule uses its variable (for example `.bg-primary` sets `background-color: var(--color-primary)`), the `color-scheme: light dark` base rule, and both `@font-face` families. A second test asserts that every `url(...)` in `layout.css` resolves to a file that exists. Run it and see it fail against the bare `@import 'tailwindcss';`.
2. Copy the fonts and license files. Add the comment, `@theme`, `@font-face` and `@layer base` blocks to `layout.css`. Run the test until it passes.
3. Add the body classes to `app.html`.
4. Run the full app gate in order. Run `pnpm build` in `site/` after the comment edit.
5. Tick the migration plan step, update the `site/src/input.css` comment, set this plan's status to `done`.
6. Live drive (criterion 6).

## Risks

- The `compile` API's `loadStylesheet` contract may differ from what step 1 assumes. Check it with context7 or the package's types before writing the test. Do not add a dependency (such as `@tailwindcss/node`) without recording the decision here. If the test cannot be made reliable, stop and report rather than weakening it to a text match on `layout.css`.
- Relative font URLs in `layout.css` must resolve from `src/routes/` (`../lib/assets/fonts/...`). A wrong path builds silently and only shows as a fallback font. The file-exists test and the live drive catch it.
- `font-display` in `@font-face` is the CSS descriptor, while `--font-display` is the theme token and `font-display` is also a Tailwind utility name. They don't collide, but the test must look for the utility rule, not the descriptor.
- Changing `app.html` changes how the placeholder page looks. That is intended.
- Prettier formats CSS in `app/` with tabs and single quotes. Run `pnpm format` before the gate, so copied blocks match the app's style.

Not doing: theme toggle, `light:` variant, head script, preload links, the teaser's custom utilities and animations, any new page markup.

## Proof

- Criteria 1 to 4: `app/src/routes/layout.test.ts`. It checks each token value, each utility rule, each `@font-face` (its own `src`, weight, `font-style: normal` and `font-display: swap`), each `color-scheme` rule exactly, and that the three `:root` rules sit inside `@layer base` in `layout.css`.
- Criterion 2 (license files ship): `pnpm build`, then find `OFL-*.txt` in the build output.
- Criterion 2 (byte-identical): `cmp` of each copied file against its source, output in the PR.
- Criterion 5: `grep` of `app.html`, and the live drive.
- Criterion 6: live drive with the Chrome DevTools tools against `pnpm dev`: emulate `prefers-color-scheme: dark` and `light`, read the body's computed `background-color`, `color` and `font-family`, read `document.fonts` status for both families, and check the network request for the woff2 file returns 200.
- Criterion 7: the gate output.
- Criterion 8: the diff, and `pnpm build` in `site/`.

No "behave alike" or "phrase absent" tests, so nothing to measure on `main`.
