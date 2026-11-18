import { defineConfig, devices } from '@playwright/test';

// The live happy path (`pnpm e2e:live`). It runs against `pnpm dev` with the mocks off and the
// real backend on 127.0.0.1:8000, which Vite proxies. Local only: CI never runs it.
// Set E2E_LIVE_PORT to move it off 5174, for example to run two checkouts at once.
const PORT = Number(process.env.E2E_LIVE_PORT ?? 5174);

export default defineConfig({
	testDir: 'e2e-live',
	// One test, and it writes to the shared local database.
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'Pixel 7', use: { ...devices['Pixel 7'] } }],
	// Without the settings the test skips, so do not boot the dev server for nothing.
	webServer: !(
		process.env.LIVE_EMAIL &&
		process.env.LIVE_PASSWORD &&
		process.env.LIVE_OPPONENT_CODE
	)
		? undefined
		: {
				command: `pnpm dev --port ${PORT} --strictPort`,
				url: `http://localhost:${PORT}`,
				env: { PUBLIC_API_MOCK: 'off' },
				// Never reuse a server: one started with the mocks on would hide the real backend.
				reuseExistingServer: false,
				timeout: 120_000
			}
});
