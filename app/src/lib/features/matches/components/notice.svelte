<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '#lib/ui/button/index.js';

	let {
		kind,
		title,
		onretry,
		children
	}: {
		/** `error` is announced at once. `offline` is a polite status. */
		kind: 'error' | 'offline';
		title: string;
		/** Shows a "Try again" button. */
		onretry?: () => void;
		children?: Snippet;
	} = $props();
</script>

<div
	role={kind === 'error' ? 'alert' : 'status'}
	class="flex items-start gap-3 border-l-[3px] px-4 py-3.5 text-[15px] text-secondary {kind ===
	'error'
		? 'border-danger bg-danger-wash [&_svg]:text-danger'
		: 'border-line bg-surface [&_svg]:text-muted'}"
>
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		class="mt-0.5 size-5 shrink-0"
	>
		{#if kind === 'offline'}
			<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4.2-2.5M19 13a10 10 0 0 0-3-2" />
			<circle cx="12" cy="19.5" r="0.75" fill="currentColor" />
		{:else}
			<circle cx="12" cy="12" r="8.75" />
			<path d="M12 7.5v5.5" />
			<circle cx="12" cy="16.25" r="0.75" fill="currentColor" />
		{/if}
	</svg>
	<div class="grid justify-items-start gap-1">
		<strong class="font-semibold">{title}</strong>
		{#if children}
			<p class="text-muted">{@render children()}</p>
		{/if}
		{#if onretry}
			<Button variant="outline" size="sm" class="mt-2" onclick={onretry}>Try again</Button>
		{/if}
	</div>
</div>
