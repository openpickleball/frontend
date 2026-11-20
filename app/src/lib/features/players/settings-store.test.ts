import { describe, expect, it, vi } from 'vitest';
import { AppError } from '#lib/api/index.js';
import { SettingsStore } from './settings-store.svelte.js';
import type { MySettings, MySettingsChange, Privacy } from './types.js';

const OPEN: Privacy = {
	match_history: 'signed_in',
	stats: 'signed_in',
	rating_history: 'signed_in',
	home_club: 'signed_in',
	city_region: 'signed_in'
};

const SAVED: MySettings = { displayName: 'Fern Mock', privacy: OPEN };

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
		held = {
			displayName: change.displayName ?? held.displayName,
			privacy: { ...held.privacy, ...change.privacy }
		};
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
		expect(store.privacy).toEqual(OPEN);
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

describe('SettingsStore.saveName', () => {
	async function ready(update: (change: MySettingsChange) => Promise<MySettings>) {
		const store = new SettingsStore({
			fetchMySettings: async () => SAVED,
			updateMySettings: update
		});
		await store.load();
		return store;
	}

	it('sends the trimmed name and keeps what the backend saved', async () => {
		const { update } = backend();
		const store = await ready(update);
		expect(await store.saveName('  Fern Quill ')).toEqual({ ok: true, value: 'Fern Quill' });
		expect(update).toHaveBeenCalledWith({ displayName: 'Fern Quill' });
		expect(store.displayName).toBe('Fern Quill');
	});

	it('does not send an empty name', async () => {
		const { update } = backend();
		const store = await ready(update);
		expect(await store.saveName('  ')).toEqual({ ok: false, message: 'Enter a display name.' });
		expect(update).not.toHaveBeenCalled();
	});

	it('does not send a name that has not changed', async () => {
		const { update } = backend();
		const store = await ready(update);
		expect(await store.saveName('Fern Mock ')).toEqual({ ok: true, value: 'Fern Mock' });
		expect(update).not.toHaveBeenCalled();
	});

	it("shows the backend's message for the name field", async () => {
		const store = await ready(async () => {
			throw appError('validation', 422, 'Please check the highlighted fields.', {
				display_name: ['Remove control or invalid characters.']
			});
		});
		expect(await store.saveName('Fern')).toEqual({
			ok: false,
			message: 'Remove control or invalid characters.'
		});
		expect(store.displayName).toBe('Fern Mock');
	});

	it("shows the error's own message for anything else", async () => {
		const store = await ready(async () => {
			throw appError('network', null, "We can't reach the server.");
		});
		expect(await store.saveName('Fern')).toEqual({
			ok: false,
			message: "We can't reach the server."
		});
	});
});

describe('SettingsStore.setVisibility', () => {
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
		expect(await store.setVisibility('match_history', 'private')).toBe(true);
		expect(update).toHaveBeenCalledWith({ privacy: { match_history: 'private' } });
		expect(store.privacy?.match_history).toBe('private');
		expect(held().privacy.match_history).toBe('private');
		expect(store.privacyError).toBeNull();
	});

	it('moves the switch at once, before the backend answers', async () => {
		const answer = deferred<MySettings>();
		const store = await ready(() => answer.promise);
		const saving = store.setVisibility('stats', 'private');
		expect(store.privacy?.stats).toBe('private');
		answer.resolve({ ...SAVED, privacy: { ...OPEN, stats: 'private' } });
		await saving;
		expect(store.privacy?.stats).toBe('private');
	});

	it('goes back and says why when the save fails', async () => {
		const store = await ready(async () => {
			throw appError('network', null, "We can't reach the server.");
		});
		expect(await store.setVisibility('home_club', 'private')).toBe(false);
		expect(store.privacy?.home_club).toBe('signed_in');
		expect(store.privacyError).toBe("We can't reach the server.");
	});

	it('keeps a newer change when an older answer arrives', async () => {
		const answers = [deferred<MySettings>(), deferred<MySettings>()];
		let call = 0;
		const store = await ready(() => answers[call++].promise);
		const first = store.setVisibility('stats', 'private');
		const second = store.setVisibility('home_club', 'private');
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
		await store.setVisibility('rating_history', 'private');
		expect(store.privacy?.rating_history).toBe('signed_in');
	});

	it('does nothing before the settings have loaded', async () => {
		const update = vi.fn();
		const store = new SettingsStore({
			fetchMySettings: async () => null,
			updateMySettings: update
		});
		expect(await store.setVisibility('stats', 'private')).toBe(false);
		expect(update).not.toHaveBeenCalled();
	});
});
