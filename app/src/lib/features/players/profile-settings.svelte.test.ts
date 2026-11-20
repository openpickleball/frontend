import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError } from '#lib/api/index.js';
import ProfileSettings from './profile-settings.svelte';
import type { MySettings, MySettingsChange } from './types.js';

const SAVED: MySettings = {
	displayName: 'Fern Mock',
	privacy: {
		match_history: 'signed_in',
		stats: 'signed_in',
		rating_history: 'signed_in',
		home_club: 'private',
		city_region: 'signed_in'
	}
};

/** A fake backend for `PATCH me/player`. */
function backend() {
	let held = structuredClone(SAVED);
	return vi.fn(async (change: MySettingsChange): Promise<MySettings> => {
		held = {
			displayName: change.displayName ?? held.displayName,
			privacy: { ...held.privacy, ...change.privacy }
		};
		return structuredClone(held);
	});
}

async function renderReady(updateMySettings = backend()) {
	const screen = await render(ProfileSettings, {
		deps: { fetchMySettings: async () => SAVED, updateMySettings }
	});
	return { screen, updateMySettings };
}

describe('ProfileSettings', () => {
	it('shows the name and one switch per privacy setting', async () => {
		const { screen } = await renderReady();
		await expect.element(screen.getByLabelText('Display name')).toHaveValue('Fern Mock');
		const matches = screen.getByRole('switch', { name: 'Match history' });
		await expect.element(matches).toBeChecked();
		await expect.element(matches).toHaveAccessibleDescription('Signed-in players');
		const club = screen.getByRole('switch', { name: 'Home club' });
		await expect.element(club).not.toBeChecked();
		await expect.element(club).toHaveAccessibleDescription('Only me');
		expect(screen.getByRole('switch').elements()).toHaveLength(5);
	});

	it('saves a new display name', async () => {
		const { screen, updateMySettings } = await renderReady();
		const field = screen.getByLabelText('Display name');
		await field.fill('  Fern Quill  ');
		await screen.getByRole('button', { name: 'Save name' }).click();
		await expect.element(screen.getByText('Name saved.')).toBeVisible();
		await expect.element(field).toHaveValue('Fern Quill');
		expect(updateMySettings).toHaveBeenCalledWith({ displayName: 'Fern Quill' });
	});

	it('ignores a second click on Save name while saving and keeps focus on it', async () => {
		let finish: (value: MySettings) => void = () => {};
		const updateMySettings = vi.fn(() => new Promise<MySettings>((resolve) => (finish = resolve)));
		const { screen } = await renderReady(updateMySettings);
		await screen.getByLabelText('Display name').fill('Fern Quill');
		const button = screen.getByRole('button', { name: 'Save name' }).element() as HTMLButtonElement;
		button.focus();
		button.click();
		const busy = screen.getByRole('button', { name: 'Save name' });
		await expect.element(busy).toHaveAttribute('aria-busy', 'true');
		await expect.element(busy).toHaveAttribute('aria-disabled', 'true');
		button.click();
		expect(updateMySettings).toHaveBeenCalledOnce();
		expect(button.disabled).toBe(false);
		expect(document.activeElement).toBe(button);
		finish({ ...SAVED, displayName: 'Fern Quill' });
		await expect.element(screen.getByText('Name saved.')).toBeVisible();
		expect(document.activeElement).toBe(button);
	});

	it('says what is wrong with an empty name and does not send it', async () => {
		const { screen, updateMySettings } = await renderReady();
		const field = screen.getByLabelText('Display name');
		await field.fill('');
		await screen.getByRole('button', { name: 'Save name' }).click();
		await expect.element(screen.getByText('Enter a display name.')).toBeVisible();
		await expect.element(field).toHaveAttribute('aria-invalid', 'true');
		await expect.element(field).toHaveFocus();
		expect(updateMySettings).not.toHaveBeenCalled();
	});

	it('changes who can see a detail', async () => {
		const { screen, updateMySettings } = await renderReady();
		const matches = screen.getByRole('switch', { name: 'Match history' });
		await matches.click();
		await expect.element(matches).not.toBeChecked();
		await expect.element(matches).toHaveAccessibleDescription('Only me');
		expect(updateMySettings).toHaveBeenCalledWith({ privacy: { match_history: 'private' } });
	});

	it('puts the switch back and says why when the change fails', async () => {
		const { screen } = await renderReady(
			vi.fn(async () => {
				throw new AppError({
					kind: 'network',
					status: null,
					code: 'network',
					message: "We can't reach the server. Check your connection and try again.",
					fields: {}
				});
			})
		);
		const stats = screen.getByRole('switch', { name: 'Stats' });
		await stats.click();
		await expect.element(screen.getByText(/We can't reach the server/)).toBeVisible();
		await expect.element(stats).toBeChecked();
	});

	it('says the settings are not available yet when the backend has no me/player', async () => {
		const screen = await render(ProfileSettings, { deps: { fetchMySettings: async () => null } });
		await expect
			.element(
				screen.getByText(/can't change your display name or privacy settings in the app yet/)
			)
			.toBeVisible();
		expect(screen.getByRole('switch').elements()).toHaveLength(0);
	});

	it('offers to try again when the settings could not load', async () => {
		const fetchMySettings = vi
			.fn<() => Promise<MySettings | null>>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(SAVED);
		const screen = await render(ProfileSettings, { deps: { fetchMySettings } });
		await screen.getByRole('button', { name: 'Try again' }).click();
		await expect.element(screen.getByLabelText('Display name')).toHaveValue('Fern Mock');
	});

	it('always says how to get a copy of your data', async () => {
		const screen = await render(ProfileSettings, { deps: { fetchMySettings: async () => null } });
		await expect
			.element(screen.getByRole('heading', { level: 2, name: 'Your data' }))
			.toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 'info@openpb.org' }))
			.toHaveAttribute('href', 'mailto:info@openpb.org');
	});
});
