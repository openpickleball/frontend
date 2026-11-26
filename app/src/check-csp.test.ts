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

// Pages the first version of the check let through (review round 1, C7).
describe('checkCsp, strict', () => {
	const unread = 'a content-security-policy meta tag could not be read';

	it('fails a policy meta with content before http-equiv', () => {
		const tag = `<meta content="${good}" http-equiv="content-security-policy">`;
		expect(checkCsp(page(tag))).toContain(unread);
	});

	it('fails a policy meta with single quotes', () => {
		const tag = `<meta http-equiv='content-security-policy' content="${good}">`;
		expect(checkCsp(page(tag))).toContain(unread);
	});

	it('fails a policy meta with no quotes on http-equiv', () => {
		const tag = `<meta http-equiv=content-security-policy content="${good}">`;
		expect(checkCsp(page(tag))).toContain(unread);
	});

	it('fails a second policy meta that the strict pattern cannot read', () => {
		const odd = `<META CONTENT="script-src *" HTTP-EQUIV="Content-Security-Policy">`;
		expect(checkCsp(page(meta(good) + odd))).toEqual(
			expect.arrayContaining(['index.html has 2 content-security-policy meta tags, not 1'])
		);
	});

	it('fails keywords in any case', () => {
		const loose = `default-src 'self'; script-src 'self' 'UNSAFE-INLINE' 'Unsafe-Eval' ${hash}`;
		expect(checkCsp(page(meta(loose)))).toEqual([
			"script-src allows 'unsafe-inline'",
			"script-src allows 'unsafe-eval'"
		]);
	});

	it('fails a duplicate script-src', () => {
		const twice = `script-src 'self' ${hash}; script-src *`;
		expect(checkCsp(page(meta(twice)))).toContain('the policy has more than one script-src');
	});

	it('fails script-src-elem and script-src-attr', () => {
		const elem = `script-src 'self' ${hash}; script-src-elem 'self'`;
		const attr = `script-src 'self' ${hash}; Script-Src-Attr 'unsafe-inline'`;
		expect(checkCsp(page(meta(elem)))).toContain('the policy has script-src-elem');
		expect(checkCsp(page(meta(attr)))).toContain('the policy has script-src-attr');
	});

	it.each(['*', 'https:', 'http:', 'data:', 'HTTPS:', "'strict-dynamic'", "'STRICT-DYNAMIC'"])(
		'fails %s in script-src',
		(source) => {
			const wide = `script-src 'self' ${source} ${hash}`;
			expect(checkCsp(page(meta(wide)))).toEqual([`script-src allows ${source.toLowerCase()}`]);
		}
	);

	it('treats a script whose only "src=" is inside another attribute as inline', () => {
		const sneaky = `<script data-note=" src=/x.js">alert(1)</script>`;
		const problems = checkCsp(page(meta(good), `<script>${inline}</script>${sneaky}`));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/^an inline <script> is not hashed in script-src: 'sha256-/);
	});

	it('checks an inline script closed with whitespace before >', () => {
		const problems = checkCsp(page(meta(good), `<script>${inline}</script><script>x()</script >`));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/^an inline <script> is not hashed in script-src: 'sha256-/);
	});
});
