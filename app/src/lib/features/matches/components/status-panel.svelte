<script lang="ts">
	import { isPending, myTeam, type Match, type PlayerCode } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import type { MatchAction } from '../cache.svelte.js';

	let {
		match,
		you,
		acted,
		busy = null,
		error = null,
		onconfirm,
		ondispute
	}: {
		match: Match;
		you: PlayerCode;
		/** What the player did to this match in this session. The API cannot say (backend#193). */
		acted?: MatchAction;
		/** The action in flight, so its button waits. */
		busy?: MatchAction | null;
		/** Why the last Confirm or Dispute failed. */
		error?: string | null;
		onconfirm: () => void;
		/** Opens the dispute dialog. The dialog's own button disputes. */
		ondispute: () => void;
	} = $props();

	const plays = $derived(myTeam(match, you) !== null);

	type Panel = { title: string; text: string; actions: boolean };
	const panel = $derived.by((): Panel => {
		switch (match.status) {
			case 'confirmed':
				return {
					title: 'Confirmed',
					text: "Players on both teams agreed on this score. It's part of your match history.",
					actions: false
				};
			case 'disputed':
				return {
					title: 'Disputed',
					text: 'A player in this match said the score is wrong. No one can confirm it while it is disputed.',
					actions: false
				};
			case 'voided':
				return {
					title: 'Voided',
					text: "This match was voided. It doesn't count towards anyone's history.",
					actions: false
				};
			default:
				break;
		}
		if (!plays) {
			return {
				title: 'Waiting for confirmation',
				text: 'This match counts once a player on each team confirms the score.',
				actions: false
			};
		}
		// Only what this session knows. The API does not say who has confirmed.
		if (acted === 'confirm') {
			return {
				title: 'Waiting for the other team',
				text: 'You confirmed this score. The match counts once a player on the other team confirms it too.',
				actions: false
			};
		}
		return {
			title: 'Is this the right score?',
			text: 'This match counts once a player on each team confirms it. If the score is wrong, dispute it.',
			actions: true
		};
	});
</script>

<section
	class="mt-8 border border-l-[3px] border-line bg-surface px-5 pt-5 pb-[22px] {match.status ===
	'confirmed'
		? 'border-l-confirmed'
		: match.status === 'disputed'
			? 'border-l-disputed'
			: match.status === 'voided'
				? 'border-l-voided'
				: 'border-l-secondary'}"
	aria-labelledby="status-heading"
	data-testid="status-panel"
	data-status={match.status}
>
	<h2 id="status-heading" tabindex="-1" class="text-[17px] font-semibold outline-none">
		{panel.title}
	</h2>
	<p class="mt-1.5 max-w-[56ch] text-muted">{panel.text}</p>
	{#if error}
		<p class="mt-3 max-w-[56ch] text-[15px] text-danger" role="alert">{error}</p>
	{/if}
	{#if panel.actions && isPending(match)}
		<div class="mt-[18px] flex flex-wrap gap-3">
			<Button onclick={onconfirm} disabled={busy !== null}>
				{busy === 'confirm' ? 'Confirming…' : 'Confirm score'}
			</Button>
			<Button variant="destructive" onclick={ondispute} disabled={busy !== null}>Dispute</Button>
		</div>
	{/if}
</section>
