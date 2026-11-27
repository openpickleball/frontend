import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '#lib/api/index.js';
import { buildCode, parsePlayerCode, type PlayerCode } from '#lib/domain/index.js';
import { createMyCode, type MyCode, type MyCodeDeps } from './my-code.svelte.js';
import type { CreateMyPlayerResult, PlayerCreateIn } from './services.js';
import type { MyPlayer } from './types.js';

const CODE_A = buildCode('player', '4RWN8TQ') as PlayerCode;
const CODE_B = buildCode('player', '9HJD3XK') as PlayerCode;

function appError(kind: AppError['kind'], status: number | null): AppError {
	return new AppError({ kind, status, code: 'x', message: 'x', fields: {} });
}

const SERVER_PLAYER: MyPlayer = { code: CODE_A, displayName: 'Sample Player' };

describe('myCode.rename', () => {
	it('shows a saved display name for a code from the server', async () => {
		const mine = createMyCode({ fetchMyPlayer: async () => SERVER_PLAYER });
		await mine.load();
		mine.rename('Fern Quill');
		expect(mine.displayName).toBe('Fern Quill');
	});

	it('does nothing before the code is known', () => {
		const mine = createMyCode({ fetchMyPlayer: async () => SERVER_PLAYER });
		mine.rename('Fern Quill');
		expect(mine.displayName).toBeNull();
	});
});

describe('myCode with me/player available', () => {
	it('uses the server code', async () => {
		const mine = createMyCode({ fetchMyPlayer: async () => SERVER_PLAYER });
		await mine.load();
		expect(mine.status).toBe('ready');
		expect(mine.code).toBe(CODE_A);
		expect(mine.displayName).toBe('Sample Player');
	});
});

describe('myCode reset', () => {
	it('never shows account A code to account B after a reset', async () => {
		let player: MyPlayer = SERVER_PLAYER;
		const mine = createMyCode({ fetchMyPlayer: async () => player });
		await mine.load();
		expect(mine.code).toBe(CODE_A);

		mine.reset();
		expect(mine.status).toBe('idle');
		expect(mine.code).toBeNull();
		expect(mine.displayName).toBeNull();

		player = { code: CODE_B, displayName: 'Other Player' };
		await mine.load();
		expect(mine.code).toBe(CODE_B);
	});

	it('drops a load that was in flight when reset ran', async () => {
		let release: (player: MyPlayer) => void = () => {};
		const mine = createMyCode({
			fetchMyPlayer: () => new Promise<MyPlayer>((resolve) => (release = resolve))
		});
		const pending = mine.load();
		mine.reset();
		release(SERVER_PLAYER);
		await pending;
		expect(mine.status).toBe('idle');
		expect(mine.code).toBeNull();
	});
});

describe('myCode when me/player fails', () => {
	it('is signed out on a 401', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw appError('unauthenticated', 401);
			}
		});
		await mine.load();
		expect(mine.status).toBe('signed-out');
	});

	it('is an error on a network failure (offline), with no code', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw appError('network', null);
			}
		});
		await mine.load();
		expect(mine.status).toBe('error');
		expect(mine.code).toBeNull();
	});

	it('is an error on a 405, and does not post', async () => {
		const createMyPlayer = vi.fn(async (): Promise<CreateMyPlayerResult> => ({ kind: 'conflict' }));
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw appError('server', 405);
			},
			createMyPlayer
		});
		await mine.load();
		expect(mine.status).toBe('error');
		expect(createMyPlayer).not.toHaveBeenCalled();
	});

	it('is an error on a 5xx', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw appError('server', 500);
			}
		});
		await mine.load();
		expect(mine.status).toBe('error');
	});

	it('only the latest load counts', async () => {
		let release: (player: MyPlayer) => void = () => {};
		let calls = 0;
		const mine = createMyCode({
			fetchMyPlayer: () => {
				calls += 1;
				return calls === 1
					? new Promise<MyPlayer>((resolve) => (release = resolve))
					: Promise.resolve({ code: CODE_B, displayName: 'Second' });
			}
		});
		const first = mine.load();
		await mine.load();
		release(SERVER_PLAYER);
		await first;
		expect(mine.code).toBe(CODE_B);
	});
});

describe('myCode keeps a known code through a failed reload (frontend#249)', () => {
	async function loaded(fail: () => Error) {
		let broken = false;
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				if (broken) throw fail();
				return SERVER_PLAYER;
			}
		});
		await mine.load();
		broken = true;
		return mine;
	}

	it('keeps the code and stays ready when the reload gets no answer', async () => {
		const mine = await loaded(() => appError('network', null));
		await mine.load();
		expect(mine.status).toBe('ready');
		expect(mine.code).toBe(CODE_A);
		expect(mine.displayName).toBe('Sample Player');
	});

	it('stays ready while the reload is waiting', async () => {
		let release: (player: MyPlayer) => void = () => {};
		let calls = 0;
		const mine = createMyCode({
			fetchMyPlayer: () =>
				++calls === 1 ? Promise.resolve(SERVER_PLAYER) : new Promise((r) => (release = r))
		});
		await mine.load();
		const pending = mine.load();
		expect(mine.status).toBe('ready');
		expect(mine.code).toBe(CODE_A);
		release(SERVER_PLAYER);
		await pending;
		expect(mine.status).toBe('ready');
	});

	it('clears the code on a 401', async () => {
		const mine = await loaded(() => appError('unauthenticated', 401));
		await mine.load();
		expect(mine.status).toBe('signed-out');
		expect(mine.code).toBeNull();
	});

	it('clears the code on a 5xx', async () => {
		const mine = await loaded(() => appError('server', 500));
		await mine.load();
		expect(mine.status).toBe('error');
		expect(mine.code).toBeNull();
	});

	it('clears the code on reset after a failed reload', async () => {
		const mine = await loaded(() => appError('network', null));
		await mine.load();
		mine.reset();
		expect(mine.status).toBe('idle');
		expect(mine.code).toBeNull();
	});

	it('is still an error with no code when the first load gets no answer', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw appError('network', null);
			}
		});
		await mine.load();
		expect(mine.status).toBe('error');
		expect(mine.code).toBeNull();
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
	let gets: number;
	let posts: PlayerCreateIn[];

	/** A MyCode whose GET answers `found` in turn (the last one repeats) and POST answers `create`. */
	function make(
		found: (MyPlayer | 'none' | AppError)[],
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
			...deps
		});
	}

	beforeEach(() => {
		gets = 0;
		posts = [];
	});

	it('posts {} once on a 404 and shows the created code', async () => {
		const mine = make(['none'], async () => ({ kind: 'created', player: SERVER_PLAYER }));
		await mine.load();
		expect(posts).toEqual([{}]);
		expect(mine.status).toBe('ready');
		expect(mine.code).toBe(CODE_A);
		expect(mine.displayName).toBe('Sample Player');
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

		let answer: CreateMyPlayerResult = { kind: 'needs-details', fields: {} };
		const mine = make(['none'], async () => answer);
		await mine.load();
		answer = { kind: 'refused' };
		await mine.submitDetails(DETAILS);
		expect(mine.status).toBe('refused');
	});

	it.each([
		['not_found', 404],
		['server', 405]
	] as const)('is an error when the create answers a %s (%i)', async (kind, status) => {
		const mine = make(['none'], async () => {
			throw appError(kind, status);
		});
		await mine.load();
		expect(mine.status).toBe('error');
		expect(mine.code).toBeNull();
	});

	it('is signed out on a 401 from the create', async () => {
		const mine = make(['none'], async () => {
			throw appError('unauthenticated', 401);
		});
		await mine.load();
		expect(mine.status).toBe('signed-out');
	});

	it('is mfa-required, not unverified, on a 403 mfa_required', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw new AppError({
					kind: 'forbidden',
					status: 403,
					code: 'mfa_required',
					message: 'x',
					fields: {}
				});
			}
		});
		await mine.load();
		expect(mine.status).toBe('mfa-required');
	});

	it('is unverified on a 403 from the create', async () => {
		const mine = make(['none'], async () => {
			throw appError('forbidden', 403);
		});
		await mine.load();
		expect(mine.status).toBe('unverified');
		expect(mine.code).toBeNull();
	});

	it('is an error on a 5xx', async () => {
		const fromCreate = make(['none'], async () => {
			throw appError('server', 500);
		});
		await fromCreate.load();
		expect(fromCreate.status).toBe('error');

		const fromRead = make([appError('server', 503)], async () => ({ kind: 'conflict' }));
		await fromRead.load();
		expect(fromRead.status).toBe('error');
	});

	it('is an error on a network failure of the create', async () => {
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
		const next = waiting.load();
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
		return createMyCode({ fetchMyPlayer: async () => 'none', createMyPlayer: create });
	}

	it('says the profile could not be created when POST {} on load gets one, with no form', async () => {
		const mine = make(async () => ({
			kind: 'invalid',
			fields: { display_name: 'Ensure this value has at most 64 characters (it has 70).' }
		}));
		await mine.load();
		expect(mine.status).toBe('not-created');
		expect(mine.code).toBeNull();
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
