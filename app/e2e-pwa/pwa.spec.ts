import { expect, test, type Page } from '@playwright/test';

// Runs against a build with PUBLIC_API_MOCK=off (playwright.pwa.config.ts), the only build that
// registers the service worker. There is no backend, so the app shows its signed-out or error
// state. The checks look at the app shell only.

type Manifest = {
	name: string;
	short_name: string;
	start_url: string;
	display: string;
	icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

/** Wait until the service worker is active and controls this page. */
async function controlled(page: Page) {
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (navigator.serviceWorker.controller) return;
		await new Promise<void>((resolve) =>
			navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
		);
	});
}

test('the manifest is linked and valid', async ({ page, request }) => {
	await page.goto('/');
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBe('/manifest.webmanifest');

	const response = await request.get(href!);
	expect(response.ok()).toBe(true);
	const manifest = (await response.json()) as Manifest;
	expect(manifest.name).toBe('OPEN Pickleball');
	expect(manifest.short_name).toBe('OPEN');
	expect(manifest.start_url).toBe('/');
	expect(manifest.display).toBe('standalone');

	for (const icon of manifest.icons) {
		const res = await request.get(icon.src);
		expect(res.ok(), icon.src).toBe(true);
		expect(res.headers()['content-type']).toContain('image/png');
	}
	const sizes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`);
	expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));

	const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
	expect((await request.get(touch!)).ok()).toBe(true);
});

test('the worker registers and controls the page', async ({ page }) => {
	await page.goto('/');
	await controlled(page);
	const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
	expect(new URL(scope).pathname).toBe('/');
});

test('the app shell renders offline, on the home page and on a deep link', async ({
	page,
	context
}) => {
	await page.goto('/');
	await controlled(page);

	await context.setOffline(true);
	for (const path of ['/', '/matches']) {
		await page.goto(path);
		await expect(page).toHaveTitle(/OPEN Pickleball/);
		// The shell renders: the wordmark link and a heading, with no network at all.
		await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
	}
	await page.reload();
	await expect(page).toHaveTitle(/OPEN Pickleball/);
	await context.setOffline(false);
});

test('API calls are never cached', async ({ page }) => {
	await page.goto('/');
	await controlled(page);
	const cached = await page.evaluate(async () => {
		await fetch('/api/v1/ping').catch(() => {});
		await fetch('/_allauth/browser/v1/auth/session').catch(() => {});
		const urls: string[] = [];
		for (const name of await caches.keys()) {
			for (const req of await (await caches.open(name)).keys())
				urls.push(new URL(req.url).pathname);
		}
		return urls;
	});
	expect(cached.length).toBeGreaterThan(0);
	expect(cached.filter((p) => p.startsWith('/api/') || p.startsWith('/_allauth/'))).toEqual([]);
});
