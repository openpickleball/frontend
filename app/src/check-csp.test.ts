import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkCsp } from '../scripts/check-csp.mjs';

// Fixture pages for the build check (`pnpm check:build`). Made-up markup, no real build.
const inline = 'console.log("boot")';
const hash = `'sha256-${createHash('sha256').update(inline).digest('base64')}'`;
const meta = (policy: string) => `<meta http-equiv="content-security-policy" content="${policy}">`;
const page = (head: string, body = `<script>${inline}</script>`) =>
	`<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const good = `default-src 'self'; script-src 'self' ${hash}; object-src 'none'`;

describe('checkCsp', () => {
	it('passes a page whose policy hashes its inline script', () => {
		expect(checkCsp(page(meta(good) + '<script src="/theme.js"></script>'))).toEqual([]);
	});

	it('fails a page with no policy', () => {
		expect(checkCsp(page(''))).toEqual(['index.html has no content-security-policy meta tag']);
	});

	it('fails a page with two policies', () => {
		expect(checkCsp(page(meta(good) + meta(good)))).toContain(
			'index.html has 2 content-security-policy meta tags, not 1'
		);
	});

	it('fails a page with a script before the policy', () => {
		expect(checkCsp(page('<script src="/theme.js"></script>' + meta(good)))).toContain(
			'a <script> comes before the content-security-policy meta tag'
		);
	});

	it('fails an inline script whose hash is not in script-src', () => {
		const problems = checkCsp(page(meta(good), `<script>${inline}</script><script>x()</script>`));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/^an inline <script> is not hashed in script-src: 'sha256-/);
	});

	it('fails a policy that allows inline or eval script', () => {
		const loose = `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' ${hash}`;
		expect(checkCsp(page(meta(loose)))).toEqual([
			"script-src allows 'unsafe-inline'",
			"script-src allows 'unsafe-eval'"
		]);
	});

	it('fails a policy with no script-src', () => {
		expect(checkCsp(page(meta("default-src 'self'"), ''))).toEqual([
			'the policy has no script-src'
		]);
	});
});
