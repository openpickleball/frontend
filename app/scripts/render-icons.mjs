// Renders the PWA icons in static/icons/ from src/lib/assets/favicon.svg with headless Chromium.
// Run: pnpm icons   (needs `pnpm exec playwright install chromium`)
//
// - icon-192.png, icon-512.png: the favicon as is (rounded black tile, transparent corners).
// - icon-maskable-512.png: a full-bleed black square with the favicon at 80%. Android crops
//   maskable icons to a shape, and everything that matters must sit inside the central 80% circle.
// - apple-touch-icon.png: 180px, full-bleed black, favicon at 90%. iOS rounds the corners itself.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = await readFile(`${root}src/lib/assets/favicon.svg`, 'utf8');
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const icons = [
	{ file: 'icon-192.png', size: 192, scale: 1, bleed: false },
	{ file: 'icon-512.png', size: 512, scale: 1, bleed: false },
	{ file: 'icon-maskable-512.png', size: 512, scale: 0.8, bleed: true },
	{ file: 'apple-touch-icon.png', size: 180, scale: 0.9, bleed: true }
];

await mkdir(`${root}static/icons`, { recursive: true });
const browser = await chromium.launch();
try {
	for (const { file, size, scale, bleed } of icons) {
		const page = await browser.newPage({ viewport: { width: size, height: size } });
		const inner = Math.round(size * scale);
		await page.setContent(
			`<body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;` +
				`background:${bleed ? '#000' : 'transparent'}">` +
				`<img src="${dataUri}" width="${inner}" height="${inner}"></body>`
		);
		await page.locator('img').evaluate((img) => img.decode());
		await writeFile(`${root}static/icons/${file}`, await page.screenshot({ omitBackground: true }));
		await page.close();
	}
} finally {
	await browser.close();
}
