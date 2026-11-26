import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkCsp } from '../scripts/check-csp.mjs';

// More pages the build check let through (review round 2). Made-up markup, no real build.
const inline = 'console.log("boot")';
const hash = `'sha256-${createHash('sha256').update(inline).digest('base64')}'`;
const meta = (policy: string) => `<meta http-equiv="content-security-policy" content="${policy}">`;
const good = `default-src 'self'; script-src 'self' ${hash}; object-src 'none'`;
const page = (head: string, body: string) =>
	`<!doctype html><html><head>${head}</head><body><script>${inline}</script>${body}</body></html>`;
const unhashed = /^an inline <script> is not hashed in script-src: 'sha256-/;

describe('checkCsp, script attributes and endings', () => {
	it.each([
		['a quote inside an unquoted value', '<script data-x=a"src=b>alert(1)</script>'],
		['an equals sign inside an unquoted value', '<script data-x=a=src>alert(1)</script>']
	])('treats a script with %s as inline', (_, script) => {
		const problems = checkCsp(page(meta(good), script));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(unhashed);
	});

	it.each([
		['an attribute', '<script>alert(1)</script x>'],
		['a slash', '<script>alert(1)</script/>']
	])('checks an inline script whose end tag has %s', (_, script) => {
		const problems = checkCsp(page(meta(good), script));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(unhashed);
	});

	it('fails a <script/src> before the policy', () => {
		const html = `<!doctype html><html><head><script/src="/x.js"></script>${meta(good)}</head><body><script>${inline}</script></body></html>`;
		expect(checkCsp(html)).toContain(
			'a <script> comes before the content-security-policy meta tag'
		);
	});
});

describe('checkCsp, comments', () => {
	it('fails a page whose only policy meta is inside a comment', () => {
		expect(checkCsp(page(`<!-- ${meta(good)} -->`, ''))).toEqual([
			'index.html has no content-security-policy meta tag'
		]);
	});

	it('ignores a commented-out second policy and a commented-out script', () => {
		const commented = `<!-- ${meta('script-src *')} <script>alert(1)</script> -->`;
		expect(checkCsp(page(meta(good) + commented, ''))).toEqual([]);
	});

	it('keeps "<!--" inside an inline script, so its hash is the real one', () => {
		const body = 'var a = "<!-- not a comment -->"';
		const own = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
		const policy = `script-src 'self' ${hash} ${own}`;
		expect(checkCsp(page(meta(policy), `<script>${body}</script>`))).toEqual([]);
	});
});

describe('checkCsp, more wide script sources', () => {
	it.each(['blob:', 'filesystem:', 'BLOB:'])('fails %s in script-src', (source) => {
		const wide = `script-src 'self' ${source} ${hash}`;
		expect(checkCsp(page(meta(wide), ''))).toEqual([`script-src allows ${source.toLowerCase()}`]);
	});

	it('fails any nonce in script-src', () => {
		const nonce = `script-src 'self' 'nonce-AbC123' ${hash}`;
		expect(checkCsp(page(meta(nonce), ''))).toEqual(["script-src allows a nonce: 'nonce-AbC123'"]);
	});
});
