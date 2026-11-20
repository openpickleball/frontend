import { describe, expect, it } from 'vitest';
import type { Match } from '#lib/domain/index.js';
import type { AppError } from '#lib/api/index.js';
import { recordedToast } from './recorded-toast.js';

const match = { code: 'M-9QF6-RD2K-X3BP' } as unknown as Match;

describe('recordedToast', () => {
	it('says the match is recorded', () => {
		expect(recordedToast({ match, confirmError: null })).toEqual({ title: 'Match recorded' });
	});

	it('says the score is not confirmed and where to confirm it', () => {
		const confirmError = { kind: 'network' } as AppError;
		expect(recordedToast({ match, confirmError })).toEqual({
			title: "Match recorded. We couldn't confirm your score.",
			description: 'Confirm it on the match page.',
			duration: 10_000
		});
	});
});
