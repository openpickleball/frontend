import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// SPA mode (plans/frontend-v1/proposal.md section 5): every route falls back to index.html,
			// and the root layout turns off server rendering.
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	server: {
		// Same-origin API in dev, so the session cookie and CSRF work. changeOrigin stays
		// false: Host then matches Origin (localhost:5173), which Django's origin check needs.
		proxy: {
			'/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
			'/_allauth': { target: 'http://127.0.0.1:8000', changeOrigin: false }
		}
	},
	test: {
		// Vitest blanks CSS imports by default. Let `?raw` imports through, so tests can read
		// stylesheet source (see src/routes/layout.test.ts).
		css: { include: [/\.css\?raw$/] },
		coverage: {
			provider: 'v8',
			include: ['src/**/*.{ts,svelte}'],
			exclude: ['src/**/*.test.ts', 'src/lib/api/generated/**', 'src/lib/mocks/**'],
			// A summary only, with no threshold (plans/frontend-v1/proposal.md section 9).
			reporter: ['text-summary']
		},
		// Two projects. `*.svelte.test.ts` files render components in a real browser; every
		// other test file runs in node.
		projects: [
			{
				extends: true,
				test: {
					name: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					environment: 'node'
				}
			},
			{
				extends: true,
				test: {
					name: 'browser',
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					setupFiles: ['vitest-browser-svelte'],
					browser: {
						enabled: true,
						headless: true,
						provider: playwright(),
						instances: [{ browser: 'chromium' }]
					}
				}
			}
		]
	}
});
