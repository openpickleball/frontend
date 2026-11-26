import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

// More cases for the one-module rule for 'zod' (review round 2): dynamic imports and the other
// module extensions. Snippets are linted with the real eslint.config.js, as if they lived at `file`.
const appRoot = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const eslint = new ESLint({ cwd: appRoot });

async function zodErrors(file: string, code: string): Promise<string[]> {
	const [result] = await eslint.lintText(code, { filePath: `${appRoot}/${file}` });
	return result.messages
		.filter((m) => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-syntax')
		.map((m) => m.message);
}

describe("dynamic and other imports of 'zod'", () => {
	it.each(["'zod'", "'zod/v4'", '`zod`'])(
		'rejects import(%s) outside the zod module',
		async (source) => {
			const errors = await zodErrors(
				'src/lib/features/places/example.ts',
				`export const load = async () => (await import(${source})).z;`
			);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toContain('src/lib/domain/zod.ts');
		}
	);

	it('leaves dynamic imports of other packages alone', async () => {
		const errors = await zodErrors(
			'src/lib/features/places/example.ts',
			"export const load = async () => (await import('zodiac')).x;"
		);
		expect(errors).toEqual([]);
	});

	it.each(['mts', 'mjs', 'cts'])('rejects a static import in a .%s file', async (extension) => {
		const errors = await zodErrors(
			`src/lib/features/places/example.${extension}`,
			"import { z } from 'zod'; export const s = z.string();"
		);
		expect(errors).toHaveLength(1);
	});

	it('lets the zod module import it dynamically', async () => {
		const errors = await zodErrors(
			'src/lib/domain/zod.ts',
			"export const load = async () => (await import('zod')).z;"
		);
		expect(errors).toEqual([]);
	});
});
