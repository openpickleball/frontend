/**
 * Review finding K (frontend#261): "Copied." stayed after new codes replaced the copied ones, so
 * it claimed codes were copied that never were.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RecoveryCodes from './recovery-codes.svelte';

afterEach(() => vi.restoreAllMocks());

describe('RecoveryCodes', () => {
	it('drops "Copied." when new codes replace the copied ones', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		const screen = await render(RecoveryCodes, { codes: ['made0001', 'made0002'] });
		await screen.getByRole('button', { name: 'Copy codes' }).click();
		await expect.element(screen.getByText('Copied.')).toBeVisible();
		await screen.rerender({ codes: ['made0003', 'made0004'] });
		await expect.element(screen.getByText('made0003')).toBeVisible();
		expect(screen.getByText('Copied.').query()).toBeNull();
	});
});
