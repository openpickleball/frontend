<script lang="ts">
	import type { Match } from '#lib/domain/index.js';
	import { Alert, AlertDescription } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import type { HoldState, MatchAction } from '../cache.svelte.js';
	import { matchStatusCopy, panelTone, type PanelAction, type PanelTone } from '../status.js';

	let {
		match,
		hold,
		busy = null,
		error = null,
		recorded = false,
		corrected = false,
		correctHref,
		replacedByHref,
		onconfirm,
		ondispute,
		onwithdraw = () => {},
		onvouch = () => {}
	}: {
		match: Match;
		/** The match's hold, when the holds list says it is held. `MatchOut` can't say so. */
		hold?: HoldState;
		/** The action in flight, so its button waits. */
		busy?: MatchAction | null;
		/** Why the last action failed. */
		error?: string | null;
		/** The player just recorded this match, so the panel says so. */
		recorded?: boolean;
		/** The player just saved this match as a correction of another one, so the panel says so. */
		corrected?: boolean;
		/** Where "Correct the score" goes: the correction page for this match. */
		correctHref?: string;
		/**
		 * The match that replaced this one, when the player corrected it in this visit. `MatchOut`
		 * doesn't link the two, so the app only knows it then.
		 */
		replacedByHref?: string;
		onconfirm: () => void;
		/** Opens the dispute dialog. The dialog's own button disputes. */
		ondispute: () => void;
		/** Opens the withdraw dialog. The dialog's own button withdraws. */
		onwithdraw?: () => void;
		/** Opens the vouch dialog. The dialog's own button vouches. */
		onvouch?: () => void;
	} = $props();

	const panel = $derived(matchStatusCopy(match, hold));
	const held = $derived(hold !== undefined && match.status !== 'voided');
	const offers = (action: PanelAction) => panel.actions.includes(action);
	// One panel style for every state. Only the edge changes, and it carries the meaning.
	const EDGE: Record<PanelTone, string> = {
		disputed: 'border-l-disputed',
		held: 'border-l-warning',
		action: 'border-l-secondary',
		plain: 'border-l-line'
	};
	const tone = $derived(panelTone(match, hold));
</script>

<section
	class="mt-8 border border-l-4 border-line bg-surface px-5 py-5 {EDGE[tone]}"
	aria-labelledby="status-heading"
	data-testid="status-panel"
	data-status={match.status}
	data-held={held || undefined}
	data-tone={tone}
>
	<h2 id="status-heading" tabindex="-1" class="text-lg font-semibold outline-none">
		{panel.title}
	</h2>
	{#if corrected}
		<p class="mt-2 max-w-md text-secondary">
			You just corrected this match, so it has a new code and the old match is voided.
		</p>
	{:else if recorded}
		<p class="mt-2 max-w-md text-secondary">You just recorded this match.</p>
	{/if}
	<p class="mt-2 max-w-md text-muted">{panel.text}</p>
	{#if replacedByHref && match.status === 'voided'}
		<p class="mt-2 max-w-md">
			<Button variant="link" size="inline" href={replacedByHref}>See the corrected match</Button>
		</p>
	{/if}
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
			{#if offers('vouch')}
				<!-- The main button when it is the only one, else after Confirm and Dispute. -->
				<Button
					id="vouch-button"
					variant={panel.actions.length === 1 ? 'default' : 'outline'}
					onclick={() => busy === null && onvouch()}
					aria-disabled={busy !== null}
					aria-busy={busy === 'vouch'}
				>
					{#if busy === 'vouch'}<Spinner />{/if}
					{busy === 'vouch' ? 'Vouching…' : 'This match really happened'}
				</Button>
			{/if}
			{#if offers('correct') && correctHref}
				<!-- A link to the correction page. Never the main button: a match doesn't wait on it. -->
				<Button
					id="correct-button"
					variant="outline"
					href={busy === null ? correctHref : undefined}
					aria-disabled={busy !== null || undefined}
				>
					Correct the score
				</Button>
			{/if}
		</div>
	{/if}
</section>
