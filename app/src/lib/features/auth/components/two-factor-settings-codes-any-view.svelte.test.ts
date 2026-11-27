/**
 * Review finding V2 (frontend#261, a regression of finding A): after the move to sections, the
 * codes shown once and the "couldn't show" notice rendered only in the "on" view. When the page
 * could not be read again after turning on, the view was "error" and the codes were never shown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError } from '#lib/api/index.js';
import { reauthPrompt } from '../reauth.svelte.js';
import { session } from '../session.svelte.js';
import { activateTotp, getRecoveryCodes, getTotpSetup, listAuthenticators } from '../two-factor.js';
import TwoFactorSettings from './two-factor-settings.svelte';

vi.mock('../two-factor.js', () => ({
	activateTotp: vi.fn(),
	deactivateTotp: vi.fn(),
	getRecoveryCodes: vi.fn(),
	getTotpSetup: vi.fn(),
	listAuthenticators: vi.fn(),
	regenerateRecoveryCodes: vi.fn()
}));

const SECRET = 'MOCKSECRETAAAAAAAAAAAAAAAAAAAAAA';
const lost = () =>
	new AppError({ kind: 'network', status: null, code: 'network_error', message: 'x', fields: {} });

beforeEach(() => {
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	// Off at first; the read after turning on fails.
	vi.mocked(listAuthenticators)
		.mockResolvedValueOnce({ totp: null, recoveryCodes: null })
		.mockRejectedValue(lost());
	vi.mocked(getTotpSetup).mockResolvedValue({
		status: 'off',
		secret: SECRET,
		totpUrl: `otpauth://totp/OPEN?secret=${SECRET}`
	});
	vi.mocked(activateTotp).mockResolvedValue();
});

afterEach(() => {
	vi.resetAllMocks();
	reauthPrompt.settle(false);
	session.reset();
});

async function turnOn() {
	const screen = await render(TwoFactorSettings);
	await screen.getByLabelText('Code from your app').fill('123456');
	await screen.getByRole('button', { name: 'Turn on' }).click();
	return screen;
}

describe('TwoFactorSettings when the page cannot be read after turning on', () => {
	it('still shows the new recovery codes', async () => {
		vi.mocked(getRecoveryCodes).mockResolvedValue({
			codes: ['made0001', 'made0002'],
			total: 2,
			unused: 2
		});
		const screen = await turnOn();
		await expect.element(screen.getByText(/can't load your two-factor settings/)).toBeVisible();
		await expect.element(screen.getByText('made0001')).toBeVisible();
	});

	it('still says the codes could not be shown', async () => {
		vi.mocked(getRecoveryCodes).mockRejectedValue(lost());
		const screen = await turnOn();
		await expect.element(screen.getByText(/can't load your two-factor settings/)).toBeVisible();
		await expect.element(screen.getByText(/We couldn't show your recovery codes/)).toBeVisible();
	});
});
