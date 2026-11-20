# site/

The public page at openpb.org. It stays when the app ships at app.openpb.org (frontend#22).

- `public/` is the only folder that gets published.
- `public/index.html` is the whole site: the one-screen teaser at the top, then the about sections below it (`#about`, which is "What we stand for", then `#open-source`, which explains open-source in plain words, then `#help`, which is "Get involved"). It is styled with the Tailwind CLI. `src/input.css` compiles to `public/assets/css/main.css`. The output is generated, so edit the input.
- Scrolling from the teaser into `#about` is animated with CSS scroll-driven animations (`.hero`, `.hero-copy`, `.hero-art`, `.reveal` in `src/input.css`). Browsers without them, and reduced motion, get the same page standing still. "Learn more" glides there with a short script at the end of `index.html`.
- Two themes: black and ivory. Each color token in `src/input.css` is `light-dark(ivory, black)`. The system setting decides unless the visitor picks one with the toggle at the top right. The choice is saved in `localStorage` and applied by a script in the `<head>` of `index.html` and `404.html`. Use the color tokens (`stroke-line`, `fill-secondary` and so on), not hex values, and the `light:` variant for anything else that differs. The ivory theme turns the horizon render into a green ball on ivory (`hero-green`): the `#ball-green` SVG filter in `index.html` maps black to green, and a circle mask per render, fitted with `design/tools/fit-ball-mask.py`, hides the black around the ball.
- Links that leave openpb.org open in a new tab: `target="_blank" rel="noopener"` plus a visually hidden "(opens in a new tab)".
- Visible text spells the term "open-source", with a hyphen, as noun and adjective (see the Decisions in `plans/open-source-explainer/plan.md`). Ids and anchors such as `#open-source` are not visible text and keep their form.
- Only say what is true today. Don't add graphics or copy about the rating method, data or roadmap until it is published (see `plans/site-content-v2/`).
- The "Get involved" button opens the Tally interest form `Kp50eD` as a popup. `https://tally.so/widgets/embed.js` loads in the `<head>`, and a short script at the end of `index.html` calls `Tally.openPopup` with `hideTitle: true`. Without that script, the link opens the form in a new tab.
- `public/about/index.html` only redirects old `/about/` links to `/#about`.
- `public/404.html` uses the same styles.
- `public/funding.json` is OPEN's [funding.json](https://fundingjson.org) manifest, served at `https://www.openpb.org/funding.json`. The `engine`, `backend`, `frontend`, and `rating-spec` repositories each have a `.well-known/funding-manifest-urls` file pointing to it. Keep it true today, like the rest of the site.
- The logo is `public/assets/img/mark.svg`. `mark.svg` and `favicon.svg` come from `design/tools/export-logo.py`; `favicon-48.png` and `apple-touch-icon.png` are browser renders of `favicon.svg`. See `plans/about-redesign/`.

## Tailwind values

Follow the same order as the app's [Reuse before you build](../app/AGENTS.md#reuse-before-you-build): a native element, then Tailwind's default scales, then the color tokens in `src/input.css`. Avoid arbitrary values in square brackets unless they need `env()` or `calc()`, and say why in a comment.

Values left on purpose: `clamp()` font sizes and gaps (fluid, no default), `-mr-[0.1em]`, `gap-[0.32em]` and `size-[1.25em]` (relative to the wordmark size), `max-w-[20ch]` (heading measure), the art grid rows and `object-[...]` positions (fitted to the render).

## Commands

- `pnpm dev` rebuilds the CSS on change.
- `pnpm build` produces the minified CSS.

To view the site, serve `public/` (the `site` entry in `.claude/launch.json` does this) and open `/`.

## Deployment

Merging changes under `site/` to `main` deploys the site to production. PRs run the build only.
