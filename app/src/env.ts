import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Environment variables (SvelteKit 3: declared here, read from `$app/env/public`).
 *
 * `PUBLIC_API_MOCK` is `off` (default), `missing` or `all`. It is static: the value is
 * fixed when the app is built or the dev server starts. The check below repeats
 * `parseMockMode` in `lib/mocks/mode.ts` on purpose, so this file imports nothing from
 * `lib/`. Anything else counts as `off`, so a typo never turns mocks on.
 *
 * An `off` build ships no mock code and no `mockServiceWorker.js` (see `vite.config.ts`, and
 * `pnpm check:build`, which checks it).
 */
export const variables = defineEnvVars({
	PUBLIC_API_MOCK: {
		public: true,
		static: true,
		description: 'Which API requests the mocks answer: off, missing or all.',
		schema: (value) => (value === 'missing' || value === 'all' ? value : ('off' as const))
	}
});
