# Frontend stack: SvelteKit, React Native or Flutter

**Status:** proposed, not decided · 16 Nov 2026

## Recommendation

Build a responsive web app in SvelteKit, ship it as an installable PWA, and keep the data layer in plain TypeScript so a mobile app can reuse it later.

Most of what OpenPB does is pages people open from a link: a player profile, a rating history, a club leaderboard, a score to enter after a game. The web is best at that work, and of the three options SvelteKit is the fastest and simplest way to build it. If we later need to be in the app stores, we can wrap the same app with Capacitor for very little effort. If we eventually want a fully native app, we can build it in Expo and reuse our TypeScript API client and domain logic. Flutter fits worst, because its web output is the part we need most and the part it does worst.

## What we're building

Most of the app is reading data and entering it. The heavy logic (rating calculation, match validation) belongs on the server, where it can be published and audited.

- **Read:** player profiles, rating history charts, match lists, club and event leaderboards, player search.
- **Write:** sign up and claim a profile, enter a match score, confirm or dispute a score someone else entered, manage a club or event.

Needs that aren't obvious from "display plus entry", and that affect the choice:

- **Shareable public pages.** Players will paste profile and leaderboard links into group chats. Those links need server-rendered HTML so previews show a name and rating, and so search engines can index them.
- **Score entry at the court.** Scores get entered on a phone, often with weak signal. Entry should be quick, work one-handed, and queue the submission when offline. A PWA with a small sync queue covers this.
- **Older, non-technical players.** Large text, real form controls, screen reader support and browser zoom matter. Native HTML gives us these for free. A canvas renderer does not.
- **Live event days.** Brackets and leaderboards may update while people watch. All three options handle websockets or server-sent events, so this doesn't change the decision.

## These aren't three versions of the same thing

- **SvelteKit** is a web framework. It reaches mobile through the browser (PWA) or a native wrapper (Capacitor).
- **React Native** is a mobile framework, which in practice means Expo. Expo can target the web through React Native Web, which works but is a translation layer: you write `<View>` and `<Text>`, not HTML.
- **Flutter** is a mobile framework that draws every pixel itself. On the web it paints to a canvas with a WebAssembly engine, so the page isn't really HTML.

So the real question is which platform we want to be excellent on first, and how much the second one costs. We're starting with web, which gives a web-native framework the advantage, as long as the path to mobile stays open.

## Scorecard

Scores run from 1 to 5. They're judgment calls, not benchmarks. Weights reflect the web-first phase.

| Criterion | Weight | SvelteKit | React Native (Expo) | Flutter |
| --- | --- | --- | --- | --- |
| Fast, responsive UI (load and feel on a mid-range phone browser) | ×3 | 5 | 3 | 2 |
| Path to mobile (effort and code reuse when we add apps) | ×2 | 3 | 5 | 5 |
| Developer experience (tooling, simplicity, iteration speed) | ×3 | 5 | 4 | 4 |
| Shareable, searchable pages (server rendering, link previews, SEO) | ×3 | 5 | 2 | 1 |
| Time to first release (overhead before real users can use it) | ×3 | 5 | 3 | 3 |
| Accessibility on web (screen readers, zoom, text selection, autofill) | ×2 | 5 | 3 | 2 |
| Contributor and hiring pool | ×2 | 3 | 5 | 3 |
| Ecosystem (charts, forms, components, auth) | ×1 | 4 | 4 | 3 |
| **Weighted total (of 95)** | | **86** | **66** | **53** |

If mobile became the top priority (path to mobile ×3, shareable pages ×1), the totals would be 79, 67 and 56. React Native narrows the gap but still trails on the web criteria. The ranking only flips if the native app becomes the main product and the web becomes secondary.

## Each option

### SvelteKit (recommended)

Strengths:

- Compiles to small bundles with little runtime, so pages load fast on cheap phones and slow connections.
- Server rendering, form actions and data loading are built in. Forms work before JavaScript loads and get better once it does.
- Components read like HTML and CSS, so new contributors can follow them on day one.
- Real HTML means accessibility, autofill, zoom and link previews work without extra effort.
- Installable PWA with offline support and push notifications, including on iPhone from the home screen.

Weaknesses:

- Smaller community than React: fewer ready-made components and fewer developers who already know it.
- Svelte 5's runes changed how components are written, so some older tutorials and libraries are out of date.
- No direct route to a truly native app. Mobile means a PWA, a Capacitor wrapper, or a second app in another framework.
- AI coding tools are somewhat better at React than at Svelte 5, though the gap has narrowed.

Adding mobile later: the PWA comes free from the start. A Capacitor wrapper puts the same code in the App Store and Play Store, typically in days to a couple of weeks, with native plugins for push, camera and sharing. A fully native app would be a new Expo codebase that reuses our TypeScript API client, validation and domain types, but not our UI.

### React Native with Expo (strong for mobile-first)

Strengths:

- One codebase for iOS, Android and web, with truly native screens on phones.
- Expo has removed most of the old pain: managed builds (EAS), over-the-air updates, file-based routing and a good set of native modules.
- The largest developer and contributor pool of the three.
- The best choice if a polished native app is required within the first year.

Weaknesses:

- The web build goes through React Native Web. It isn't idiomatic HTML: most React web libraries won't run, and styling uses React Native's subset of CSS.
- Server rendering and SEO on the web are weaker than in a web framework, and they're the newest, least proven part of Expo.
- Mobile overhead starts on day one: simulators, device testing, native builds, SDK upgrades and store releases.
- Web pages carry more JavaScript than SvelteKit pages, which shows on slow phones.

Adding mobile later: already done. That's the reason to choose it, and the cost is paying for mobile from the start even while we ship only web.

### Flutter (not recommended)

Strengths:

- Excellent mobile apps that look the same everywhere, with great hot reload and tooling.
- Dart is pleasant and strongly typed, and the built-in widget set is large and consistent.
- Strong for apps with lots of custom animation or drawing.

Weaknesses:

- On the web it draws to a canvas, so the first load is large (often several megabytes) and slow on mobile data.
- Pages aren't real HTML. Search engines and link previews see very little, and text selection, browser find and autofill behave differently.
- Screen reader support on the web relies on a separate semantics layer, which is harder to get right for older players.
- Dart sits outside the JavaScript ecosystem, so we can't share code with TypeScript tooling, and fewer web developers can contribute.

Adding mobile later: easy, since mobile is Flutter's home. But we'd accept a weak web app, which is the part we're building first.

### Runner-up worth naming

React for the web (Next.js or React Router), with an Expo app later. It brings React's contributor pool and lets us share hooks and logic with a future native app. The cost is a heavier, more complex web stack than SvelteKit. Choose this if a large contributor pool turns out to matter more than speed and simplicity.

## The path to mobile, one step at a time

Each step adds cost, and we only take the next one when there's a clear reason. Steps 1 to 3 use the same SvelteKit code.

1. **Responsive web app.** Phone-first design, since that's where most scores get entered. Cost: none beyond the web app.
2. **Installable PWA.** Home screen icon, full-screen view, offline score queue, push notifications. On iPhone, push only works once the app is added to the home screen. Cost: a manifest, a service worker, a few days.
3. **Store listing with Capacitor.** The same web app in a native shell, plus native push, sharing and camera plugins. Cost: Apple developer program ($99/yr), Google Play ($25 once), store review, a device test pass per release.
4. **Native app in Expo.** Only if the wrapped app feels limiting: widgets, background work, heavy offline use, or a UI that must feel fully native. Cost: a second UI codebase that shares our TypeScript data layer.

Store overhead to plan for: Apple reviews every release, usually within a day or two, sometimes with rejections to fix. New personal Google Play accounts must run a closed test with at least 12 testers for 14 days before going public. An organization account avoids that, so register OpenPB as an organization.

## Choices that make the later steps cheap

Mobile code reuse depends less on the UI framework than on how we structure the code from the start.

- **API first.** The backend publishes an OpenAPI spec, and we generate a typed TypeScript client from it. Every frontend talks to the same contract.
- **A shared core package.** Domain types, validation schemas (for example Zod or Valibot), score formatting and the offline submission queue live in plain TypeScript with no Svelte imports. An Expo app could use it unchanged.
- **Thin components.** Components handle display and input. Rules such as "a game to 11, win by 2" live in the core package.
- **Design tokens as data.** Colors, type scale and spacing are defined once (the `@theme` block in `site/src/input.css`) so a native app can reuse them.
- **Auth that works outside a browser.** Pick an approach that supports cookies for the web and tokens for a native app, so adding mobile doesn't mean redoing login.

## When we'd reconsider

- Partners or clubs require a native app in the stores sooner than a Capacitor wrapper can deliver one.
- We need native features a wrapper handles poorly: home screen widgets, background location, or Apple Watch scoring.
- We can't find enough Svelte contributors, and the lack of React is the reason.
- Usage data shows most players stay on mobile and share links aren't driving traffic.

## Open questions

1. Is there a date by which we must be in the App Store or Play Store? If it's within six months of launch, Expo becomes more attractive.
2. Who is writing the frontend: one or two core developers, or a wider volunteer community? A wider community favors React.
3. What is the backend written in? If it's TypeScript, we can share more code between server and client.
4. Do we expect any feature that needs the phone itself, such as Bluetooth scoring devices or court check-in by location?

Prices and store rules are as of November 2026. Check them before registering accounts.
