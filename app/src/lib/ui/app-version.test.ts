import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_COMMIT, APP_VERSION, versionLabel } from './app-version.js';

describe('the app version', () => {
	it('is the version in package.json, set at build time', () => {
		const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
		expect(APP_VERSION).toBe(version);
	});

	it('has a short commit hash, or none when the build could not tell', () => {
		expect(APP_COMMIT).toMatch(/^([0-9a-f]{7})?$/);
	});

	it('reads the version and the commit, or the version alone', () => {
		expect(versionLabel('0.0.1', 'abc1234')).toBe('0.0.1 (abc1234)');
		expect(versionLabel('0.0.1', '')).toBe('0.0.1');
	});
});
