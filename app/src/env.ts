import { defineEnvVars } from '@sveltejs/kit/env';
import { parseMockMode } from './lib/mocks/mode';

/**
 * Environment variables (SvelteKit 3: declared here, read from `$app/env/public`).
 *
 * `PUBLIC_API_MOCK` is `off` (default), `missing` or `all`. It is static: the value is
 * fixed when the app is built or the dev server starts, so a production build with
 * `off` carries none of the mock code.
 */
export const variables = defineEnvVars({
	PUBLIC_API_MOCK: {
		public: true,
		static: true,
		description: 'Which API requests the mocks answer: off, missing or all.',
		schema: (value) => parseMockMode(value)
	}
});
