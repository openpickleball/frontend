import { describe, expect, it } from 'vitest';
import { SettingsStore } from './settings-store.svelte.js';
import type { MySettings, Privacy } from './types.js';

// The backend may handle two saves of different settings in either order, so each answer is
// the authority only for the setting it saved (finding F).

const OPEN: Privacy = {
	match_history: 'signed_in',
	stats: 'signed_in',
	rating_history: 'signed_in',
	home_club: 'signed_in',
	city_region: 'signed_in',
	rating: 'signed_in',
	name: 'full'
};

const SAVED: MySettings = { displayName: 'Tamsin Vale', nameLocked: false, privacy: OPEN };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

/** A loaded store whose saves answer in the order the test resolves them. */
async function overlapping() {
	const answers = [deferred<MySettings>(), deferred<MySettings>()];
	let call = 0;
	const store = new SettingsStore({
		fetchMySettings: async () => structuredClone(SAVED),
		updateMySettings: () => answers[call++].promise
	});
	await store.load();
	const name = store.setPrivacy('name', 'first_last_initial');
	const stats = store.setPrivacy('stats', 'private');
	// The backend handled the stats save first, so its answer still has the full name.
	const statsFirst = (): MySettings => ({
		...SAVED,
		privacy: { ...OPEN, stats: 'private' }
	});
	const nameAfter = (): MySettings => ({
		...SAVED,
		displayName: 'Tamsin V.',
		privacy: { ...OPEN, stats: 'private', name: 'first_last_initial' }
	});
	return { store, name, stats, answers, statsFirst, nameAfter };
}

describe('SettingsStore.setPrivacy when the backend handles two settings out of order', () => {
	it('applies the name answer that arrives last, with the name the backend built', async () => {
		const { store, name, stats, answers, statsFirst, nameAfter } = await overlapping();
		answers[1].resolve(statsFirst());
		expect(await stats).toBe(true);
		answers[0].resolve(nameAfter());
		expect(await name).toBe(true);
		expect(store.privacy).toMatchObject({ name: 'first_last_initial', stats: 'private' });
		expect(store.displayName).toBe('Tamsin V.');
	});

	it('keeps the name switch and the name while the name save is still in flight', async () => {
		const { store, name, stats, answers, statsFirst, nameAfter } = await overlapping();
		answers[1].resolve(statsFirst());
		expect(await stats).toBe(true);
		// The stats answer says nothing true about the name, which is still being saved.
		expect(store.privacy).toMatchObject({ name: 'first_last_initial', stats: 'private' });
		expect(store.displayName).toBe('Tamsin Vale');
		answers[0].resolve(nameAfter());
		expect(await name).toBe(true);
		expect(store.privacy?.name).toBe('first_last_initial');
		expect(store.displayName).toBe('Tamsin V.');
	});
});
