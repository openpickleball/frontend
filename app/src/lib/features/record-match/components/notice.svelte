<script lang="ts">
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
	class="flex items-start gap-3 border-l-[3px] border-danger bg-danger-wash px-4 py-3.5 text-[15px] text-secondary"
>
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		class="mt-0.5 size-5 shrink-0 text-danger"
	>
		<circle cx="12" cy="12" r="8.75" />
		<path d="M12 7.5v5.5" />
		<circle cx="12" cy="16.25" r="0.75" fill="currentColor" />
	</svg>
	<div class="grid gap-1.5">
		<strong class="font-semibold">{title}</strong>
		{@render children?.()}
	</div>
</div>
