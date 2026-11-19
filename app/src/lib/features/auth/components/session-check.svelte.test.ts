import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { session } from '../session.svelte.js';
import { bootstrap } from '../services.js';
import SessionCheck from './session-check.svelte';

// The service has its own tests against the mock API. Here it is a stand-in.
vi.mock('../services.js', () => ({ bootstrap: vi.fn() }));
const mockedBootstrap = vi.mocked(bootstrap);

afterEach(() => {
	mockedBootstrap.mockReset();
	session.reset();
});

describe('SessionCheck', () => {
	it('says the sign-in could not be checked while the session is unknown', async () => {
		const screen = await render(SessionCheck, { onsignedin: vi.fn() });
		await expect.element(screen.getByRole('alert')).toBeVisible();
		await expect.element(screen.getByText("We couldn't check your sign-in.")).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
	});

	it('shows nothing once the session is known', async () => {
		session.apply({ status: 'signed_out' });
		const screen = await render(SessionCheck, { onsignedin: vi.fn() });
		await expect
			.element(screen.getByText("We couldn't check your sign-in."))
			.not.toBeInTheDocument();
	});

	it('reads the session again, and moves on when the player turns out to be signed in', async () => {
		mockedBootstrap.mockImplementation(async () => {
			session.apply({ status: 'signed_in', email: 'player@example.com' });
		});
		const onsignedin = vi.fn();
		const screen = await render(SessionCheck, { onsignedin });
		await screen.getByRole('button', { name: 'Try again' }).click();

		await vi.waitFor(() => expect(onsignedin).toHaveBeenCalledOnce());
		expect(mockedBootstrap).toHaveBeenCalledOnce();
		await expect
			.element(screen.getByText("We couldn't check your sign-in."))
			.not.toBeInTheDocument();
	});

	it('goes away without moving on when the player is signed out', async () => {
		mockedBootstrap.mockImplementation(async () => session.apply({ status: 'signed_out' }));
		const onsignedin = vi.fn();
		const screen = await render(SessionCheck, { onsignedin });
		await screen.getByRole('button', { name: 'Try again' }).click();

		await expect
			.element(screen.getByText("We couldn't check your sign-in."))
			.not.toBeInTheDocument();
		expect(onsignedin).not.toHaveBeenCalled();
	});

	it('stays, and can be tried again, when the check fails again', async () => {
		mockedBootstrap.mockResolvedValue(undefined);
		const screen = await render(SessionCheck, { onsignedin: vi.fn() });
		await screen.getByRole('button', { name: 'Try again' }).click();
		await expect.element(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
		await screen.getByRole('button', { name: 'Try again' }).click();
		await vi.waitFor(() => expect(mockedBootstrap).toHaveBeenCalledTimes(2));
		await expect.element(screen.getByText("We couldn't check your sign-in.")).toBeVisible();
	});
});
