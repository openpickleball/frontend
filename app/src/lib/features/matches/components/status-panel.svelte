<script lang="ts">
	import type { Match } from '#lib/domain/index.js';
	import { Alert, AlertDescription } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import type { MatchAction } from '../cache.svelte.js';
	import { matchStatusCopy } from '../status.js';

	let {
		match,
		busy = null,
		error = null,
		recorded = false,
		onconfirm,
		ondispute,
		onwithdraw = () => {}
	}: {
		match: Match;
		/** The action in flight, so its button waits. */
		busy?: MatchAction | null;
		/** Why the last action failed. */
		error?: string | null;
		/** The player just recorded this match, so the panel says so. */
		recorded?: boolean;
		onconfirm: () => void;
		/** Opens the dispute dialog. The dialog's own button disputes. */
		ondispute: () => void;
		/** Opens the withdraw dialog. The dialog's own button withdraws. */
		onwithdraw?: () => void;
	} = $props();

	const panel = $derived(matchStatusCopy(match));
	const offers = (action: MatchAction) => panel.actions.includes(action);
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
	{#if recorded}
		<p class="mt-2 max-w-md text-secondary">You just recorded this match.</p>
	{/if}
	<p class="mt-2 max-w-md text-muted">{panel.text}</p>
	{#each panel.notes as note (note)}
		<p class="mt-2 max-w-md text-muted">{note}</p>
	{/each}
	{#if error}
		<Alert variant="destructive" class="mt-4 max-w-md">
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{/if}
	{#if panel.actions.length > 0}
		<div class="mt-4 flex flex-wrap gap-3">
			{#if offers('confirm')}
				<Button
					id="confirm-button"
					onclick={() => busy === null && onconfirm()}
					aria-disabled={busy !== null}
					aria-busy={busy === 'confirm'}
				>
					{#if busy === 'confirm'}<Spinner />{/if}
					{busy === 'confirm' ? 'Confirming…' : 'Confirm score'}
				</Button>
			{/if}
			{#if offers('dispute')}
				<Button
					id="dispute-button"
					variant="destructive"
					onclick={() => busy === null && ondispute()}
					aria-disabled={busy !== null}
					aria-busy={busy === 'dispute'}
				>
					Dispute
				</Button>
			{/if}
			{#if offers('withdraw')}
				<Button
					id="withdraw-button"
					variant="outline"
					onclick={() => busy === null && onwithdraw()}
					aria-disabled={busy !== null}
					aria-busy={busy === 'withdraw'}
				>
					{#if busy === 'withdraw'}<Spinner />{/if}
					{busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw my dispute'}
				</Button>
			{/if}
		</div>
	{/if}
</section>
