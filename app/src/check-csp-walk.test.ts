import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkCsp } from '../scripts/check-csp.mjs';

// The check reads the page in one pass, token by token (scripts/check-csp.mjs). A tag written
// inside a script's text is text, not a tag. Made-up markup, no real build.
const sha = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
const meta = (policy: string) => `<meta http-equiv="content-security-policy" content="${policy}">`;

describe('checkCsp, tags inside script text', () => {
	it('does not count a policy meta written inside a script as a second policy', () => {
		const body = `const tag = '${meta('script-src *')}';`;
		const html = `<!doctype html><html><head>${meta(`script-src 'self' ${sha(body)}`)}</head><body><script>${body}</script></body></html>`;
		expect(checkCsp(html)).toEqual([]);
	});
});
