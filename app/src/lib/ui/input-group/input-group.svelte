<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...props
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<!-- Looks like one input (see ui/input) with an addon inside it. The group shows focus and errors. -->
<div
	bind:this={ref}
	data-slot="input-group"
	role="group"
	class={cn(
		'flex h-12 w-full min-w-0 items-center rounded-full border border-field bg-surface transition-colors hover:border-muted has-[[data-slot=input-group-control]:focus-visible]:focus-ring has-[[data-slot=input-group-control][aria-invalid=true]]:border-danger has-[[data-slot=input-group-control][aria-invalid=true]]:shadow-[inset_0_0_0_1px_var(--color-danger)] has-disabled:opacity-45',
		className
	)}
	{...props}
>
	{@render children?.()}
</div>
