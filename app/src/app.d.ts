// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** `false` in a `PUBLIC_API_MOCK=off` build, `true` otherwise (`vite.config.ts`). */
	const __API_MOCKS__: boolean;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
