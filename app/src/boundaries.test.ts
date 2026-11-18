import { describe, expect, it } from 'vitest';
import { ESLint, type Linter } from 'eslint';
import realConfig from '../eslint.config.js';

// Proves the import rules in eslint.config.js (plans/frontend-v1/proposal.md section 3) catch what
// they should. The rules classify files by their path, so each case lints a snippet as if it lived
// at `file`, inside a small fixture tree that has the same folders as src/. The element patterns
// from the real config are moved under that tree, and everything else is used as it is.
// The app folder, without a trailing slash. This file is src/boundaries.test.ts.
const appRoot = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const fixturePrefix = 'src/__fixtures__/boundaries';
const fixtureRoot = `${appRoot}/${fixturePrefix}`;

const config = (realConfig as Record<string, unknown>[]).map((entry) => {
	const settings = entry.settings as Record<string, unknown> | undefined;
	const elements = settings?.['boundaries/elements'] as { pattern: string }[] | undefined;
	if (!settings || !elements) return entry;
	return {
		...entry,
		settings: {
			...settings,
			'boundaries/elements': elements.map((e) => ({
				...e,
				pattern: `${fixturePrefix}/${e.pattern}`
			}))
		}
	};
});

const eslint = new ESLint({
	cwd: appRoot,
	overrideConfigFile: true,
	overrideConfig: config as Linter.Config[]
});

/** The boundary violations for `code`, written as if it were the file `file` (under src/). */
async function violations(file: string, code: string): Promise<string[]> {
	const [result] = await eslint.lintText(code, { filePath: `${fixtureRoot}/${file}` });
	return result.messages
		.filter((m) => m.ruleId === 'boundaries/dependencies')
		.map((m) => m.message);
}

/** An import of `target` (a path under src/) written relative to `file`. */
function importOf(file: string, target: string): string {
	const up = '../'.repeat(file.split('/').length - 2);
	return `import { x } from '${up}${target}'; export { x };`;
}

const ui = 'lib/ui/utils.js';
const api = 'lib/api/client.js';
const domain = 'lib/domain/code.js';
const authIndex = 'lib/features/auth/index.js';
const authInside = 'lib/features/auth/session.js';

async function count(file: string, target: string): Promise<number> {
	return (await violations(file, importOf(file, target))).length;
}

describe('import boundaries', () => {
	it('lets ui import ui, and nothing else in lib', async () => {
		expect(await count('src/lib/ui/a.ts', ui)).toBe(0);
		expect(await count('src/lib/ui/a.ts', api)).toBe(1);
		expect(await count('src/lib/ui/a.ts', domain)).toBe(1);
	});

	it('keeps api to api only', async () => {
		expect(await count('src/lib/api/a.ts', api)).toBe(0);
		expect(await count('src/lib/api/a.ts', ui)).toBe(1);
		expect(await count('src/lib/api/a.ts', domain)).toBe(1);
	});

	it('lets domain import only types from api/generated', async () => {
		const file = 'src/lib/domain/a.ts';
		const typesOnly = "import type { G } from '../api/generated/open.js'; export type T = G;";
		expect(await violations(file, typesOnly)).toEqual([]);
		expect(await count(file, domain)).toBe(0);
		expect(await count(file, api)).toBe(1);
		expect(await count(file, ui)).toBe(1);
	});

	it('lets a feature use api, domain, ui and its own files', async () => {
		const file = 'src/lib/features/auth/a.ts';
		expect(await count(file, api)).toBe(0);
		expect(await count(file, domain)).toBe(0);
		expect(await count(file, ui)).toBe(0);
		expect(await count(file, authInside)).toBe(0);
	});

	it('lets a feature reach another feature only through its index.ts', async () => {
		const file = 'src/lib/features/matches/a.ts';
		expect(await count(file, authIndex)).toBe(0);
		expect(await count(file, authInside)).toBe(1);
	});

	it('lets mocks use api and domain, not ui', async () => {
		expect(await count('src/lib/mocks/a.ts', api)).toBe(0);
		expect(await count('src/lib/mocks/a.ts', domain)).toBe(0);
		expect(await count('src/lib/mocks/a.ts', ui)).toBe(1);
	});

	it('lets routes use feature index files, domain and ui, and never api', async () => {
		const file = 'src/routes/a.ts';
		expect(await count(file, authIndex)).toBe(0);
		expect(await count(file, domain)).toBe(0);
		expect(await count(file, ui)).toBe(0);
		expect(await count(file, authInside)).toBe(1);
		expect(await count(file, api)).toBe(1);
	});

	it('resolves the #lib alias, so real imports are checked too', async () => {
		// The alias comes from package.json "imports", so it needs the app's own project root.
		const real = new ESLint({ cwd: appRoot });
		const [result] = await real.lintText("import { cn } from '#lib/ui/utils.js'; export { cn };", {
			filePath: `${appRoot}/src/lib/domain/a.ts`
		});
		const rules = result.messages.map((m) => m.ruleId);
		expect(rules).toEqual(['boundaries/dependencies']);
	});
});
