// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** `false` in a `PUBLIC_API_MOCK=off` build, `true` otherwise (`vite.config.ts`). */
	const __API_MOCKS__: boolean;
	/** The `version` in `package.json`, set at build time (`vite.config.ts`). */
	const __APP_VERSION__: string;
	/** The short commit hash of the build, or `''` when unknown (`vite.config.ts`). */
	const __APP_COMMIT__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** Where a match or correction page's back link goes (`features/matches/back-link.ts`). */
			backTo?: { href: string; label: string; back: boolean };
		}
		// interface Platform {}
	}
}

export {};
