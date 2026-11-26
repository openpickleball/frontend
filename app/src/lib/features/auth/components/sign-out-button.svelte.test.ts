import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { logout, signOutWarning } from '../services.js';
import SignOutButton from './sign-out-button.svelte';

// The service and the router have their own tests. Here they are stand-ins.
vi.mock('../services.js', () => ({ logout: vi.fn(), signOutWarning: vi.fn(() => null) }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
const mockedLogout = vi.mocked(logout);
const mockedWarning = vi.mocked(signOutWarning);

const WARNING =
	"2 matches haven't been sent yet. They're only on this device, and signing out deletes them.";

describe('SignOutButton', () => {
	beforeEach(() => {
		mockedLogout.mockReset();
		mockedWarning.mockReset();
		mockedWarning.mockReturnValue(null);
	});

	it('ignores a second click while signing out and keeps focus on the button', async () => {
		let finish: () => void = () => {};
		mockedLogout.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
		const screen = await render(SignOutButton);
		const button = screen.getByRole('button', { name: 'Sign out' }).element() as HTMLButtonElement;
		button.focus();
		button.click();
		const busy = screen.getByRole('button', { name: 'Sign out' });
		await expect.element(busy).toHaveAttribute('aria-disabled', 'true');
		await expect.element(busy).toHaveAttribute('aria-busy', 'true');
		button.click();
		expect(mockedLogout).toHaveBeenCalledOnce();
		expect(button.disabled).toBe(false);
		expect(document.activeElement).toBe(button);
		finish();
		await expect.element(busy).toHaveAttribute('aria-busy', 'false');
	});

	it('asks first when signing out would delete unsent matches, and can stay signed in', async () => {
		mockedWarning.mockReturnValue(WARNING);
		mockedLogout.mockResolvedValue();
		const screen = await render(SignOutButton);
		await screen.getByRole('button', { name: 'Sign out' }).click();

		const dialog = screen.getByRole('alertdialog');
		await expect
			.element(dialog.getByRole('heading', { name: 'Sign out and delete unsent matches?' }))
			.toBeVisible();
		await expect.element(dialog.getByText(WARNING)).toBeVisible();
		expect(mockedLogout).not.toHaveBeenCalled();

		await dialog.getByRole('button', { name: 'Stay signed in' }).click();
		await expect.element(screen.getByRole('alertdialog')).not.toBeInTheDocument();
		expect(mockedLogout).not.toHaveBeenCalled();
	});

	it('signs out once the player agrees to delete them', async () => {
		mockedWarning.mockReturnValue(WARNING);
		mockedLogout.mockResolvedValue();
		const screen = await render(SignOutButton);
		await screen.getByRole('button', { name: 'Sign out' }).click();
		await screen.getByRole('button', { name: 'Sign out and delete' }).click();
		await vi.waitFor(() => expect(mockedLogout).toHaveBeenCalledOnce());
	});
});
