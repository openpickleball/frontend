import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError, toAppError } from '#lib/api/index.js';
import { reauthPrompt } from '../reauth.svelte.js';
import { session } from '../session.svelte.js';
import {
	activateTotp,
	deactivateTotp,
	getRecoveryCodes,
	getTotpSetup,
	listAuthenticators,
	regenerateRecoveryCodes
} from '../two-factor.js';
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
const URL_ = `otpauth://totp/OPEN:player%40example.com?secret=${SECRET}&issuer=OPEN`;
const CODES = ['made0001', 'made0002', 'made0003'];

const off = () => {
	vi.mocked(listAuthenticators).mockResolvedValue({ totp: null, recoveryCodes: null });
	vi.mocked(getTotpSetup).mockResolvedValue({ status: 'off', secret: SECRET, totpUrl: URL_ });
};
const on = (unused = 8) => {
	vi.mocked(listAuthenticators).mockResolvedValue({
		totp: { createdAt: new Date('2026-10-01T12:00:00Z') },
		recoveryCodes: { total: 10, unused }
	});
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
});

afterEach(() => {
	vi.resetAllMocks();
	reauthPrompt.settle(false);
	session.reset();
});

describe('TwoFactorSettings with two-factor off', () => {
	it('shows a QR code drawn as inline SVG and the setup key as text', async () => {
		off();
		const screen = await render(TwoFactorSettings);
		const qr = screen.getByRole('img', { name: /QR code/ });
		await expect.element(qr).toBeVisible();
		expect(qr.element().tagName.toLowerCase()).toBe('svg');
		expect(qr.element().querySelector('path')?.getAttribute('d')).toMatch(/^M\d/);
		expect(qr.element().querySelector('[style]')).toBeNull();
		await expect.element(screen.getByText(SECRET)).toBeVisible();
	});

	it('turns on with a code, then shows the new recovery codes once with a Copy button', async () => {
		off();
		vi.mocked(activateTotp).mockResolvedValue();
		vi.mocked(getRecoveryCodes).mockResolvedValue({ codes: CODES, total: 3, unused: 3 });
		const screen = await render(TwoFactorSettings);
		await screen.getByLabelText('Code from your app').fill('123456');
		on(3);
		await screen.getByRole('button', { name: 'Turn on' }).click();
		expect(vi.mocked(activateTotp)).toHaveBeenCalledWith('123456');
		for (const code of CODES) await expect.element(screen.getByText(code)).toBeVisible();
		await expect.element(screen.getByText(/shown only once/)).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Copy codes' })).toBeVisible();
	});

	it('copies the codes, one per line', async () => {
		off();
		vi.mocked(activateTotp).mockResolvedValue();
		vi.mocked(getRecoveryCodes).mockResolvedValue({ codes: CODES, total: 3, unused: 3 });
		const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		const screen = await render(TwoFactorSettings);
		await screen.getByLabelText('Code from your app').fill('123456');
		on(3);
		await screen.getByRole('button', { name: 'Turn on' }).click();
		await screen.getByRole('button', { name: 'Copy codes' }).click();
		expect(write).toHaveBeenCalledWith(CODES.join('\n'));
	});

	it('shows a wrong code on the field', async () => {
		off();
		vi.mocked(activateTotp).mockRejectedValue(
			new AppError({
				kind: 'validation',
				status: 400,
				code: 'incorrect_code',
				message: 'Incorrect code.',
				fields: { code: ['Incorrect code.'] }
			})
		);
		const screen = await render(TwoFactorSettings);
		await screen.getByLabelText('Code from your app').fill('000000');
		await screen.getByRole('button', { name: 'Turn on' }).click();
		await expect.element(screen.getByText('Incorrect code.')).toBeVisible();
	});

	it('asks for a reauthentication, then sends the code again', async () => {
		off();
		vi.mocked(activateTotp).mockRejectedValueOnce(reauthError()).mockResolvedValueOnce();
		vi.mocked(getRecoveryCodes).mockResolvedValue({ codes: CODES, total: 3, unused: 3 });
		const screen = await render(TwoFactorSettings);
		await screen.getByLabelText('Code from your app').fill('123456');
		await screen.getByRole('button', { name: 'Turn on' }).click();
		await vi.waitFor(() => expect(reauthPrompt.request).not.toBeNull());
		on(3);
		reauthPrompt.settle(true);
		await expect.element(screen.getByText(CODES[0])).toBeVisible();
		expect(vi.mocked(activateTotp)).toHaveBeenCalledTimes(2);
	});

	it('changes nothing and shows no error after Cancel in the prompt', async () => {
		off();
		vi.mocked(activateTotp).mockRejectedValue(reauthError());
		const screen = await render(TwoFactorSettings);
		await screen.getByLabelText('Code from your app').fill('123456');
		await screen.getByRole('button', { name: 'Turn on' }).click();
		await vi.waitFor(() => expect(reauthPrompt.request).not.toBeNull());
		reauthPrompt.settle(false);
		await expect.element(screen.getByRole('button', { name: 'Turn on' })).toBeVisible();
		expect(screen.getByRole('alert').query()).toBeNull();
		expect(screen.getByText('Incorrect code.').query()).toBeNull();
	});
});

describe('TwoFactorSettings with two-factor on', () => {
	it('says it is on and how many recovery codes are unused', async () => {
		on(7);
		const screen = await render(TwoFactorSettings);
		await expect.element(screen.getByText(/Two-factor authentication is on/)).toBeVisible();
		await expect.element(screen.getByText('7 of 10 recovery codes unused.')).toBeVisible();
		expect(screen.getByRole('img', { name: /QR code/ }).query()).toBeNull();
	});

	it('makes new recovery codes and shows them', async () => {
		on();
		vi.mocked(regenerateRecoveryCodes).mockResolvedValue({ codes: CODES, total: 3, unused: 3 });
		const screen = await render(TwoFactorSettings);
		await screen.getByRole('button', { name: 'Make new recovery codes' }).click();
		await expect.element(screen.getByText(CODES[1])).toBeVisible();
	});

	it('turns off after a confirm that says other sessions end', async () => {
		on();
		vi.mocked(deactivateTotp).mockResolvedValue();
		const screen = await render(TwoFactorSettings);
		await screen.getByRole('button', { name: 'Turn off' }).click();
		await expect.element(screen.getByText(/signs you out on your other devices/)).toBeVisible();
		off();
		await screen.getByRole('button', { name: 'Turn off two-factor' }).click();
		await vi.waitFor(() => expect(vi.mocked(deactivateTotp)).toHaveBeenCalledOnce());
		await expect.element(screen.getByRole('button', { name: 'Turn on' })).toBeVisible();
	});
});

describe('TwoFactorSettings when it cannot load', () => {
	it('says so, with Try again', async () => {
		vi.mocked(listAuthenticators).mockRejectedValueOnce(
			new AppError({ kind: 'network', status: null, code: 'x', message: 'x', fields: {} })
		);
		const screen = await render(TwoFactorSettings);
		await expect.element(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
		off();
		await screen.getByRole('button', { name: 'Try again' }).click();
		await expect.element(screen.getByRole('button', { name: 'Turn on' })).toBeVisible();
	});
});
