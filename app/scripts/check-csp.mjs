// Checks the content security policy in a built index.html (plans/app-csp-and-hosting). Used by
// scripts/check-build.mjs, and tested in src/check-csp.test.ts. Pure: it reads a string.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// The tag SvelteKit writes: http-equiv first, double quotes. Only this form is parsed.
const META = /<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"\s*\/?>/gi;
// Any policy meta tag, in any attribute order and quoting. Counted, never parsed.
const ANY_META = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-security-policy\b[^>]*>/gi;
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
// One attribute: a name, then an optional value in double, single or no quotes.
const ATTRIBUTE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
// Sources that would let scripts in without a hash.
const WIDE = [
	"'unsafe-inline'",
	"'unsafe-eval'",
	"'strict-dynamic'",
	'*',
	'https:',
	'http:',
	'data:'
];

/** @param {string} text */
const sha256 = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/**
 * The attribute names in a tag's attribute text, lowercased. Text inside a value is not a name.
 * @param {string} attributes
 */
const attributeNames = (attributes) =>
	[...attributes.matchAll(ATTRIBUTE)].map((match) => match[1].toLowerCase());

/**
 * Problems with the policy in a built page, or an empty list when it is fine.
 * @param {string} html The page, as built.
 * @returns {string[]}
 */
export function checkCsp(html) {
	const metas = [...html.matchAll(META)];
	const any = [...html.matchAll(ANY_META)];
	if (any.length === 0 && metas.length === 0) {
		return ['index.html has no content-security-policy meta tag'];
	}
	const problems = [];
	const count = Math.max(any.length, metas.length);
	if (count > 1) problems.push(`index.html has ${count} content-security-policy meta tags, not 1`);
	if (metas.length < any.length)
		problems.push('a content-security-policy meta tag could not be read');
	if (metas.length === 0) return problems;

	const firstMeta = Math.min(...[...any, ...metas].map((match) => match.index ?? 0));
	const firstScript = html.search(/<script[\s>]/i);
	if (firstScript !== -1 && firstScript < firstMeta) {
		problems.push('a <script> comes before the content-security-policy meta tag');
	}

	// A browser uses the first of two directives with one name, so the first one is checked.
	/** @type {Map<string, string[]>} */
	const directives = new Map();
	for (const part of metas[0][1].split(';')) {
		const [name, ...sources] = part.trim().split(/\s+/);
		if (!name) continue;
		const key = name.toLowerCase();
		if (directives.has(key)) {
			if (key === 'script-src') problems.push('the policy has more than one script-src');
			continue;
		}
		directives.set(key, sources);
	}
	for (const name of ['script-src-elem', 'script-src-attr']) {
		if (directives.has(name)) problems.push(`the policy has ${name}`);
	}
	const scriptSrc = directives.get('script-src');
	if (!scriptSrc) return [...problems, 'the policy has no script-src'];

	// Keywords and schemes in any case. Hashes are base64, so only their prefix is lowercased.
	const sources = scriptSrc.map((source) =>
		/^'sha(256|384|512)-/i.test(source)
			? source.slice(0, 8).toLowerCase() + source.slice(8)
			: source.toLowerCase()
	);
	for (const wide of WIDE) {
		if (sources.includes(wide)) problems.push(`script-src allows ${wide}`);
	}
	for (const [, attributes = '', body] of html.matchAll(SCRIPT)) {
		if (attributeNames(attributes).includes('src')) continue;
		const hash = sha256(body);
		if (!sources.includes(hash)) {
			problems.push(`an inline <script> is not hashed in script-src: ${hash}`);
		}
	}
	return problems;
}

/**
 * Reads `index.html` in a build folder and checks its policy. Only a failed read becomes
 * "index.html is missing". An error in the check itself is thrown as it is.
 * @param {string} dir The build folder.
 * @param {(html: string) => string[]} [check] The check, `checkCsp` unless a test passes another.
 * @returns {Promise<string[]>}
 */
export async function checkIndexCsp(dir, check = checkCsp) {
	let html;
	try {
		html = await readFile(join(dir, 'index.html'), 'utf8');
	} catch {
		return ['index.html is missing'];
	}
	return check(html);
}
