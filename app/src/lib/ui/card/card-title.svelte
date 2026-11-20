<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	// Not in the shadcn original, which renders a div. The title is a heading, so the caller says
	// which level: h1 when the card is the whole page, h2 when it sits under a page title.
	let {
		ref = $bindable(null),
		level = 'h2',
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLHeadingElement>> & { level?: 'h1' | 'h2' } = $props();
</script>

<svelte:element
	this={level}
	bind:this={ref}
	data-slot="card-title"
	class={cn(level === 'h1' ? 'page-title' : 'text-2xl font-semibold tracking-tight', className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
