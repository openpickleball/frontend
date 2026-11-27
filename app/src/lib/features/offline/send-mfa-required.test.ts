/**
 * Review finding G, the offline queue (frontend#261): a queued match the API refused with 403
 * `mfa_required` was marked refused for good, with "You can only record a match you played in.",
 * and never sent again once the session passed two-factor. It is a wait, like a signed-out
 * session: keep the match, say two-factor is needed, and send it later.
 */
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '#lib/api/index.js';
import type { Match, MatchCode } from '#lib/domain/index.js';
import { waitingText } from './copy.js';
import { createOfflineQueue } from './queue.svelte.js';
import { outcomeOf, type SendOutcome } from './send.js';
import { memoryStore } from './store.js';
import type { MatchBody } from './types.js';

const mfaRequired = () =>
	new AppError({
		kind: 'forbidden',
		status: 403,
		code: 'mfa_required',
		message:
			'This needs two-factor authentication. Set it up or confirm with a code, then try again.',
		fields: {}
	});

const body: MatchBody = {
	format: 'singles',
	played_on: '2026-11-14',
	team_a: ['P-AAAA-BBBB'],
	team_b: ['P-CCCC-DDDD'],
	games: [{ team_a: 11, team_b: 6 }]
};

describe('a queued match refused with mfa_required', () => {
	it('is a wait for two-factor, not a refusal', () => {
		expect(outcomeOf(mfaRequired())).toEqual({ kind: 'mfa' });
	});

	it('stays waiting, says why, and is sent on a later try', async () => {
		let answer: SendOutcome = { kind: 'mfa' };
		const send = vi.fn(async () => answer);
		let ids = 0;
		const queue = createOfflineQueue({
			store: memoryStore(),
			send,
			online: () => true,
			newId: () => `id-${++ids}`,
			now: () => new Date(Date.UTC(2026, 10, 14, 10, 0, 0)),
			exclusive: (work) => work()
		});
		await queue.setAccount('avery.nightjar@example.test');
		await queue.add({ own: 'P-AAAA-BBBB', body, form: { format: 'singles' } });
		await queue.flush();
		expect(queue.waiting).toHaveLength(1);
		expect(queue.refused).toHaveLength(0);
		expect(queue.reason).toBe('mfa');
		expect(waitingText(1, queue.reason, true)).toMatch(/two-factor/i);
		answer = { kind: 'sent', match: { code: 'M-9QF6-RD2K-X3BP' as MatchCode } as Match };
		await queue.flush();
		expect(queue.waiting).toHaveLength(0);
	});
});
