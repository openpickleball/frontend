import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
	readFileSync(new URL('../../static/manifest.webmanifest', import.meta.url), 'utf8')
) as { description: string };

describe('manifest.webmanifest', () => {
	it('describes only what the app does today', () => {
		expect(manifest.description).toBe('Record pickleball matches and confirm scores.');
		expect(manifest.description).not.toMatch(/look up|search|rating/i);
	});
});
