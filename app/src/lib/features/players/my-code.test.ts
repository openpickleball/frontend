import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '#lib/api/index.js';
import { buildCode, parsePlayerCode, type PlayerCode } from '#lib/domain/index.js';
import { createMyCode, type MyCode, type MyCodeDeps } from './my-code.svelte.js';
import type { CreateMyPlayerResult, PlayerCreateIn } from './services.js';
import { createCodeStore, storageKey, type CodeStorage } from './storage.js';
import type { MyPlayer } from './types.js';

const CODE_A = buildCode('player', '4RWN8TQ') as PlayerCode;
const CODE_B = buildCode('player', '9HJD3XK') as PlayerCode;

function memoryStorage(): CodeStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => void data.set(key, value),
		removeItem: (key) => void data.delete(key)
	};
}

function appError(kind: AppError['kind'], status: number | null): AppError {
	return new AppError({ kind, status, code: 'x', message: 'x', fields: {} });
}

const SERVER_PLAYER: MyPlayer = { code: CODE_A, displayName: 'Sample Player' };

describe('myCode.rename', () => {
	it('shows a saved display name for a code from the server', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => SERVER_PLAYER,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load();
		mine.rename('Fern Quill');
		expect(mine.displayName).toBe('Fern Quill');
	});

	it('leaves a code entered on this device without a name', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => 'unavailable' as const,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load();
		mine.save(CODE_B);
		mine.rename('Fern Quill');
		expect(mine.displayName).toBeNull();
	});
});

describe('myCode with me/player available', () => {
	it('uses the server code and never asks for entry', async () => {
		const storage = memoryStorage();
		const mine = createMyCode({
			fetchMyPlayer: async () => SERVER_PLAYER,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => storage)
		});
		await mine.load();
		expect(mine.status).toBe('ready');
		expect(mine.code).toBe(CODE_A);
		expect(mine.source).toBe('server');
		expect(mine.displayName).toBe('Sample Player');
		expect(mine.prompting).toBe(false);
		expect(mine.canChange).toBe(false);
	});

	it('prefers the server over a code saved on the device', async () => {
		const storage = memoryStorage();
		const store = createCodeStore(() => storage);
		store.write('a@example.com', CODE_B);
		const mine = createMyCode({
			fetchMyPlayer: async () => SERVER_PLAYER,
			accountEmail: async () => 'a@example.com',
			store
		});
		await mine.load();
		expect(mine.code).toBe(CODE_A);
	});
});

describe('myCode without me/player', () => {
	let storage: ReturnType<typeof memoryStorage>;
	let email: string | null;
	let mine: MyCode;

	beforeEach(() => {
		storage = memoryStorage();
		email = 'a@example.com';
		mine = createMyCode({
			fetchMyPlayer: async () => 'unavailable' as const,
			accountEmail: async () => email,
			store: createCodeStore(() => storage)
		});
	});

	it('asks for entry when nothing is saved', async () => {
		await mine.load();
		expect(mine.status).toBe('needs-entry');
		expect(mine.prompting).toBe(true);
		expect(mine.code).toBeNull();
	});

	it('saves a typed code, fixing its format, and remembers it', async () => {
		await mine.load();
		const result = mine.save('p 4rwn8tq3');
		expect(result).toEqual({ ok: true, code: CODE_A });
		expect(mine.status).toBe('ready');
		expect(mine.source).toBe('device');
		expect(storage.data.get(storageKey('a@example.com'))).toBe(CODE_A);

		// A later visit finds it without asking.
		const later = createMyCode({
			fetchMyPlayer: async () => 'unavailable' as const,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => storage)
		});
		await later.load();
		expect(later.status).toBe('ready');
		expect(later.code).toBe(CODE_A);
	});

	it('refuses a bad code and saves nothing', async () => {
		await mine.load();
		const result = mine.save('P-4RWN-8TQ2');
		expect(result.ok).toBe(false);
		expect(mine.status).toBe('needs-entry');
		expect(storage.data.size).toBe(0);
	});

	it('keeps each account on a shared device apart', async () => {
		await mine.load();
		mine.save(CODE_A);

		email = 'B@Example.com';
		const other = createMyCode({
			fetchMyPlayer: async () => 'unavailable' as const,
			accountEmail: async () => email,
			store: createCodeStore(() => storage)
		});
		await other.load();
		expect(other.status).toBe('needs-entry');
		other.save(CODE_B);

		await mine.load('a@example.com');
		expect(mine.code).toBe(CODE_A);
		// The key ignores case and spaces in the email.
		expect(storageKey(' b@example.COM ')).toBe(storageKey('b@example.com'));
		await other.load();
		expect(other.code).toBe(CODE_B);
	});

	it('takes the email passed to load() before asking the account source', async () => {
		email = 'wrong@example.com';
		await mine.load('right@example.com');
		mine.save(CODE_A);
		expect(storage.data.has(storageKey('right@example.com'))).toBe(true);
		expect(storage.data.has(storageKey('wrong@example.com'))).toBe(false);
	});

	it('lets the player change a device code, and cancel', async () => {
		await mine.load();
		mine.save(CODE_A);
		mine.change();
		expect(mine.prompting).toBe(true);
		mine.cancel();
		expect(mine.prompting).toBe(false);
		expect(mine.code).toBe(CODE_A);
		mine.change();
		mine.save(CODE_B);
		expect(mine.code).toBe(CODE_B);
		expect(mine.prompting).toBe(false);
		expect(storage.data.get(storageKey('a@example.com'))).toBe(CODE_B);
	});

	it('ignores a damaged value on the device', async () => {
		storage.data.set(storageKey('a@example.com'), 'garbage!');
		await mine.load();
		expect(mine.status).toBe('needs-entry');
	});

	it('is signed out when there is no account', async () => {
		email = null;
		await mine.load();
		expect(mine.status).toBe('signed-out');
	});

	it('reports a failed save on the device', async () => {
		const broken = createMyCode({
			fetchMyPlayer: async () => 'unavailable' as const,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => ({
				getItem: () => null,
				setItem: () => {
					throw new Error('full');
				},
				removeItem: () => {}
			}))
		});
		await broken.load();
		broken.save(CODE_A);
		expect(broken.status).toBe('ready');
		expect(broken.storageFailed).toBe(true);
	});
});

describe('myCode reset and server codes', () => {
	it('never shows account A code to account B after a reset', async () => {
		const storage = memoryStorage();
		const store = createCodeStore(() => storage);
		store.write('a@example.com', CODE_A);
		const mine = createMyCode({
			fetchMyPlayer: async () => 'unavailable' as const,
			accountEmail: async () => null,
			store
		});
		await mine.load('a@example.com');
		expect(mine.code).toBe(CODE_A);

		mine.reset();
		expect(mine.status).toBe('idle');
		expect(mine.code).toBeNull();
		expect(mine.email).toBeNull();

		await mine.load('b@example.com');
		expect(mine.code).toBeNull();
		expect(mine.status).toBe('needs-entry');
	});

	it('drops a load that was in flight when reset ran', async () => {
		let release: (player: MyPlayer | 'unavailable') => void = () => {};
		const mine = createMyCode({
			fetchMyPlayer: () => new Promise<MyPlayer | 'unavailable'>((resolve) => (release = resolve)),
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		const pending = mine.load();
		mine.reset();
		release(SERVER_PLAYER);
		await pending;
		expect(mine.status).toBe('idle');
		expect(mine.code).toBeNull();
	});

	it('does not carry the email from a previous load onto a server code', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => SERVER_PLAYER,
			accountEmail: async () => null,
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load('a@example.com');
		expect(mine.email).toBe('a@example.com');
		await mine.load();
		expect(mine.email).toBeNull();
	});

	it('refuses to overwrite a server code', async () => {
		const storage = memoryStorage();
		const mine = createMyCode({
			fetchMyPlayer: async () => SERVER_PLAYER,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => storage)
		});
		await mine.load();
		const result = mine.save(CODE_B);
		expect(result.ok).toBe(false);
		expect(mine.code).toBe(CODE_A);
		expect(storage.data.size).toBe(0);
	});

	it('shows the error state when the account cannot be found out (offline)', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => 'unavailable' as const,
			accountEmail: async () => {
				throw appError('network', null);
			},
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load();
		expect(mine.status).toBe('error');
	});
});

describe('myCode when me/player fails', () => {
	it('is signed out on a 401', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw appError('unauthenticated', 401);
			},
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load();
		expect(mine.status).toBe('signed-out');
	});

	it('falls back to the device code on a network error', async () => {
		const storage = memoryStorage();
		const store = createCodeStore(() => storage);
		store.write('a@example.com', CODE_B);
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw appError('network', null);
			},
			accountEmail: async () => 'a@example.com',
			store
		});
		await mine.load();
		expect(mine.status).toBe('ready');
		expect(mine.code).toBe(CODE_B);
	});

	it('shows an error, not the prompt, when it failed and nothing is saved', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw appError('server', 500);
			},
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load();
		expect(mine.status).toBe('error');
	});

	it('only the latest load counts', async () => {
		let release: (player: MyPlayer | 'unavailable') => void = () => {};
		let calls = 0;
		const mine = createMyCode({
			fetchMyPlayer: () => {
				calls += 1;
				return calls === 1
					? new Promise<MyPlayer | 'unavailable'>((resolve) => (release = resolve))
					: Promise.resolve({ code: CODE_B, displayName: 'Second' });
			},
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		const first = mine.load();
		await mine.load();
		release(SERVER_PLAYER);
		await first;
		expect(mine.code).toBe(CODE_B);
	});
});

describe('myCode.forget (sign out)', () => {
	it('deletes the saved code and forgets the account', async () => {
		const storage = memoryStorage();
		const mine = createMyCode({
			fetchMyPlayer: async () => 'unavailable' as const,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => storage)
		});
		await mine.load();
		mine.save(CODE_A);
		expect(storage.data.has(storageKey('a@example.com'))).toBe(true);

		mine.forget('a@example.com');
		expect(storage.data.size).toBe(0);
		expect(mine.code).toBeNull();
		expect(mine.email).toBeNull();
	});

	it('deletes the entry of the given account even before the profile has loaded', () => {
		const storage = memoryStorage();
		const store = createCodeStore(() => storage);
		store.write('a@example.com', CODE_A);
		const mine = createMyCode({
			fetchMyPlayer: async () => 'unavailable' as const,
			accountEmail: async () => 'a@example.com',
			store
		});
		mine.forget('A@Example.com');
		expect(storage.data.size).toBe(0);
	});

	it('leaves another account entry alone', () => {
		const storage = memoryStorage();
		const store = createCodeStore(() => storage);
		store.write('b@example.com', CODE_B);
		const mine = createMyCode({
			fetchMyPlayer: async () => 'unavailable' as const,
			accountEmail: async () => 'a@example.com',
			store
		});
		mine.forget('a@example.com');
		expect(storage.data.has(storageKey('b@example.com'))).toBe(true);
	});
});

describe('codes in these tests', () => {
	it('are valid player codes', () => {
		expect(parsePlayerCode(CODE_A).ok).toBe(true);
		expect(parsePlayerCode(CODE_B).ok).toBe(true);
	});
});

describe('myCode creates the player when there is none (backend#124)', () => {
	const DETAILS: PlayerCreateIn = {
		display_name: 'Fern Mock',
		birth_year: 1990,
		birth_month: 6,
		gender_division: 'womens'
	};
	let storage: ReturnType<typeof memoryStorage>;
	let gets: number;
	let posts: PlayerCreateIn[];

	/** A MyCode whose GET answers `found` in turn (the last one repeats) and POST answers `create`. */
	function make(
		found: (MyPlayer | 'none' | 'unavailable' | AppError)[],
		create: (body: PlayerCreateIn) => Promise<CreateMyPlayerResult>,
		deps: Partial<MyCodeDeps> = {}
	): MyCode {
		return createMyCode({
			fetchMyPlayer: async () => {
				const answer = found[Math.min(gets, found.length - 1)];
				gets += 1;
				if (answer instanceof AppError) throw answer;
				return answer;
			},
			createMyPlayer: (body = {}) => {
				posts.push(body);
				return create(body);
			},
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => storage),
			...deps
		});
	}

	beforeEach(() => {
		storage = memoryStorage();
		gets = 0;
		posts = [];
	});

	it('posts {} once on a 404 and shows the created code with no prompt', async () => {
		const mine = make(['none'], async () => ({ kind: 'created', player: SERVER_PLAYER }));
		await mine.load();
		expect(posts).toEqual([{}]);
		expect(mine.status).toBe('ready');
		expect(mine.source).toBe('server');
		expect(mine.code).toBe(CODE_A);
		expect(mine.displayName).toBe('Sample Player');
		expect(mine.prompting).toBe(false);
	});

	it('does not post when the account has a player', async () => {
		const mine = make([SERVER_PLAYER], async () => ({ kind: 'conflict' }));
		await mine.load();
		expect(posts).toEqual([]);
	});

	it('reads the player again after a 409 and shows it', async () => {
		const mine = make(['none', SERVER_PLAYER], async () => ({ kind: 'conflict' }));
		await mine.load();
		expect(gets).toBe(2);
		expect(posts).toHaveLength(1);
		expect(mine.status).toBe('ready');
		expect(mine.code).toBe(CODE_A);
	});

	it('is an error when there is still no player after a 409', async () => {
		const mine = make(['none'], async () => ({ kind: 'conflict' }));
		await mine.load();
		expect(posts).toHaveLength(1);
		expect(mine.status).toBe('error');
	});

	it('asks for the details on a 422, without showing errors yet', async () => {
		const mine = make(['none'], async () => ({
			kind: 'needs-details',
			fields: { display_name: 'Enter a display name.' }
		}));
		await mine.load();
		expect(mine.status).toBe('needs-details');
		expect(mine.detailErrors).toEqual({});
		expect(mine.prompting).toBe(false);
	});

	it('posts the details and shows the code', async () => {
		let answer: CreateMyPlayerResult = { kind: 'needs-details', fields: {} };
		const mine = make(['none'], async () => answer);
		await mine.load();
		answer = { kind: 'created', player: SERVER_PLAYER };
		await mine.submitDetails(DETAILS);
		expect(posts).toEqual([{}, DETAILS]);
		expect(mine.status).toBe('ready');
		expect(mine.code).toBe(CODE_A);
	});

	it('shows each field error from a 422, and other errors as a problem', async () => {
		let answer: CreateMyPlayerResult = { kind: 'needs-details', fields: {} };
		const mine = make(['none'], async () => answer);
		await mine.load();
		answer = {
			kind: 'needs-details',
			fields: { display_name: 'Too long.', birth_year: 'Too early.', city: 'Bad city.' }
		};
		await mine.submitDetails(DETAILS);
		expect(mine.status).toBe('needs-details');
		expect(mine.detailErrors).toEqual({ display_name: 'Too long.', birth_year: 'Too early.' });
		expect(mine.detailProblem).toBe('Bad city.');
	});

	it('is refused on the age refusal, at load and on submit', async () => {
		const refused = make(['none'], async () => ({ kind: 'refused' }));
		await refused.load();
		expect(refused.status).toBe('refused');
		expect(refused.prompting).toBe(false);

		let answer: CreateMyPlayerResult = { kind: 'needs-details', fields: {} };
		const mine = make(['none'], async () => answer);
		await mine.load();
		answer = { kind: 'refused' };
		await mine.submitDetails(DETAILS);
		expect(mine.status).toBe('refused');
	});

	it('falls back to the device prompt when the backend has no create (404 or 405)', async () => {
		const mine = make(['none'], async () => ({ kind: 'unavailable' }));
		await mine.load();
		expect(mine.status).toBe('needs-entry');
	});

	it('falls back to a device code when the backend has no create', async () => {
		createCodeStore(() => storage).write('a@example.com', CODE_B);
		const mine = make(['none'], async () => ({ kind: 'unavailable' }));
		await mine.load();
		expect(mine.status).toBe('ready');
		expect(mine.source).toBe('device');
		expect(mine.code).toBe(CODE_B);
	});

	it('does not post when GET me/player is a 405', async () => {
		const mine = make(['unavailable'], async () => ({ kind: 'conflict' }));
		await mine.load();
		expect(posts).toEqual([]);
		expect(mine.status).toBe('needs-entry');
	});

	it('is signed out on a 401 from the create', async () => {
		const mine = make(['none'], async () => {
			throw appError('unauthenticated', 401);
		});
		await mine.load();
		expect(mine.status).toBe('signed-out');
	});

	it('is unverified on a 403 from the create', async () => {
		const mine = make(['none'], async () => {
			throw appError('forbidden', 403);
		});
		await mine.load();
		expect(mine.status).toBe('unverified');
		expect(mine.code).toBeNull();
	});

	it('is an error on a 5xx, even with a code saved on the device', async () => {
		createCodeStore(() => storage).write('a@example.com', CODE_B);
		const fromCreate = make(['none'], async () => {
			throw appError('server', 500);
		});
		await fromCreate.load();
		expect(fromCreate.status).toBe('error');

		const fromRead = make([appError('server', 503)], async () => ({ kind: 'conflict' }));
		await fromRead.load();
		expect(fromRead.status).toBe('error');
	});

	it('is an error on a network failure of the create when nothing is saved', async () => {
		const mine = make(['none'], async () => {
			throw appError('network', null);
		});
		await mine.load();
		expect(mine.status).toBe('error');
	});

	it('keeps the form with a problem when a submit fails to reach the server', async () => {
		let fail = false;
		const mine = make(['none'], async () => {
			if (fail)
				throw new AppError({
					kind: 'network',
					status: null,
					code: 'network_error',
					message: 'No connection.',
					fields: {}
				});
			return { kind: 'needs-details', fields: {} };
		});
		await mine.load();
		fail = true;
		await mine.submitDetails(DETAILS);
		expect(mine.status).toBe('needs-details');
		expect(mine.detailProblem).toBe('No connection.');
	});

	it('is unverified when a submit gets a 403', async () => {
		let error: AppError | null = null;
		const mine = make(['none'], async () => {
			if (error) throw error;
			return { kind: 'needs-details', fields: {} };
		});
		await mine.load();
		error = appError('forbidden', 403);
		await mine.submitDetails(DETAILS);
		expect(mine.status).toBe('unverified');
	});

	it('sends at most one POST in flight for two loads at once', async () => {
		let release: (result: CreateMyPlayerResult) => void = () => {};
		const mine = make(
			['none'],
			() => new Promise<CreateMyPlayerResult>((resolve) => (release = resolve))
		);
		const first = mine.load();
		const second = mine.load();
		await vi.waitFor(() => expect(posts).toHaveLength(1));
		await Promise.resolve();
		release({ kind: 'created', player: SERVER_PLAYER });
		await Promise.all([first, second]);
		expect(posts).toHaveLength(1);
		expect(mine.status).toBe('ready');
		expect(mine.code).toBe(CODE_A);
	});

	it('posts again on a later load once the first create has answered', async () => {
		const mine = make(['none'], async () => ({ kind: 'needs-details', fields: {} }));
		await mine.load();
		await mine.load();
		expect(posts).toHaveLength(2);
	});

	it('never lets a late create overwrite a newer load', async () => {
		let release: (result: CreateMyPlayerResult) => void = () => {};
		let calls = 0;
		const mine = make(['none', { code: CODE_B, displayName: 'Second' }], (body) => {
			calls += 1;
			void body;
			return new Promise<CreateMyPlayerResult>((resolve) => (release = resolve));
		});
		const first = mine.load();
		await vi.waitFor(() => expect(calls).toBe(1));
		const second = mine.load();
		await second;
		release({ kind: 'created', player: SERVER_PLAYER });
		await first;
		expect(mine.code).toBe(CODE_B);
	});

	it('clears the details state on reset, and never reuses the old create', async () => {
		const mine = make(['none'], async () => ({ kind: 'needs-details', fields: {} }));
		await mine.load();
		await mine.submitDetails({});
		mine.reset();
		expect(mine.status).toBe('idle');
		expect(mine.detailErrors).toEqual({});
		expect(mine.detailProblem).toBeNull();

		const releases: ((result: CreateMyPlayerResult) => void)[] = [];
		posts = [];
		const waiting = make(
			['none'],
			() => new Promise<CreateMyPlayerResult>((resolve) => releases.push(resolve))
		);
		const pending = waiting.load();
		await vi.waitFor(() => expect(posts).toHaveLength(1));
		waiting.reset();
		const next = waiting.load('b@example.com');
		await vi.waitFor(() => expect(posts).toHaveLength(2));
		releases[1]({ kind: 'created', player: SERVER_PLAYER });
		releases[0]({ kind: 'refused' });
		await Promise.all([pending, next]);
		expect(waiting.status).toBe('ready');
		expect(waiting.code).toBe(CODE_A);
	});
});

describe('myCode when the create is refused for its values (a 422 with nothing missing)', () => {
	const DETAILS: PlayerCreateIn = {
		display_name: 'Fern Mock',
		birth_year: 1990,
		birth_month: 6,
		gender_division: 'womens'
	};

	function make(create: () => Promise<CreateMyPlayerResult>): MyCode {
		return createMyCode({
			fetchMyPlayer: async () => 'none',
			createMyPlayer: create,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
	}

	it('says the profile could not be created when POST {} on load gets one, with no form', async () => {
		const mine = make(async () => ({
			kind: 'invalid',
			fields: { display_name: 'Ensure this value has at most 64 characters (it has 70).' }
		}));
		await mine.load();
		expect(mine.status).toBe('not-created');
		expect(mine.code).toBeNull();
		expect(mine.prompting).toBe(false);
	});

	it('shows the field errors on the form when a submit gets one', async () => {
		let answer: CreateMyPlayerResult = { kind: 'needs-details', fields: {} };
		const mine = make(async () => answer);
		await mine.load();
		answer = { kind: 'invalid', fields: { gender_division: 'Choose one of the listed options.' } };
		await mine.submitDetails(DETAILS);
		expect(mine.status).toBe('needs-details');
		expect(mine.detailErrors).toEqual({ gender_division: 'Choose one of the listed options.' });
	});
});
