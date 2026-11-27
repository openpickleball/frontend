<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CloudUploadIcon from '@lucide/svelte/icons/cloud-upload';
	import { Alert, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { expiredText, matchSummary, problemLines, waitingText, waitingTitle } from '../copy.js';
	import { MAX_QUEUE_AGE_DAYS, offlineQueue, type OfflineQueue } from '../queue.svelte.js';
	import type { QueuedMatch } from '../types.js';

	let {
		queue = offlineQueue,
		onfix
	}: {
		/** The queue to show. Tests pass their own. */
		queue?: OfflineQueue;
		/** Open the record form with this refused match, so the player can fix it. */
		onfix: (item: QueuedMatch) => void;
	} = $props();

	const expired = $derived(expiredText(queue.expired, MAX_QUEUE_AGE_DAYS));
	const waiting = $derived(queue.waiting.length);
	// "Send now" when sending again could help: online, not already sending, not waiting on sign-in.
	// After two-factor is set up or confirmed, sending again works, so it is offered then too.
	const canSend = $derived(
		queue.online &&
			!queue.sending &&
			(queue.reason === 'retry' || queue.reason === 'idle' || queue.reason === 'mfa')
	);
</script>

{#if expired}
	<section aria-label="Matches deleted" class="grid gap-4 pt-4">
		<Alert data-testid="queue-expired">
			<CircleAlertIcon aria-hidden="true" />
			<AlertTitle>Matches deleted</AlertTitle>
			<AlertDescription class="grid gap-2">
				<p>{expired}</p>
				<div>
					<Button
						variant="outline"
						size="sm"
						class="min-h-11"
						onclick={() => void queue.dismissExpired()}
					>
						OK
					</Button>
				</div>
			</AlertDescription>
		</Alert>
	</section>
{/if}

{#if queue.unsent > 0}
	<section aria-label="Matches not sent yet" class="grid gap-4 pt-4 pb-4">
		{#if waiting > 0}
			<Alert data-testid="queue-waiting">
				<CloudUploadIcon aria-hidden="true" />
				<AlertTitle>{waitingTitle(waiting)}</AlertTitle>
				<AlertDescription class="grid gap-2">
					<p>{waitingText(waiting, queue.reason, queue.online)}</p>
					{#if queue.sending}
						<p class="flex items-center gap-2 text-muted"><Spinner /> Sending…</p>
					{:else if canSend}
						<div>
							<Button
								variant="outline"
								size="sm"
								class="min-h-11"
								onclick={() => void queue.flush()}
							>
								Send now
							</Button>
						</div>
					{/if}
				</AlertDescription>
			</Alert>
		{/if}
		{#each queue.refused as item (item.id)}
			{@const summaryId = `queued-${item.id}`}
			<Alert variant="destructive" data-testid="queue-refused">
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>This match wasn't recorded</AlertTitle>
				<AlertDescription class="grid gap-2">
					<p id={summaryId} class="text-secondary">{matchSummary(item)}</p>
					<ul class="grid gap-1">
						{#each problemLines(item) as line (line)}
							<li>{line}</li>
						{/each}
					</ul>
					<div class="flex flex-wrap gap-3">
						{#if item.problem?.kind === 'invalid'}
							<Button
								size="sm"
								class="min-h-11"
								aria-describedby={summaryId}
								onclick={() => onfix(item)}
							>
								Fix and record again
							</Button>
						{/if}
						<Button
							variant="outline"
							size="sm"
							class="min-h-11"
							aria-describedby={summaryId}
							onclick={() => void queue.remove(item.id)}
						>
							Delete
						</Button>
					</div>
				</AlertDescription>
			</Alert>
		{/each}
	</section>
{/if}
