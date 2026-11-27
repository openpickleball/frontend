/**
 * Review finding V1 (frontend#261): the loading and error fallbacks of the two-factor settings
 * had no space above them, so they touched the page title (or the organizer notice). A block after
 * a heading or a notice gets 8 (32px), as app/AGENTS.md sets out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../../../../routes/layout.css'; // eslint-disable-line boundaries/dependencies -- a layout test needs the app styles
import { AppError } from '#lib/api/index.js';
import { session } from '../session.svelte.js';
import { listAuthenticators } from '../two-factor.js';
import TwoFactorSettings from './two-factor-settings.svelte';

vi.mock('../two-factor.js', () => ({
	activateTotp: vi.fn(),
	deactivateTotp: vi.fn(),
	getRecoveryCodes: vi.fn(),
	getTotpSetup: vi.fn(),
	listAuthenticators: vi.fn(),
	regenerateRecoveryCodes: vi.fn()
}));

beforeEach(() => session.apply({ status: 'signed_in', email: 'player@example.com' }));

afterEach(() => {
	vi.resetAllMocks();
	session.reset();
});

/** How far below the top of the component `element` starts, in pixels. */
function gapAbove(container: HTMLElement, element: Element): number {
	return element.getBoundingClientRect().top - container.getBoundingClientRect().top;
}

describe('TwoFactorSettings fallbacks', () => {
	it('puts 32px above the loading state', async () => {
		vi.mocked(listAuthenticators).mockReturnValue(new Promise(() => {}));
		const screen = await render(TwoFactorSettings);
		const loading = screen.getByText('Loading your two-factor settings…');
		await expect.element(loading).toBeVisible();
		expect(gapAbove(screen.container, loading.element())).toBeGreaterThanOrEqual(32);
	});

	it('puts 32px above the error and its Try again', async () => {
		vi.mocked(listAuthenticators).mockRejectedValue(
			new AppError({ kind: 'network', status: null, code: 'x', message: 'x', fields: {} })
		);
		const screen = await render(TwoFactorSettings);
		const error = screen.getByText(/can't load your two-factor settings/);
		await expect.element(error).toBeVisible();
		expect(gapAbove(screen.container, error.element())).toBeGreaterThanOrEqual(32);
	});
});
