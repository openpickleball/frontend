/**
 * Review finding A (frontend#261): after TOTP turned on, the codes were read outside
 * `withReauth`, and the page was read again only when that worked. The backend asks for a recent
 * reauthentication to read the codes, so near the 300 second limit (or on a lost connection) the
 * page stayed "off" with the QR code though TOTP was on, and showed "You're not signed in".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError, toAppError } from '#lib/api/index.js';
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
const ON = {
	totp: { createdAt: new Date('2026-11-26T12:00:00Z') },
	recoveryCodes: { total: 10, unused: 10 }
};

const reauthError = () =>
	toAppError(
		{
			status: 401,
			data: { flows: [{ id: 'reauthenticate' }], user: {}, methods: [] },
			meta: { is_authenticated: true }
		},
		new Response(null, { status: 401 })
	);

beforeEach(() => {
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	vi.mocked(listAuthenticators).mockResolvedValueOnce({ totp: null, recoveryCodes: null });
	vi.mocked(listAuthenticators).mockResolvedValue(ON);
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

describe('TwoFactorSettings right after turning on', () => {
	it('shows two-factor on, and offers new codes, when the codes cannot be read', async () => {
		vi.mocked(getRecoveryCodes).mockRejectedValue(
			new AppError({
				kind: 'network',
				status: null,
				code: 'network_error',
				message: 'x',
				fields: {}
			})
		);
		const screen = await turnOn();
		await expect.element(screen.getByText(/Two-factor authentication is on/)).toBeVisible();
		expect(screen.getByRole('button', { name: 'Turn on' }).query()).toBeNull();
		await expect.element(screen.getByText(/We couldn't show your recovery codes/)).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: 'Make new recovery codes' }))
			.toBeVisible();
		expect(screen.getByText("You're not signed in. Sign in, then try again.").query()).toBeNull();
	});

	it('asks for a reauthentication to read the codes, then shows them', async () => {
		vi.mocked(getRecoveryCodes)
			.mockRejectedValueOnce(reauthError())
			.mockResolvedValueOnce({ codes: ['made0001', 'made0002'], total: 2, unused: 2 });
		const screen = await turnOn();
		await vi.waitFor(() => expect(reauthPrompt.request).not.toBeNull());
		reauthPrompt.settle(true);
		await expect.element(screen.getByText('made0001')).toBeVisible();
		await expect.element(screen.getByText(/Two-factor authentication is on/)).toBeVisible();
	});
});
