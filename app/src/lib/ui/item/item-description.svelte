<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> = $props();
</script>

<!-- A span, so a row can be a link or a button. -->
<span
	bind:this={ref}
	data-slot="item-description"
	class={cn('text-sm text-muted', className)}
	{...restProps}
>
	{@render children?.()}
</span>
