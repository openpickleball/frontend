# Replace the SvelteKit placeholder page title and description (issue #15)

**Status:** active

Risk tier: Low. One static page and its test. No interaction, state or API. A server-render unit test sees the full head and body output, so it covers every criterion except how a browser shows the title, which a short live drive confirms.

Domain skills: superpowers:test-driven-development: invoke (implementer). chrome-devtools-mcp:chrome-devtools: invoke for the live drive (tab title, meta description, link). frontend-design: not applicable because this is placeholder copy, not a design. a11y-debugging: not applicable because the markup is one heading, one paragraph and one plain link. context7: not applicable because `<svelte:head>` and `svelte/server` `render` are already used in the repo. All others (Django, Expo, React, email, payments, auth): not applicable, no such code.

## Goal

The app's home page names OPEN instead of showing the SvelteKit starter text, and it has a real page title and meta description taken from the teaser. This is a stopgap until step 3 of `plans/app-migration/plan.md` rebuilds the home page.

## Decisions

- Title and description come from the teaser's `<head>` in `site/public/index.html`: title `OPEN Pickleball`, description `Your pickleball rating, always free.` Using the same strings keeps the app and the live site consistent.
- The `<svelte:head>` goes in `app/src/routes/+page.svelte`, not the layout, because the title belongs to this page. Later pages set their own.
- The placeholder links to `https://openpb.org/`, the teaser's canonical URL. The issue says https://www.openpb.org, but www redirects to openpb.org, so linking to the canonical URL skips a redirect. Link text: `openpb.org`.
- The link is a plain same-tab link. The site's new-tab rule is for links that leave openpb.org, and the app is meant to live on openpb.org.
- Copy says nothing about ratings being live (hard rule 3). It names OPEN and points to the site.
- Open Graph and Twitter tags, canonical, and theme-color are not copied. They belong to the home page rebuild, when the app has its own URL and images.

## Acceptance criteria

1. `app/src/routes/+page.svelte` has a `<svelte:head>` with `<title>OPEN Pickleball</title>` and `<meta name="description" content="Your pickleball rating, always free." />`.
2. The page body has an `<h1>` that names OPEN (text: `OPEN`), a short line naming the Open Pickleball Evaluation Network, and a link with `href="https://openpb.org/"`.
3. The server-rendered body contains neither `SvelteKit` nor `svelte.dev`.
4. `app/src/routes/page.test.ts` asserts criteria 1 to 3 against `render(Page)` from `svelte/server` (`head` for 1, `body` for 2 and 3).
5. `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test` and `pnpm build` pass in `app/`.
6. In a browser, the dev server's `/` shows the tab title "OPEN Pickleball", the meta description from criterion 1, and the link to https://openpb.org/.

## Files that change

- `app/src/routes/+page.svelte`: head tags and placeholder copy.
- `app/src/routes/page.test.ts`: new assertions.
- `plans/app-page-title/plan.md`: this plan, status set to done at the end.

## Order of work

1. Red: rewrite `page.test.ts` with the criterion 1 to 3 assertions. Run `pnpm test` and see them fail against the starter page. Commit the test.
2. Green: rewrite `+page.svelte`. Placeholder markup:

   ```svelte
   <svelte:head>
   	<title>OPEN Pickleball</title>
   	<meta name="description" content="Your pickleball rating, always free." />
   </svelte:head>

   <main class="px-gutter py-16">
   	<h1 class="font-display text-3xl">OPEN</h1>
   	<p class="mt-4">The Open Pickleball Evaluation Network. This app is in early development.</p>
   	<p class="mt-4">Visit <a class="underline" href="https://openpb.org/">openpb.org</a> to learn more.</p>
   </main>
   ```

   Use the theme tokens from `layout.css` (`px-gutter`, `font-display`), not hex values.
3. Run the full gate in `app/`, in order: `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test`, `pnpm build`.
4. Live drive (criterion 6).
5. Set this plan's status to done.

## Risks

- The test matching exact HTML strings could break on Svelte's attribute output. Assert on substrings Svelte emits verbatim (`<title>OPEN Pickleball</title>`, `content="Your pickleball rating, always free."`, `href="https://openpb.org/"`), and check `name="description"` separately from `content=` so attribute order does not matter.
- Copy creep: anything beyond naming OPEN and linking the site risks saying something not true today. Keep to the text above.

## Proof

- Criteria 1 to 4: `pnpm test` (`page.test.ts`).
- Criterion 5: the gate output.
- Criterion 6: live drive on the dev server, reading `document.title`, the description meta, and the link `href`.
- Measured on `origin/main` (96487d4) for the phrase-absent test, by a throwaway test rendering `+page.svelte` with `svelte/server`, deleted afterwards: `head` is `""` and `body` is `<!--[--><h1>Welcome to SvelteKit</h1> <p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p><!--]-->`. So criterion 3's assertion fails today and criterion 1's head assertions fail today, as the red step expects.
