<script lang="ts">
	import { Skeleton } from '#lib/ui/skeleton/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { cn } from '#lib/ui/utils.js';

	/**
	 * The one loading pattern. A status line says what is loading, with a spinner beside it.
	 * The line is the live region for screen readers, so the skeleton shapes under it are
	 * decoration and stay hidden. `aria-busy` marks the region as not ready yet.
	 *
	 * - `line`: just the status line, for a short wait where the content has no set shape.
	 * - `list`: the line, then rows of the shape of a match row (a caption, then two team lines).
	 * - `detail`: the line, then the shape of a match page (a heading, a score and a panel).
	 */
	let {
		label,
		variant = 'line',
		rows = 3,
		class: className
	}: {
		label: string;
		variant?: 'line' | 'list' | 'detail';
		/** With `list`: how many rows to draw. */
		rows?: number;
		class?: string;
	} = $props();

	const placeholders = $derived(Array.from({ length: rows }, (_, index) => index));
</script>

<div role="status" aria-busy="true" class={cn('grid gap-4', className)} data-slot="loading-state">
	<p class="flex items-center gap-2.5 text-muted">
		<Spinner />
		{label}
	</p>
	{#if variant === 'list'}
		<div class="grid border-b border-line" aria-hidden="true">
			{#each placeholders as index (index)}
				<div class="grid gap-3 border-t border-line py-4">
					<div class="flex items-center justify-between gap-3">
						<Skeleton class="h-4 w-40 max-w-[60%]" />
						<Skeleton class="h-5 w-20 rounded-full" />
					</div>
					<div class="grid gap-2">
						<Skeleton class="h-5 w-2/3" />
						<Skeleton class="h-5 w-1/2" />
					</div>
				</div>
			{/each}
		</div>
	{:else if variant === 'detail'}
		<div class="grid gap-4" aria-hidden="true">
			<Skeleton class="h-4 w-48 max-w-[70%]" />
			<Skeleton class="h-10 w-3/4" />
			<Skeleton class="h-6 w-32" />
			<Skeleton class="mt-4 h-24 w-full" />
			<Skeleton class="h-28 w-full" />
		</div>
	{/if}
</div>
