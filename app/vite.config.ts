import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { playwright } from '@vitest/browser-playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { directives } from './src/csp.ts';

/**
 * Keeps the API mocks out of builds with `PUBLIC_API_MOCK=off` (frontend#57).
 *
 * - `__API_MOCKS__` is replaced at build time. It is `false` in an `off` build, so the
 *   `import('./lib/mocks/browser')` in `src/hooks.client.ts` is dead code and no mock chunk is
 *   emitted. In dev and in tests it is always `true`, and `PUBLIC_API_MOCK` decides.
 * - `mockServiceWorker.js` comes from the installed msw package, so it always matches the msw
 *   version. Dev serves it, and a mock build copies it into the client output. An `off` build
 *   has no such file.
 *
 * `scripts/check-build.mjs` (`pnpm check:build`) checks an `off` build for leftovers.
 */
function apiMocks(command: 'build' | 'serve', mode: string): Plugin {
	// The same rule as `src/env.ts`: anything but `missing` or `all` is `off`.
	const value = loadEnv(mode, process.cwd(), 'PUBLIC_').PUBLIC_API_MOCK;
	const on = command === 'serve' || value === 'missing' || value === 'all';
	const worker = () =>
		readFileSync(createRequire(import.meta.url).resolve('msw/mockServiceWorker.js'));

	return {
		name: 'open-api-mocks',
		config: () => ({ define: { __API_MOCKS__: JSON.stringify(on) } }),
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (!req.url?.split('?')[0].endsWith('/mockServiceWorker.js')) return next();
				res.setHeader('Content-Type', 'text/javascript');
				res.end(worker());
			});
		},
		generateBundle() {
			if (!on || this.environment.name !== 'client') return;
			this.emitFile({ type: 'asset', fileName: 'mockServiceWorker.js', source: worker() });
		}
	};
}

/**
 * The app version Profile shows (`src/lib/ui/app-version.ts`): `version` from package.json and
 * the short commit hash, as `__APP_VERSION__` and `__APP_COMMIT__`. The commit is `APP_COMMIT`
 * when the host sets it (a build without the git folder), otherwise git's `HEAD`, otherwise
 * empty, and Profile then shows the version alone.
 */
function appVersion(): Plugin {
	const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
	let commit = process.env.APP_COMMIT ?? '';
	if (!commit) {
		try {
			commit = execFileSync('git', ['rev-parse', 'HEAD'], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore']
			});
		} catch {
			commit = '';
		}
	}
	// Only a hex hash goes into the bundle, cut to the usual 7 characters.
	const short = /^[0-9a-f]{7,40}$/i.test(commit.trim()) ? commit.trim().slice(0, 7) : '';
	return {
		name: 'open-app-version',
		config: () => ({
			define: { __APP_VERSION__: JSON.stringify(version), __APP_COMMIT__: JSON.stringify(short) }
		})
	};
}

export default defineConfig(({ command, mode }) => ({
	plugins: [
		appVersion(),
		apiMocks(command, mode),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// SPA mode (plans/frontend-v1/proposal.md section 5): every route falls back to index.html,
			// and the root layout turns off server rendering.
			adapter: adapter({ fallback: 'index.html' }),

			// Off on purpose: MSW owns the service worker in the mock modes. src/hooks.client.ts
			// registers src/service-worker/index.ts itself, only when PUBLIC_API_MOCK is off.
			serviceWorker: { register: false },

			// Absolute asset URLs in every HTML response. The static fallback page already has them,
			// but `vite preview` renders the shell per route with relative ones (./_app on /, ../_app
			// on /account/login), and the worker caches one shell for all routes. The offline e2e
			// check fails without this.
			paths: { relative: false },

			// The Content Security Policy (src/csp.ts). In hash mode SvelteKit writes it into the
			// static shell as a meta tag, with a hash for its own inline script. A meta policy ignores
			// frame-ancestors, report-uri and sandbox, and App Platform cannot send headers for a
			// static site. See "Hosting on App Platform" in README.md.
			csp: { mode: 'hash', directives }
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
		// A future global msw/node setup file goes in the `node` project's `setupFiles`, not the
		// root, because the browser project inherits root settings via `extends: true`.
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
}));
