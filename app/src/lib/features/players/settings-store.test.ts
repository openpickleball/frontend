import { describe, expect, it, vi } from 'vitest';
import { AppError } from '#lib/api/index.js';
import { SettingsStore } from './settings-store.svelte.js';
import type { MySettings, MySettingsChange, Privacy } from './types.js';

const OPEN: Privacy = {
	match_history: 'signed_in',
	stats: 'signed_in',
	rating_history: 'signed_in',
	home_club: 'signed_in',
	city_region: 'signed_in',
	rating: 'signed_in',
	name: 'full'
};

const SAVED: MySettings = { displayName: 'Fern Mock', nameLocked: false, privacy: OPEN };

function appError(
	kind: AppError['kind'],
	status: number | null,
	message = 'Something went wrong.',
	fields: Record<string, string[]> = {}
): AppError {
	return new AppError({ kind, status, code: 'x', message, fields });
}

/** A fake backend that holds settings and applies changes like `PATCH me/player`. */
function backend(start: MySettings = SAVED) {
	let held = structuredClone(start);
	const update = vi.fn(async (change: MySettingsChange): Promise<MySettings> => {
		const privacy = { ...held.privacy, ...change.privacy };
		// The backend builds the name from the names given at signup.
		const displayName = privacy.name === 'full' ? 'Fern Mock' : 'Fern M.';
		held = { ...held, displayName, privacy };
		return structuredClone(held);
	});
	return { update, held: () => held };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('SettingsStore.load', () => {
	it('is ready with the saved name and privacy settings', async () => {
		const store = new SettingsStore({ fetchMySettings: async () => SAVED });
		expect(store.status).toBe('idle');
		const loading = store.load();
		expect(store.status).toBe('loading');
		await loading;
		expect(store.status).toBe('ready');
		expect(store.displayName).toBe('Fern Mock');
		expect(store.nameLocked).toBe(false);
		expect(store.privacy).toEqual(OPEN);
	});

	it('keeps the lock the backend sends', async () => {
		const store = new SettingsStore({
			fetchMySettings: async () => ({
				displayName: 'Fern M.',
				nameLocked: true,
				privacy: { ...OPEN, name: 'first_last_initial' }
			})
		});
		await store.load();
		expect(store.nameLocked).toBe(true);
		expect(store.privacy?.name).toBe('first_last_initial');
	});

	it('is unavailable when the backend has no me/player', async () => {
		const store = new SettingsStore({ fetchMySettings: async () => null });
		await store.load();
		expect(store.status).toBe('unavailable');
		expect(store.privacy).toBeNull();
	});

	it('shows the error state when the backend cannot be reached, and loads again', async () => {
		const fetchMySettings = vi
			.fn<() => Promise<MySettings | null>>()
			.mockRejectedValueOnce(appError('network', null))
			.mockResolvedValueOnce(SAVED);
		const store = new SettingsStore({ fetchMySettings });
		await store.load();
		expect(store.status).toBe('error');
		await store.load();
		expect(store.status).toBe('ready');
	});

	it('drops a late answer from an earlier load', async () => {
		const first = deferred<MySettings | null>();
		const fetchMySettings = vi
			.fn<() => Promise<MySettings | null>>()
			.mockReturnValueOnce(first.promise)
			.mockResolvedValueOnce({ ...SAVED, displayName: 'Second' });
		const store = new SettingsStore({ fetchMySettings });
		const early = store.load();
		await store.load();
		first.resolve({ ...SAVED, displayName: 'First' });
		await early;
		expect(store.displayName).toBe('Second');
	});
});

describe('SettingsStore.setPrivacy', () => {
	async function ready(update: (change: MySettingsChange) => Promise<MySettings>) {
		const store = new SettingsStore({
			fetchMySettings: async () => SAVED,
			updateMySettings: update
		});
		await store.load();
		return store;
	}

	it('sends only the setting that changed', async () => {
		const { update, held } = backend();
		const store = await ready(update);
		expect(await store.setPrivacy('match_history', 'private')).toBe(true);
		expect(update).toHaveBeenCalledWith({ privacy: { match_history: 'private' } });
		expect(store.privacy?.match_history).toBe('private');
		expect(held().privacy.match_history).toBe('private');
		expect(store.privacyError).toBeNull();
	});

	it('moves the switch at once, before the backend answers', async () => {
		const answer = deferred<MySettings>();
		const store = await ready(() => answer.promise);
		const saving = store.setPrivacy('stats', 'private');
		expect(store.privacy?.stats).toBe('private');
		answer.resolve({ ...SAVED, privacy: { ...OPEN, stats: 'private' } });
		await saving;
		expect(store.privacy?.stats).toBe('private');
	});

	it('goes back and says why when the save fails', async () => {
		const store = await ready(async () => {
			throw appError('network', null, "We can't reach the server.");
		});
		expect(await store.setPrivacy('home_club', 'private')).toBe(false);
		expect(store.privacy?.home_club).toBe('signed_in');
		expect(store.privacyError).toBe("We can't reach the server.");
	});

	it('keeps a newer change when an older answer arrives', async () => {
		const answers = [deferred<MySettings>(), deferred<MySettings>()];
		let call = 0;
		const store = await ready(() => answers[call++].promise);
		const first = store.setPrivacy('stats', 'private');
		const second = store.setPrivacy('home_club', 'private');
		// The first answer does not know about home_club yet.
		answers[0].resolve({ ...SAVED, privacy: { ...OPEN, stats: 'private' } });
		await first;
		expect(store.privacy).toMatchObject({ stats: 'private', home_club: 'private' });
		answers[1].resolve({ ...SAVED, privacy: { ...OPEN, stats: 'private', home_club: 'private' } });
		await second;
		expect(store.privacy).toMatchObject({ stats: 'private', home_club: 'private' });
	});

	it('shows what the backend holds once nothing is in flight', async () => {
		// The backend refused part of the change and kept the setting as it was.
		const store = await ready(async () => SAVED);
		await store.setPrivacy('rating_history', 'private');
		expect(store.privacy?.rating_history).toBe('signed_in');
	});

	it('sends only the name format, and shows the name the backend built once it answers', async () => {
		const answer = deferred<MySettings>();
		const update = vi.fn(() => answer.promise);
		const store = await ready(update);
		const saving = store.setPrivacy('name', 'first_last_initial');
		expect(update).toHaveBeenCalledWith({ privacy: { name: 'first_last_initial' } });
		expect(store.privacy?.name).toBe('first_last_initial');
		// Never a guess: the old name stays until the backend answers.
		expect(store.displayName).toBe('Fern Mock');
		answer.resolve({
			...SAVED,
			displayName: 'Fern M.',
			privacy: { ...OPEN, name: 'first_last_initial' }
		});
		expect(await saving).toBe(true);
		expect(store.displayName).toBe('Fern M.');
	});

	it('turns the full name back on, with the name the backend built', async () => {
		const { update } = backend({
			...SAVED,
			displayName: 'Fern M.',
			privacy: { ...OPEN, name: 'first_last_initial' }
		});
		const store = await ready(update);
		expect(await store.setPrivacy('name', 'full')).toBe(true);
		expect(store.displayName).toBe('Fern Mock');
		expect(store.privacy?.name).toBe('full');
	});

	it("goes back and shows the backend's message when the full name is refused", async () => {
		const message = 'Your full last name can be shown only from age 18.';
		const store = new SettingsStore({
			fetchMySettings: async () => ({
				displayName: 'Fern M.',
				nameLocked: true,
				privacy: { ...OPEN, name: 'first_last_initial' }
			}),
			updateMySettings: async () => {
				throw appError('validation', 422, 'Please check the highlighted fields.', {
					'privacy.name_format': [message]
				});
			}
		});
		await store.load();
		expect(await store.setPrivacy('name', 'full')).toBe(false);
		expect(store.privacy?.name).toBe('first_last_initial');
		expect(store.displayName).toBe('Fern M.');
		expect(store.privacyError).toBe(message);
	});

	it('keeps the newer answer for the same setting when an older one arrives after it', async () => {
		const answers = [deferred<MySettings>(), deferred<MySettings>()];
		let call = 0;
		const store = await ready(() => answers[call++].promise);
		const on = store.setPrivacy('name', 'first_last_initial');
		const off = store.setPrivacy('name', 'full');
		answers[1].resolve({ ...SAVED, displayName: 'Fern Mock', privacy: { ...OPEN, name: 'full' } });
		expect(await off).toBe(true);
		answers[0].resolve({
			...SAVED,
			displayName: 'Fern M.',
			privacy: { ...OPEN, name: 'first_last_initial' }
		});
		// The older answer is stale: it is not applied, so the caller shows no name from it.
		expect(await on).toBe(false);
		expect(store.privacy?.name).toBe('full');
		expect(store.displayName).toBe('Fern Mock');
	});

	it('keeps the newer answer for another setting when an older one arrives after it', async () => {
		const answers = [deferred<MySettings>(), deferred<MySettings>()];
		let call = 0;
		const store = await ready(() => answers[call++].promise);
		const first = store.setPrivacy('stats', 'private');
		const second = store.setPrivacy('home_club', 'private');
		answers[1].resolve({ ...SAVED, privacy: { ...OPEN, stats: 'private', home_club: 'private' } });
		expect(await second).toBe(true);
		// The older answer does not know about home_club yet.
		answers[0].resolve({ ...SAVED, privacy: { ...OPEN, stats: 'private' } });
		expect(await first).toBe(true);
		expect(store.privacy).toMatchObject({ stats: 'private', home_club: 'private' });
	});

	it('does nothing before the settings have loaded', async () => {
		const update = vi.fn();
		const store = new SettingsStore({
			fetchMySettings: async () => null,
			updateMySettings: update
		});
		expect(await store.setPrivacy('stats', 'private')).toBe(false);
		expect(update).not.toHaveBeenCalled();
	});
});
