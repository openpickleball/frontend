import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError } from '#lib/api/index.js';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import { myCode } from './my-code.svelte.js';
import ProfileSettings from './profile-settings.svelte';
import type { MySettings, MySettingsChange } from './types.js';

const SAVED: MySettings = {
	displayName: 'Fern Mock',
	privacy: {
		match_history: 'signed_in',
		stats: 'signed_in',
		rating_history: 'signed_in',
		home_club: 'private',
		city_region: 'signed_in',
		rating: 'signed_in'
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

const CODE = buildCode('player', '4RWN8TQ') as PlayerCode;

/** myCode as the gate leaves it for a player whose code is known. */
function readyCode() {
	myCode.code = CODE;
	myCode.status = 'ready';
}

// Most tests are about a player the gate has already found.
beforeEach(() => {
	myCode.reset();
	readyCode();
});

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

	it('shows current ratings as always shown, with no switch, when they are shown', async () => {
		const { screen } = await renderReady();
		const row = screen.getByTestId('privacy-rating-fixed');
		await expect.element(row).toBeVisible();
		const text = row.element().textContent ?? '';
		expect(text).toContain('Current ratings');
		expect(text).toContain('Signed-in players');
		expect(text).toContain("Always shown. They can't be hidden.");
		await expect
			.element(screen.getByRole('switch', { name: 'Current ratings' }))
			.not.toBeInTheDocument();
	});

	describe('current ratings kept private (joined at 13 to 17)', () => {
		const PRIVATE: MySettings = {
			...SAVED,
			privacy: { ...SAVED.privacy, rating: 'private' }
		};

		async function renderPrivate(updateMySettings: (c: MySettingsChange) => Promise<MySettings>) {
			return render(ProfileSettings, {
				deps: { fetchMySettings: async () => structuredClone(PRIVATE), updateMySettings }
			});
		}

		it('offers a switch that only shows them, and says it cannot be undone', async () => {
			const updateMySettings = vi.fn(async (change: MySettingsChange) => ({
				...PRIVATE,
				privacy: { ...PRIVATE.privacy, ...change.privacy }
			}));
			const screen = await renderPrivate(updateMySettings);
			const ratings = screen.getByRole('switch', { name: 'Current ratings' });
			await expect.element(ratings).not.toBeChecked();
			await expect.element(ratings).toHaveAccessibleDescription(/Only me/);
			await expect.element(ratings).toHaveAccessibleDescription(/can't be hidden again/);
			await ratings.click();
			expect(updateMySettings).toHaveBeenCalledWith({ privacy: { rating: 'signed_in' } });
			await expect.element(screen.getByTestId('privacy-rating-fixed')).toBeVisible();
		});

		it("shows the backend's refusal and keeps them private", async () => {
			const message = 'Current ratings can be shown to other players only from age 18.';
			const screen = await renderPrivate(
				vi.fn(async () => {
					throw new AppError({
						kind: 'validation',
						status: 422,
						code: 'validation_error',
						message: 'Please check the highlighted fields.',
						fields: { 'privacy.rating_visibility': [message] }
					});
				})
			);
			await screen.getByRole('switch', { name: 'Current ratings' }).click();
			await expect.element(screen.getByText(message)).toBeVisible();
			await expect
				.element(screen.getByRole('switch', { name: 'Current ratings' }))
				.not.toBeChecked();
		});
	});

	it('says the settings are not available yet when me/player has no player to read', async () => {
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

	it('loads the settings once, when the code is ready, not while it is found', async () => {
		const fetchMySettings = vi.fn<() => Promise<MySettings | null>>().mockResolvedValue(SAVED);
		myCode.reset();
		const screen = await render(ProfileSettings, { deps: { fetchMySettings } });
		myCode.status = 'loading';
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(fetchMySettings).not.toHaveBeenCalled();

		readyCode();
		await expect.element(screen.getByLabelText('Display name')).toHaveValue('Fern Mock');
		expect(fetchMySettings).toHaveBeenCalledTimes(1);
	});

	it('does not load again when the gate finds the same code again', async () => {
		const fetchMySettings = vi.fn<() => Promise<MySettings | null>>().mockResolvedValue(SAVED);
		const screen = await render(ProfileSettings, { deps: { fetchMySettings } });
		await expect.element(screen.getByLabelText('Display name')).toHaveValue('Fern Mock');
		myCode.status = 'loading';
		await new Promise((resolve) => setTimeout(resolve, 50));
		readyCode();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(fetchMySettings).toHaveBeenCalledTimes(1);
	});

	it.each(['idle', 'loading', 'needs-details', 'refused', 'unverified', 'error'] as const)(
		'never says the settings are not available while the status is %s',
		async (status) => {
			myCode.reset();
			myCode.status = status;
			const screen = await render(ProfileSettings, {
				deps: { fetchMySettings: async () => null }
			});
			await expect
				.element(screen.getByRole('heading', { level: 2, name: 'Your data' }))
				.toBeVisible();
			await new Promise((resolve) => setTimeout(resolve, 50));
			await expect.element(screen.getByText(/You can't change/)).not.toBeInTheDocument();
		}
	);
});
