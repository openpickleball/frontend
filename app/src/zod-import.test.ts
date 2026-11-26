import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

// Zod must run jitless, or its eval probe breaks the content security policy (src/csp.ts). Only
// src/lib/domain/zod.ts sets that, so it is the only file that may import 'zod' for values.
// These cases lint snippets with the real eslint.config.js, as if they lived at `file`.
const appRoot = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const eslint = new ESLint({ cwd: appRoot });

async function zodErrors(file: string, code: string): Promise<string[]> {
	const [result] = await eslint.lintText(code, { filePath: `${appRoot}/${file}` });
	return result.messages.filter((m) => m.ruleId === 'no-restricted-imports').map((m) => m.message);
}

describe("imports of 'zod'", () => {
	it('rejects a direct import outside the zod module, and says where to import from', async () => {
		const errors = await zodErrors(
			'src/lib/domain/schemas.ts',
			"import { z } from 'zod'; export const s = z.string();"
		);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('src/lib/domain/zod.ts');
	});

	it('rejects a subpath import too', async () => {
		const errors = await zodErrors(
			'src/lib/features/places/example.ts',
			"import { z } from 'zod/v4'; export const s = z.string();"
		);
		expect(errors).toHaveLength(1);
	});

	it('lets the zod module import it', async () => {
		const errors = await zodErrors(
			'src/lib/domain/zod.ts',
			"import { z } from 'zod'; z.config({ jitless: true }); export { z };"
		);
		expect(errors).toEqual([]);
	});

	it('allows a type-only import, which runs no Zod code', async () => {
		const errors = await zodErrors(
			'src/lib/domain/schemas.test.ts',
			"import type { z } from 'zod'; export type S = z.ZodString;"
		);
		expect(errors).toEqual([]);
	});
});
