<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import type { Snippet } from 'svelte';

	let {
		title,
		children,
		id,
		element = $bindable(null)
	}: {
		title: string;
		children?: Snippet;
		id?: string;
		/** The box itself, so the form can move focus to it. */
		element?: HTMLElement | null;
	} = $props();
</script>

<!-- An error is announced as soon as it appears. -->
<div
	{id}
	bind:this={element}
	role="alert"
	tabindex="-1"
	class="flex items-start gap-3 border-l-4 border-danger bg-danger-wash px-4 py-3.5 text-base text-secondary"
>
	<CircleAlertIcon aria-hidden="true" class="mt-0.5 size-5 shrink-0 text-danger" />
	<div class="grid gap-1.5">
		<strong class="font-semibold">{title}</strong>
		{@render children?.()}
	</div>
</div>
