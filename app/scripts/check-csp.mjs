// Checks the content security policy in a built index.html (plans/app-csp-and-hosting). Used by
// scripts/check-build.mjs, and tested in src/check-csp.test.ts. Pure: it reads a string.
import { createHash } from 'node:crypto';

const META = /<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"\s*\/?>/gi;
const SCRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;

/** @param {string} text */
const sha256 = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/**
 * Problems with the policy in a built page, or an empty list when it is fine.
 * @param {string} html The page, as built.
 * @returns {string[]}
 */
export function checkCsp(html) {
	const metas = [...html.matchAll(META)];
	if (metas.length === 0) return ['index.html has no content-security-policy meta tag'];
	const problems = [];
	if (metas.length > 1) {
		problems.push(`index.html has ${metas.length} content-security-policy meta tags, not 1`);
	}

	const first = metas[0];
	const firstScript = html.search(/<script[\s>]/i);
	if (firstScript !== -1 && firstScript < (first.index ?? 0)) {
		problems.push('a <script> comes before the content-security-policy meta tag');
	}

	/** @type {Map<string, string[]>} */
	const directives = new Map();
	for (const part of first[1].split(';')) {
		const [name, ...sources] = part.trim().split(/\s+/);
		if (name) directives.set(name.toLowerCase(), sources);
	}
	const scriptSrc = directives.get('script-src');
	if (!scriptSrc) return [...problems, 'the policy has no script-src'];

	for (const keyword of ["'unsafe-inline'", "'unsafe-eval'"]) {
		if (scriptSrc.includes(keyword)) problems.push(`script-src allows ${keyword}`);
	}
	for (const [, attributes = '', body] of html.matchAll(SCRIPT)) {
		if (/\ssrc\s*=/i.test(attributes)) continue;
		const hash = sha256(body);
		if (!scriptSrc.includes(hash)) {
			problems.push(`an inline <script> is not hashed in script-src: ${hash}`);
		}
	}
	return problems;
}
