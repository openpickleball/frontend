import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkIndexCsp } from '../scripts/check-csp.mjs';

// How `pnpm check:build` reads index.html for the CSP check (scripts/check-build.mjs).
describe('checkIndexCsp', () => {
	it('reports a build with no index.html', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'check-build-'));
		expect(await checkIndexCsp(dir)).toEqual(['index.html is missing']);
	});

	it('lets an error in the check itself surface, not "index.html is missing"', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'check-build-'));
		await writeFile(join(dir, 'index.html'), '<!doctype html><html></html>');
		const failure = new Error('the check broke');
		const broken = () => {
			throw failure;
		};
		await expect(checkIndexCsp(dir, broken)).rejects.toBe(failure);
	});
});
