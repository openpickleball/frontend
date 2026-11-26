import type { QueuedMatch } from './types.js';
import type { WaitReason } from './queue.svelte.js';

/** "1 match waiting to send", "2 matches waiting to send". */
export function waitingTitle(count: number): string {
	return count === 1 ? '1 match waiting to send' : `${count} matches waiting to send`;
}

/** What happens next to the waiting matches. */
export function waitingText(count: number, reason: WaitReason, online: boolean): string {
	const it = count === 1 ? 'it' : 'them';
	if (reason === 'signin') return `Your session ended. Sign in again to send ${it}.`;
	if (!online || reason === 'offline') {
		return `${count === 1 ? "It's" : "They're"} saved on this device. We'll send ${it} when you're back online.`;
	}
	if (reason === 'retry')
		return `We couldn't send ${it} yet. We'll try again when you open the app.`;
	return `We're sending ${it} now.`;
}

/** The warning before a sign out deletes unsent matches, or null when there are none. */
export function signOutWarning(unsent: number): string | null {
	if (unsent === 0) return null;
	if (unsent === 1) {
		return "1 match hasn't been sent yet. It's only on this device, and signing out deletes it.";
	}
	return `${unsent} matches haven't been sent yet. They're only on this device, and signing out deletes them.`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Played 14 Nov 2026 · 11-6, 11-8", with the player's team's points first. */
export function matchSummary(item: QueuedMatch): string {
	const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.body.played_on ?? '');
	const month = found ? MONTHS[Number(found[2]) - 1] : undefined;
	const date = found && month ? `${Number(found[3])} ${month} ${found[1]}` : item.body.played_on;
	const ownFirst = !item.body.team_b?.includes(item.own);
	const games = (item.body.games ?? [])
		.map((g) => (ownFirst ? `${g.team_a}-${g.team_b}` : `${g.team_b}-${g.team_a}`))
		.join(', ');
	return games ? `Played ${date} · ${games}` : `Played ${date}`;
}

/** The backend's messages for a refused match, one per line, without repeats. */
export function problemLines(item: QueuedMatch): string[] {
	if (!item.problem) return [];
	const lines = [item.problem.message];
	for (const messages of Object.values(item.problem.fields)) {
		for (const message of messages) if (!lines.includes(message)) lines.push(message);
	}
	return lines;
}
