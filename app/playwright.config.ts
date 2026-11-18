import { defineConfig, devices } from '@playwright/test';

// Set E2E_PORT to run e2e from two checkouts at the same time.
const PORT = Number(process.env.E2E_PORT ?? 4183);

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},
	projects: [
		// The required project: CI runs this one.
		{ name: 'Pixel 7', use: { ...devices['Pixel 7'] } },
		// Opt in with E2E_WEBKIT=1 (`pnpm e2e:webkit`). Needs `playwright install webkit`.
		...(process.env.E2E_WEBKIT ? [{ name: 'iPhone 15', use: { ...devices['iPhone 15'] } }] : [])
	],
	webServer: {
		// The production build, served as static files, like the deployed app will be.
		command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		env: { PUBLIC_API_MOCK: 'all' },
		// Never reuse a server: one from another checkout would test the wrong build.
		reuseExistingServer: false,
		timeout: 120_000
	}
});
