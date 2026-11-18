import { defineConfig, devices } from '@playwright/test';

// The PWA check (`pnpm e2e:pwa`). It needs a build with the mocks off, because the app's service
// worker never registers in the mock modes. With no backend the API calls fail, which is fine: the
// test only looks at the app shell. `pnpm e2e` stays on the mock build, on its own port.
// Both configs write the build to build/, so run them one after the other, not together.
const PORT = Number(process.env.E2E_PWA_PORT ?? 4184);

export default defineConfig({
	testDir: 'e2e-pwa',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI
		? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-pwa' }]]
		: 'list',
	use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
	projects: [{ name: 'Pixel 7', use: { ...devices['Pixel 7'] } }],
	webServer: {
		command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		env: { PUBLIC_API_MOCK: 'off' },
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
