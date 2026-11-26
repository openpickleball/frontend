import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Match } from '#lib/domain/index.js';
import { createOfflineQueue } from '../queue.svelte.js';
import type { SendOutcome } from '../send.js';
import { memoryStore } from '../store.js';
import type { MatchBody } from '../types.js';
import QueueNotice from './queue-notice.svelte';

// Made-up players and account.
const EMAIL = 'avery.nightjar@example.test';
const OWN = 'P-AAAA-BBBB';
const body = (day: string): MatchBody => ({
	format: 'doubles',
	played_on: day,
	team_a: [OWN, 'P-CCCC-DDDD'],
	team_b: ['P-EEEE-FFFF', 'P-GGGG-HHHH'],
	games: [
		{ team_a: 11, team_b: 6 },
		{ team_a: 11, team_b: 8 }
	]
});

let ids = 0;
async function setup(waiting: number, outcome?: SendOutcome) {
	let online = false;
	const send = vi.fn(async (): Promise<SendOutcome> => outcome ?? { kind: 'retry', offline: true });
	const queue = createOfflineQueue({
		store: memoryStore(),
		send,
		online: () => online,
		newId: () => `n${++ids}`,
		exclusive: (work) => work()
	});
	await queue.setAccount(EMAIL);
	for (let i = 0; i < waiting; i++) {
		await queue.add({ own: OWN, body: body(`2026-11-1${i + 1}`), form: {} });
	}
	const onfix = vi.fn();
	const screen = await render(QueueNotice, { queue, onfix });
	return { queue, screen, send, onfix, goOnline: () => (online = true) };
}

describe('QueueNotice', () => {
	it('shows nothing when every match is sent', async () => {
		const { screen } = await setup(0);
		expect(screen.container.textContent?.trim()).toBe('');
	});

	it('says how many matches wait and that they go when back online', async () => {
		const { screen } = await setup(2);
		await expect.element(screen.getByText('2 matches waiting to send')).toBeVisible();
		await expect
			.element(
				screen.getByText("They're saved on this device. We'll send them when you're back online.")
			)
			.toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Send now' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('status')).toBeVisible();
	});

	it('offers Send now after a server failure, and sends', async () => {
		const { queue, screen, send, goOnline } = await setup(1);
		goOnline();
		queue.online = true;
		send.mockResolvedValueOnce({ kind: 'retry', offline: false });
		await queue.flush();
		await expect.element(screen.getByText('1 match waiting to send')).toBeVisible();
		await expect
			.element(screen.getByText("We couldn't send it yet. We'll try again when you open the app."))
			.toBeVisible();

		send.mockResolvedValueOnce({ kind: 'sent', match: { code: 'M-9QF6-RD2K-X3BP' } as Match });
		await screen.getByRole('button', { name: 'Send now' }).click();
		await expect.element(screen.getByText('1 match waiting to send')).not.toBeInTheDocument();
	});

	it('asks the player to sign in again after a 401', async () => {
		const { queue, screen, goOnline } = await setup(1, { kind: 'signin' });
		goOnline();
		queue.online = true;
		await queue.flush();
		await expect
			.element(screen.getByText('Your session ended. Sign in again to send it.'))
			.toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Send now' })).not.toBeInTheDocument();
	});

	it('shows a refused match with its messages, Fix and Delete', async () => {
		const { queue, screen, onfix, goOnline } = await setup(1, {
			kind: 'refused',
			problem: {
				kind: 'invalid',
				message: "Some details weren't accepted.",
				fields: { 'team_b.0': ['No player has this OPEN code.'] }
			}
		});
		goOnline();
		await queue.flush();

		const refused = screen.getByTestId('queue-refused');
		await expect.element(refused.getByText("This match wasn't recorded")).toBeVisible();
		await expect.element(refused.getByText('Played 11 Nov 2026 · 11-6, 11-8')).toBeVisible();
		await expect.element(refused.getByText('No player has this OPEN code.')).toBeVisible();
		await expect.element(refused).toHaveAttribute('role', 'alert');
		await expect.element(screen.getByText(/waiting to send/)).not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Fix and record again' }).click();
		expect(onfix).toHaveBeenCalledWith(expect.objectContaining({ id: queue.refused[0].id }));

		await screen.getByRole('button', { name: 'Delete' }).click();
		await expect.element(refused).not.toBeInTheDocument();
		expect(queue.unsent).toBe(0);
	});

	it('offers no Fix for a match the backend refused for another reason', async () => {
		const { queue, screen, goOnline } = await setup(1, {
			kind: 'refused',
			problem: {
				kind: 'refused',
				message: "We couldn't record this match. You can only record a match you played in.",
				fields: {}
			}
		});
		goOnline();
		await queue.flush();
		await expect
			.element(screen.getByText(/You can only record a match you played in/))
			.toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: 'Fix and record again' }))
			.not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Delete' })).toBeVisible();
	});
});
