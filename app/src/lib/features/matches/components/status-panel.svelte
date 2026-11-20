<script lang="ts">
	import {
		isPending,
		needsViewerConfirmation,
		waitingOnOtherTeam,
		type Match
	} from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import type { MatchAction } from '../cache.svelte.js';

	let {
		match,
		busy = null,
		error = null,
		onconfirm,
		ondispute
	}: {
		match: Match;
		/** The action in flight, so its button waits. */
		busy?: MatchAction | null;
		/** Why the last Confirm or Dispute failed. */
		error?: string | null;
		onconfirm: () => void;
		/** Opens the dispute dialog. The dialog's own button disputes. */
		ondispute: () => void;
	} = $props();

	type Panel = { title: string; text: string; actions: boolean };
	const panel = $derived.by((): Panel => {
		const decision = match.viewerDecision;
		switch (match.status) {
			case 'confirmed':
				return {
					title: 'Confirmed',
					text:
						decision === 'confirm'
							? 'You confirmed this score. It counts in your match history.'
							: 'This score is confirmed. It counts in your match history.',
					actions: false
				};
			case 'disputed':
				return {
					title: 'Disputed',
					text:
						decision === 'dispute'
							? 'You said this score is wrong. No one can confirm it while it is disputed.'
							: 'A player in this match said the score is wrong. No one can confirm it while it is disputed.',
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
		const confirmed = match.confirmedBySide;
		if (!match.viewerSide || !confirmed) {
			return {
				title: 'Waiting for confirmation',
				text: 'This match counts once a player on each team confirms the score.',
				actions: false
			};
		}
		const otherConfirmed = confirmed[match.viewerSide === 'a' ? 'b' : 'a'];
		if (needsViewerConfirmation(match)) {
			return {
				title: 'Is this the right score?',
				text: `${
					otherConfirmed
						? 'The other team has confirmed this score. Your team has not.'
						: 'Neither team has confirmed this score yet.'
				} The match counts once a player on each team confirms it. If the score is wrong, dispute it.`,
				actions: true
			};
		}
		if (!waitingOnOtherTeam(match)) {
			return {
				title: 'Waiting for confirmation',
				text: 'This match counts once a player on each team confirms the score.',
				actions: false
			};
		}
		return {
			title: 'Waiting for the other team',
			text: `${
				decision === 'confirm'
					? 'You confirmed this score.'
					: 'A player on your team confirmed this score.'
			} The match counts once a player on the other team confirms it too.`,
			actions: false
		};
	});
</script>

<section
	class="mt-8 border border-l-4 border-line bg-surface px-5 py-5 {match.status === 'confirmed'
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
	<h2 id="status-heading" tabindex="-1" class="text-lg font-semibold outline-none">
		{panel.title}
	</h2>
	<p class="mt-2 max-w-md text-muted">{panel.text}</p>
	{#if error}
		<p class="mt-4 max-w-md text-base text-danger" role="alert">{error}</p>
	{/if}
	{#if panel.actions && isPending(match)}
		<div class="mt-4 flex flex-wrap gap-3">
			<Button
				id="confirm-button"
				onclick={onconfirm}
				disabled={busy !== null}
				aria-busy={busy === 'confirm'}
			>
				{#if busy === 'confirm'}<Spinner />{/if}
				{busy === 'confirm' ? 'Confirming…' : 'Confirm score'}
			</Button>
			<Button id="dispute-button" variant="destructive" onclick={ondispute} disabled={busy !== null}
				>Dispute</Button
			>
		</div>
	{/if}
</section>
