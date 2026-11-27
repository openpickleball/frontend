/**
 * Review finding G, the code gates (frontend#261): for a 403 `mfa_required` the gates said
 * "We can't reach the server" or "Check your connection". They explain two-factor and link to it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { PlayerCode } from '#lib/domain/index.js';
import { myCode } from './my-code.svelte.js';
import OwnCodeGate from './own-code-gate.svelte';

const children = createRawSnippet((code: () => PlayerCode) => ({
	render: () => `<p>${code()}</p>`
}));

let load: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	myCode.reset();
	load = vi.spyOn(myCode, 'load').mockResolvedValue();
});

afterEach(() => load.mockRestore());

describe('OwnCodeGate when two-factor is needed', () => {
	it('explains two-factor and links to its settings, not a connection problem', async () => {
		myCode.status = 'mfa-required';
		await render(OwnCodeGate, { children, signedOut: 'x' });
		await expect.element(page.getByText(/This needs two-factor authentication/)).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Set up two-factor' }))
			.toHaveAttribute('href', '/profile/two-factor');
		expect(page.getByText(/can't reach the server|Check your connection/).query()).toBeNull();
	});
});
