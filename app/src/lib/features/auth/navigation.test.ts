import { beforeEach, describe, expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import { goAfterSignIn } from './navigation';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
const mockedGoto = vi.mocked(goto);

beforeEach(() => {
	mockedGoto.mockReset();
	mockedGoto.mockResolvedValue(undefined);
});

describe('goAfterSignIn', () => {
	it('goes to a same-site next', async () => {
		await goAfterSignIn(new URLSearchParams('next=/matches'));
		expect(mockedGoto.mock.calls).toEqual([['/matches']]);
	});

	it('goes home when next is missing or points to another site', async () => {
		await goAfterSignIn(new URLSearchParams());
		await goAfterSignIn(new URLSearchParams('next=//evil.example'));
		expect(mockedGoto.mock.calls).toEqual([['/'], ['/']]);
	});

	it('goes home when the next page cannot be opened', async () => {
		mockedGoto.mockRejectedValueOnce(new Error('no such page'));
		await goAfterSignIn(new URLSearchParams('next=/recrod'));
		expect(mockedGoto.mock.calls).toEqual([['/recrod'], ['/']]);
	});
});
