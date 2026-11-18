# Player app mockups (frontend v1)

Static, clickable HTML mockups of the v1 screens. They use the site's design language as is: the
`@theme` tokens from `site/src/input.css`, Krona One and Instrument Sans from
`site/public/assets/fonts/`, the mark from `site/public/assets/img/mark.svg`, and the same
`data-theme` switch. All names, codes, emails and scores are made up.

**Decisions that override these mockups** (`plans/frontend-v1/plan.md`, Q1 and Q4):

- The record button says the player is confirming the score. Submitting confirms for the submitter's team.
- After submit, the match waits only on the other team. The "recorded" state in `match.html` must not ask the submitter to confirm.
- There is no offline queue (deferred to frontend#33). Offline shows an error.

## Viewing

Serve the repo root with the `design` entry in `.claude/launch.json` (port 4174) and open
`http://localhost:4174/plans/frontend-v1/mockups/`. Opening the files over `file://` won't load the
fonts or the logo, since both are CORS fetches.

Each screen has a dashed "mockup states" bar at the top. The URL hash picks the state, so
`home.html#empty` links straight to the empty home screen. The bar is not part of the app.

| File | Screen | States |
|---|---|---|
| `index.html` | List of screens and states | |
| `auth.html` | Sign in, create account, email verification | `sign-in`, `sign-in-error`, `sign-up`, `check-email`, `verified`, `link-expired` |
| `home.html` | Home | `default`, `empty`, `offline`, `error` |
| `record.html` | Record a match | `filled`, `new`, `errors` |
| `match.html` | Match detail | `pending`, `recorded`, `dispute-dialog`, `confirmed`, `disputed` |
| `history.html` | Match history | `page-1`, `page-3`, `empty`, `offline` |
| `profile.html` | Profile and rating | `today`, `preview` |
| `mockup.css` | Site tokens, token additions, all components | |
| `mockup.js` | Theme, app shell, state switcher, made-up data, toasts | |

## Layout

- Mobile first, designed at 390px. A sticky top bar holds the wordmark and the theme toggle (same
  icons and behavior as the site), and a bottom tab bar holds Home, Record, Matches and Profile.
- From 960px the top and bottom bars give way to a 248px side nav with the theme toggle at its
  foot. Content stays in one column, max 720px, with the site gutter
  (`clamp(20px, 4vw, 56px)`).
- Structure comes from the site's hairline rules (`border-t border-line`), not cards. Lists are
  rows between rules. Panels (`Card`) only appear where something needs to stand apart: the status
  panel on a match and the rating card.

## Component inventory

| Component (shadcn-svelte) | Where it's used | Notes |
|---|---|---|
| `Button`, variant `default` (`.btn--primary`) | Record a match, Sign in, Create account, Confirm, Record match | Site CTA: pill, `bg-secondary text-primary`, 600, `hover:bg-muted`. Navigation CTAs keep the site's `arrow-link` →; form submits don't. 48px min height. |
| `Button`, variant `outline` (`.btn--outline`) | Copy code, Review, Share, Try again, Cancel, pagination, Sign out | Border `line`, hover border `muted`, like the site's social buttons. |
| `Button`, variant `destructive` outline (`.btn--danger`) and solid (`.btn--danger-solid`) | Dispute on match detail; Dispute score in the dialog | Uses `--color-danger`. Solid only inside the confirm dialog. |
| `Button`, variant `ghost` / `link` (`.btn--ghost`, `.text-link`, `.inline-link`) | + Add a game, All matches →, Forgot your password?, Create an account | `.inline-link` is underlined for links inside sentences. |
| `Badge` (`.badge--pending/confirmed/disputed/voided`) | Match rows, match detail header | Outline pill with a dot. Pending is dashed with a hollow dot, so status never depends on color alone. Text always names the status. |
| `Card` (`.card`, `.status-panel`) | Rating (today), rating preview, match status panel | No radius and no shadow, `surface` fill, `line` border. The status panel adds a 3px left rule in the status color. The preview card is dashed and hatched. |
| `Input` (`.input`, `.input--code`, `.input--score`) | Email, password, date, OPEN codes, game scores | Pill, 48px, border `--color-field` (see token additions). Code inputs use Krona One uppercase. Score inputs are 64px, centered, `inputmode="numeric"`. Invalid: `aria-invalid` plus a danger border and a message tied by `aria-describedby`. |
| `Label` + form field (`.field`, `.field-label`, `.field-hint`, `.field-error`) | All forms | Error text starts with a filled "!" so it doesn't rely on color. Maps to formsnap `Field`/`Control`/`Description`/`FieldErrors`. |
| `ToggleGroup` (single) or `RadioGroup` styled as segments (`.seg`) | Format (singles/doubles), Games to (11/15/21), Scoring (side-out/rally) | Real radio inputs in the mockup. Selected segment is the solid button style. Shadcn `Tabs` would also fit, but these pick a value, they don't switch panels. |
| Chip (custom on `Badge` + `Button`, `.chip`) | OPEN codes in Record a match | A code turns into a chip on Enter or blur once it matches the format. The remove button is labelled "Remove P-…". The chip shows only the code, since there's no player lookup (see backend gaps). An error chip shows a server `unknown_player` error. |
| `Alert` (`.banner`, `--error`, `--success`) | Offline and couldn't-load on Home and Matches; error summary on Record; wrong password; email confirmed | Left rule plus an icon. The error summary links to each field and takes focus on submit. |
| `Sonner` toast (`.toast`) | Match recorded, Confirmed, Score disputed, Code copied, Email sent again | Pill, inverted (`bg-secondary text-primary`), above the tab bar on mobile, bottom right on desktop. `role="status"`. The wording matches the button: "Dispute score" → "Score disputed". |
| `AlertDialog` (desktop) / `Sheet` side `bottom` (mobile) (`.overlay .dialog`) | Dispute this score? | Bottom sheet below 640px, centered dialog above. Cancel gets focus first. |
| Match row (custom, `.match-row`) | Home (both lists), Matches | One link per row with a full `aria-label`; the visual score grid is `aria-hidden`. Winner's team and games in `secondary` 600, the rest `muted`. Voided rows strike through. |
| Scoreboard (custom, `.scoreboard`) | Match detail | Teams down, games across, plus a visually hidden `<table>` for screen readers. The winning team gets a "Won 2–1" tag, not just bold. |
| `Pagination` (`.pagination`) | Matches | Newer/Older plus a "1–20 of 47" range. Matches the API's `limit`/`offset` and `count`. |
| Empty state (custom, `.empty`) | Home, Matches | Faded mark, one heading, a plain sentence, the next action. |
| Code display (`.code`, `.code--lg`) | Home strip, Profile, match detail | OPEN codes are set in Krona One, the wordmark face, because players read them out to each other. |
| App shell: top bar, `Sidebar`/side nav, bottom tab bar | Every signed-in screen | Built by `mockup.js` from `data-page`. `aria-current="page"` on the active item. |
| Theme toggle | Top bar, side nav, Profile | Copied from the site: sun in black, moon in ivory, view-transition crossfade, `localStorage.theme`. |
| `Skeleton` | Not drawn | Rows would use the match-row layout with `line`-colored bars. |

## Token additions

The site tokens are re-declared unchanged at the top of `mockup.css`. These are new. Contrast is
WCAG 2 against `primary` / `surface`.

| Token | Ivory (light) | Black (dark) | Role | Contrast light | Contrast dark |
|---|---|---|---|---|---|
| `--color-confirmed` | `#3b5c12` | `#bad446` | Confirmed badge and status rule; rating delta in the preview | 6.95 / 7.38 | 12.59 / 11.66 |
| `--color-disputed` | `#a3301b` | `#ff8b73` | Disputed badge and status rule | 6.32 / 6.71 | 9.19 / 8.51 |
| `--color-danger` | `#a3301b` | `#ff8b73` | Errors, destructive buttons. Same values as disputed, separate name | 6.32 / 6.71 | 9.19 / 8.51 |
| `--color-pending` | = `muted` `#4d493f` | = `muted` `#bdbdbd` | Pending badge. Neutral on purpose | 8.09 | 11.18 |
| `--color-voided` | = `faint` `#6c6658` | = `faint` `#8a8a8a` | Voided badge and note | 5.15 | 6.08 |
| `--color-field` | = `faint` `#6c6658` | = `faint` `#8a8a8a` | Borders of inputs and segmented controls. `line` is 1.4:1 and 1.9:1, below the 3:1 that WCAG 1.4.11 asks of control boundaries | 5.15 | 6.08 |
| `--color-confirmed-wash` | `#e9ecd2` | `#141a06` | Success banner background | confirmed text on it: 6.38 | 10.67 |
| `--color-danger-wash` | `#f6e2d9` | `#1f0d09` | Error banner background, danger button hover | danger text on it: 5.61 | 8.21 |
| `--tabbar-height`, `--header-height` | `64px` | `64px` | Shell sizes; the header matches the site's `h-16` | | |

The dark confirmed green is the pickleball green from the `#ball-green` filter (about `#bad446`),
which the design audit already suggested making a token. The light value is a darker olive of the
same hue so it passes AA on ivory.

## Copy and data rules followed

- Only what is true today. The profile says ratings aren't live yet, and repeats the site's
  promise ("you'll be able to see what changed your rating") with "will". The rating card only
  appears under "Preview: not live", with "Sample numbers. This is not your rating" inside it.
- Validation messages follow the backend codes: `not_won_by_two` ("Game 2 isn't finished at
  11–10. A game is won by 2 points."), `played_past_target` ("Game 3 can't end 13–10. Past 11, a
  game ends as soon as one team leads by 2."), `unknown_player` ("No player has the code …").
- Every score in the data obeys the backend rules (no ties, target reached, win by 2, past the
  target end exactly 2 ahead). Targets 11, 15 and 21 and both scoring types appear.
- OPEN codes use the backend format with Crockford base32 (no I, L, O or U): players
  `P-XXXX-XXXX`, matches `M-XXXX-XXXX-XXXX`. The check characters are not real checksums. Emails
  use `example.com`.

## Backend gaps the mockups assume away

These screens show data the API doesn't return yet. Each needs a backend issue or a frontend
workaround.

| Shown | Needs | Today |
|---|---|---|
| Your OPEN code, your name ("Hi, Tamsin"), Profile header | `GET /me/player` (backend#124) | `accounts/me` returns only `{email}` |
| "Needs your confirmation" list and its Confirm buttons | A viewer-aware field on `MatchOut` (`confirmed_by_me` / `can_confirm`) or a "pending for me" list | Only `status`. Pending matches you submitted and pending matches waiting on you look the same |
| Match detail page by URL | `GET /matches/{code}` | Must be found in a list page or reused from the create/confirm/dispute response |
| Names in the code chip before saving | Player lookup by code (`GET /players/{code}`, backend#124) | None. The chip shows only the code; names appear after `POST /matches/` |
| "Pending: 3" on Profile | A status filter or per-status counts | Only a total `count`; the client would have to page through everything |
| Dispute reason | A body on `/dispute` | No reason is stored, so the dialog doesn't ask for one |
| "Your last visit, Saturday at 18:40" in the offline banner | A client cache (PWA, frontend#22) | Nothing yet |

## Things I extended or wasn't sure about

1. **Status colors.** The site has no accent and no status colors. I added green and red-orange,
   kept pending neutral (dashed outline), and every badge has text and a distinct dot shape, so
   color is never the only signal. A reviewer may prefer an all-monochrome status set.
2. **Radii.** The site only uses `rounded-full`. Controls (buttons, inputs, chips, segments,
   badges, toasts) are all pills. Panels and the dialog are square with a hairline border and no
   shadow. Square panels next to pill controls is a deliberate reading of the site, but it's a
   new combination.
3. **Input borders** use `faint` instead of `line` for contrast. That makes form fields darker
   than any border on the site.
4. **Krona One for OPEN codes.** It extends the "Krona One only for identity" rule to codes. It's
   wide, so long codes may need care at 320px (it fits at 390px).
5. **The `label` kicker** (Krona One 11px caps) is used for the date on match detail and for
   Profile section names. It's not numbered here, since these aren't sequences.
6. **Rating preview number.** The site never shows the 2.0–8.0 scale. The preview shows "3.87"
   with no scale and no method, and is labeled as sample data. If even a sample number is too
   much, swap it for a placeholder glyph.
7. **Password rule** "At least 8 characters" is Django's default minimum length. I didn't confirm
   OPEN's validators.
8. **The submitter's own confirmation.** The research says the submitter probably also has to
   confirm. The design doesn't show "you confirmed" after recording, because `MatchOut` can't
   say so.
9. **Desktop record form** stays one column. Putting the two teams side by side is a possible
   refinement.
