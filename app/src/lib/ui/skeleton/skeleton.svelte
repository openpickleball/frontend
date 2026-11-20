<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	// A placeholder block. It is decoration, so it is hidden from screen readers: the loading
	// state around it carries the role="status" text. The pulse stops under reduced motion.
	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="skeleton"
	aria-hidden="true"
	class={cn('bg-line motion-safe:animate-pulse', className)}
	{...restProps}
></div>
