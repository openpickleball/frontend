<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<!-- A div, so the text can be one paragraph or several. -->
<div
	bind:this={ref}
	data-slot="empty-description"
	class={cn('grid gap-2 text-muted', className)}
	{...restProps}
>
	{@render children?.()}
</div>
