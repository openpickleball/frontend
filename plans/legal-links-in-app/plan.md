# Plan: Link the Terms of Service and Privacy Policy from the app (issue #198)

**Status:** active

Risk tier: Low. Static links and one line of copy in two existing components. Server-render and browser component tests cover them fully. No behavior, API or data changes.

Domain skills: chrome-devtools-mcp:a11y-debugging: invoke during the live drive (link names, focus, new-tab text). frontend-design, impeccable: not applicable, because there is no new visual direction, only links in the existing styles. django, django-allauth, django-ninja-api: not applicable, because nothing in the backend changes.

## Goal

The app links to the Terms of Service and the Privacy Policy on openpb.org from every page and from the signup form, so a player can read them before making an account.

## Where #198 stands

- The Terms page, its site footer link and the owner's request to have Claude write the text were done in frontend#201 (PR #202, merged 2026-11-24). Owner sign-off and legal review before launch stay with the project owner. This PR does not tick them.
- This PR does the two app tasks: the app footer link and the signup line.

## Acceptance criteria

1. The app footer, on every page (with and without the tab bar), links "Terms" to `https://openpb.org/terms/` and "Privacy" to `https://openpb.org/privacy/`.
2. The signup form shows, directly under the Create account button, the line "By creating an account you agree to the Terms of Service and Privacy Policy." "Terms of Service" links to `https://openpb.org/terms/` and "Privacy Policy" to `https://openpb.org/privacy/`.
3. Every new link opens in a new tab, as links that leave the app do: `target="_blank" rel="noopener"` and a visually hidden " (opens in a new tab)" in its accessible name. On signup this also keeps what the player typed.
4. The existing footer text and source code link are unchanged. The line does not show on the "Check your email" view.
5. The new links use the existing link styles and Tailwind defaults only. `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test` and `pnpm build` pass.

## Files that change

- `app/src/lib/ui/legal.ts` (new): `TERMS_URL` and `PRIVACY_URL`, the two page addresses, in one place. It lives in `ui` because `ui` may import only `ui` (eslint boundaries), and `features` may import `ui`. The addresses match each page's `<link rel="canonical">` in `site/public/terms/` and `site/public/privacy/`.
- `app/src/lib/ui/app-shell/site-footer.svelte`: a second line in the footer, under the license line, with "Terms" and "Privacy". Same link style as the source code link (`text-muted underline underline-offset-2 hover:text-secondary`). Vertical gap `mt-2` (lines in a group). The row is `flex flex-wrap gap-x-4`. Use a `<p>`, not a `<nav>`, because `app-shell.test.ts` counts the page's navs and account pages must have none.
- `app/src/lib/ui/app-shell/app-shell.test.ts`: extend the footer test.
- `app/src/lib/features/auth/components/signup-form.svelte`: the line as a `<p class="text-sm text-muted">` right after the Create account `Button`, before the form alert and "Already have an account?". Inline links styled like the footer links. Import the URLs from `#lib/ui/legal.js`.
- `app/src/lib/features/auth/components/signup-form.svelte.test.ts`: new tests.
- `app/AGENTS.md` only if it describes the footer's content (check in Phase 8).

## Order of work

1. Red: extend the footer test in `app-shell.test.ts`. For both `bare` and not, the footer has a link with text "Terms" and `href="https://openpb.org/terms/"`, and one with "Privacy" and `href="https://openpb.org/privacy/"`, each with `target="_blank"`, `rel="noopener"` and "(opens in a new tab)". The source code link checks stay. Run it and see it fail. Commit the test.
2. Green: add `legal.ts` and the footer line. Commit.
3. Red: in `signup-form.svelte.test.ts`, test that the line's text shows, that the links named "Terms of Service (opens in a new tab)" and "Privacy Policy (opens in a new tab)" have the right `href`, `target` and `rel`, that the line comes after the Create account button in document order (`compareDocumentPosition`), and that the "Check your email" view has no Terms link. Run and see it fail. Commit the test.
4. Green: add the line to the signup form. Commit.
5. Full gate in `app/`: `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test`, `pnpm build`.
6. Live drive with `pnpm dev`: the footer on `/` and on `/account/signup`, the signup line, in both themes, at 390px and at 1280px. Check that the links open openpb.org in a new tab, have the right accessible names, and that the line wraps cleanly on a phone.

## Risks

- frontend#197 rewrites `signup-form.svelte` into two screens with agreement checkboxes that link the same pages. The line will conflict with that branch and will likely be replaced by the checkboxes. The owner chose to add it now (2026-11-23). Keep the change small and in one place so #197 can move or remove it.
- Footer height grows by one line. The bottom padding that clears the tab bar is unchanged and still applies below the last line.

## Proof

- Criteria 1, 3, 4 (footer): `app-shell.test.ts` footer test.
- Criteria 2, 3, 4 (signup): `signup-form.svelte.test.ts`.
- Criterion 5: the gate output.
- Live drive: screenshots of the footer and the signup line in both themes at 390px, link targets and names from the accessibility tree.

## Decisions

- The app footer gets both "Terms" and "Privacy", matching the site footer, so #199's footer task is done here too. #199 stays open for its other tasks (project owner, 2026-11-23).
- The signup line ships now, although #197's plan adds agreement checkboxes later (project owner, 2026-11-23).
- The links point at `https://openpb.org/...`, the canonical address of each page.
- The links open in a new tab, as other links that leave the app do, so a player on the signup form keeps what they typed.
