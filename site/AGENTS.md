# site/

The static pages served at www.openpb.org. They are temporary: `plans/app-migration/` ends with deleting this folder.

- `public/` is the only folder that gets published.
- `public/index.html` is the whole site: the one-screen teaser at the top, then the about sections below it (`#about`, `#how`, `#promises`, `#roadmap`, `#help`). It is styled with the Tailwind CLI. `src/input.css` compiles to `public/assets/css/main.css`. The output is generated, so edit the input.
- Scrolling from the teaser into `#about` is animated with CSS scroll-driven animations (`.hero`, `.hero-copy`, `.hero-art`, `.reveal` in `src/input.css`). Browsers without them, and reduced motion, get the same page standing still. "Learn more" glides there with a short script at the end of `index.html`.
- Two themes: black and ivory. Each color token in `src/input.css` is `light-dark(ivory, black)`. The system setting decides unless the visitor picks one with the toggle at the top right. The choice is saved in `localStorage` and applied by a script in the `<head>` of `index.html` and `404.html`. Use the color tokens (`stroke-line`, `fill-secondary` and so on), not hex values, and the `light:` variant for anything else that differs. The ivory theme turns the horizon render into a green ball on ivory (`hero-green`): the `#ball-green` SVG filter in `index.html` maps black to green, and a circle mask per render, fitted with `design/tools/fit-ball-mask.py`, hides the black around the ball.
- `public/assets/js/rating-sketch.js` drives the sample court in `#how`.
- `public/about/index.html` only redirects old `/about/` links to `/#about`.
- `public/404.html` uses the same styles.
- The logo is `public/assets/img/mark.svg`. `mark.svg` and `favicon.svg` come from `design/tools/export-logo.py`; `favicon-48.png` and `apple-touch-icon.png` are browser renders of `favicon.svg`. See `plans/about-redesign/`.

## Commands

- `pnpm dev` rebuilds the CSS on change.
- `pnpm build` produces the minified CSS.

To view the site, serve `public/` (the `teaser` entry in `.claude/launch.json` does this) and open `/`.

## Deployment

Merging changes under `site/` to `main` deploys the site to production. PRs run the build only.
