import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { logout } from '../services.js';
import SignOutButton from './sign-out-button.svelte';

// The service and the router have their own tests. Here they are stand-ins.
vi.mock('../services.js', () => ({ logout: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
const mockedLogout = vi.mocked(logout);

describe('SignOutButton', () => {
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
});
