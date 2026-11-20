<script lang="ts">
	import type { Snippet } from 'svelte';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
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
	class="flex items-start gap-3 border-l-[3px] px-4 py-3.5 text-base text-secondary {kind ===
	'error'
		? 'border-danger bg-danger-wash [&_svg]:text-danger'
		: 'border-line bg-surface [&_svg]:text-muted'}"
>
	{#if kind === 'offline'}
		<WifiOffIcon aria-hidden="true" class="mt-0.5 size-5 shrink-0" />
	{:else}
		<CircleAlertIcon aria-hidden="true" class="mt-0.5 size-5 shrink-0" />
	{/if}
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
