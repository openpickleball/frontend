import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError } from '#lib/api/index.js';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import { myCode } from './my-code.svelte.js';
import VisibilitySettings from './visibility-settings.svelte';
import YourData from './your-data.svelte';
import type { MySettings, MySettingsChange } from './types.js';

const SAVED: MySettings = {
	displayName: 'Fern Mock',
	nameLocked: false,
	privacy: {
		match_history: 'signed_in',
		stats: 'signed_in',
		rating_history: 'signed_in',
		home_club: 'private',
		city_region: 'signed_in',
		rating: 'signed_in',
		name: 'full'
	}
};

const NAME_SWITCH = 'Show my last name as an initial';

/** A fake backend for `PATCH me/player`. */
function backend() {
	let held = structuredClone(SAVED);
	return vi.fn(async (change: MySettingsChange): Promise<MySettings> => {
		const privacy = { ...held.privacy, ...change.privacy };
		// The backend builds the name from the names given at signup.
		const displayName = privacy.name === 'full' ? 'Fern Mock' : 'Fern M.';
		held = { ...held, displayName, privacy };
		return structuredClone(held);
	});
}

async function renderReady(updateMySettings = backend()) {
	const screen = await render(VisibilitySettings, {
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

describe('VisibilitySettings', () => {
	it('shows one switch per privacy setting, the name first, and no name field', async () => {
		const { screen } = await renderReady();
		await expect.element(screen.getByRole('switch', { name: 'Stats' })).toBeVisible();
		await expect.element(screen.getByRole('textbox')).not.toBeInTheDocument();
		const switches = screen.getByRole('switch').elements();
		expect(switches[0]).toBe(screen.getByRole('switch', { name: NAME_SWITCH }).element());
		const matches = screen.getByRole('switch', { name: 'Match history' });
		await expect.element(matches).toBeChecked();
		// Match history says which matches are shown, which the Matches page used to say.
		await expect
			.element(matches)
			.toHaveAccessibleDescription(
				'Signed-in players Other signed-in players see your confirmed matches.'
			);
		const club = screen.getByRole('switch', { name: 'Home club' });
		await expect.element(club).not.toBeChecked();
		await expect.element(club).toHaveAccessibleDescription('Only me');
		expect(switches).toHaveLength(6);
	});

	it('shows the full name with the switch off, and the name other players see', async () => {
		const { screen } = await renderReady();
		const name = screen.getByRole('switch', { name: NAME_SWITCH });
		await expect.element(name).not.toBeChecked();
		await expect.element(name).toBeEnabled();
		await expect.element(name).toHaveAccessibleDescription('Shown as Fern Mock');
	});

	it('shows the last name as an initial, then in full again, with the name the backend built', async () => {
		const { screen, updateMySettings } = await renderReady();
		const name = screen.getByRole('switch', { name: NAME_SWITCH });
		await name.click();
		await expect.element(name).toBeChecked();
		expect(updateMySettings).toHaveBeenCalledWith({ privacy: { name: 'first_last_initial' } });
		await expect.element(name).toHaveAccessibleDescription('Shown as Fern M.');
		expect(myCode.displayName).toBe('Fern M.');

		await name.click();
		await expect.element(name).not.toBeChecked();
		expect(updateMySettings).toHaveBeenLastCalledWith({ privacy: { name: 'full' } });
		await expect.element(name).toHaveAccessibleDescription('Shown as Fern Mock');
		expect(myCode.displayName).toBe('Fern Mock');
	});

	it('keeps the old name until the backend answers, never a guess', async () => {
		let finish: (value: MySettings) => void = () => {};
		const updateMySettings = vi.fn(() => new Promise<MySettings>((resolve) => (finish = resolve)));
		const { screen } = await renderReady(updateMySettings);
		const name = screen.getByRole('switch', { name: NAME_SWITCH });
		await name.click();
		await expect.element(name).toBeChecked();
		await expect.element(name).toHaveAccessibleDescription('Shown as Fern Mock');
		finish({
			...SAVED,
			displayName: 'Fern M.',
			privacy: { ...SAVED.privacy, name: 'first_last_initial' }
		});
		await expect.element(name).toHaveAccessibleDescription('Shown as Fern M.');
	});

	it("puts the name switch back and shows the backend's message when the save fails", async () => {
		const message = 'Your full last name can be shown only from age 18.';
		const { screen } = await renderReady(
			vi.fn(async () => {
				throw new AppError({
					kind: 'validation',
					status: 422,
					code: 'validation_error',
					message: 'Please check the highlighted fields.',
					fields: { 'privacy.name_format': [message] }
				});
			})
		);
		const name = screen.getByRole('switch', { name: NAME_SWITCH });
		await name.click();
		await expect.element(screen.getByText(message)).toBeVisible();
		await expect.element(name).not.toBeChecked();
		await expect.element(name).toHaveAccessibleDescription('Shown as Fern Mock');
		expect(myCode.displayName).toBeNull();
	});

	it("never shows a late answer's name to the next account", async () => {
		let finish: (value: MySettings) => void = () => {};
		const updateMySettings = vi.fn(() => new Promise<MySettings>((resolve) => (finish = resolve)));
		const { screen } = await renderReady(updateMySettings);
		await screen.getByRole('switch', { name: NAME_SWITCH }).click();
		expect(updateMySettings).toHaveBeenCalledOnce();
		// The player leaves the page and signs out, and another account signs in, before the
		// answer arrives.
		screen.unmount();
		myCode.reset();
		myCode.code = buildCode('player', '9HJD3XK') as PlayerCode;
		myCode.displayName = 'Oren Quill';
		myCode.status = 'ready';
		finish({
			...SAVED,
			displayName: 'Fern M.',
			privacy: { ...SAVED.privacy, name: 'first_last_initial' }
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(myCode.displayName).toBe('Oren Quill');
	});

	it('shows the name switch on and locked for a player aged 13 to 17, with why', async () => {
		const screen = await render(VisibilitySettings, {
			deps: {
				fetchMySettings: async () => ({
					...SAVED,
					displayName: 'Fern M.',
					nameLocked: true,
					privacy: { ...SAVED.privacy, name: 'first_last_initial' }
				}),
				updateMySettings: backend()
			}
		});
		const name = screen.getByRole('switch', { name: NAME_SWITCH });
		await expect.element(name).toBeChecked();
		await expect.element(name).toBeDisabled();
		await expect
			.element(name)
			.toHaveAccessibleDescription('Shown as Fern M. This stays on until you turn 18.');
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
			return render(VisibilitySettings, {
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
		const screen = await render(VisibilitySettings, {
			deps: { fetchMySettings: async () => null }
		});
		await expect
			.element(screen.getByText(/can't change your privacy settings in the app yet/))
			.toBeVisible();
		expect(screen.getByRole('switch').elements()).toHaveLength(0);
	});

	it('offers to try again when the settings could not load', async () => {
		const fetchMySettings = vi
			.fn<() => Promise<MySettings | null>>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(SAVED);
		const screen = await render(VisibilitySettings, { deps: { fetchMySettings } });
		await screen.getByRole('button', { name: 'Try again' }).click();
		await expect.element(screen.getByRole('switch', { name: 'Stats' })).toBeVisible();
	});

	it('always says how to get a copy of your data', async () => {
		const screen = await render(YourData);
		await expect.element(screen.getByText(/You can always get a copy of your data/)).toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 'info@openpb.org' }))
			.toHaveAttribute('href', 'mailto:info@openpb.org');
	});

	it('loads the settings once, when the code is ready, not while it is found', async () => {
		const fetchMySettings = vi.fn<() => Promise<MySettings | null>>().mockResolvedValue(SAVED);
		myCode.reset();
		const screen = await render(VisibilitySettings, { deps: { fetchMySettings } });
		myCode.status = 'loading';
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(fetchMySettings).not.toHaveBeenCalled();

		readyCode();
		await expect.element(screen.getByRole('switch', { name: 'Stats' })).toBeVisible();
		expect(fetchMySettings).toHaveBeenCalledTimes(1);
	});

	it('does not load again when the gate finds the same code again', async () => {
		const fetchMySettings = vi.fn<() => Promise<MySettings | null>>().mockResolvedValue(SAVED);
		const screen = await render(VisibilitySettings, { deps: { fetchMySettings } });
		await expect.element(screen.getByRole('switch', { name: 'Stats' })).toBeVisible();
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
			const screen = await render(VisibilitySettings, {
				deps: { fetchMySettings: async () => null }
			});
			await new Promise((resolve) => setTimeout(resolve, 50));
			await expect.element(screen.getByText(/You can't change/)).not.toBeInTheDocument();
			await expect.element(screen.getByTestId('settings')).not.toBeInTheDocument();
		}
	);
});
