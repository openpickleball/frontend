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

<!-- A span, so a row can be a link or a button. Icons take the muted color. -->
<span
	bind:this={ref}
	data-slot="item-actions"
	class={cn('flex shrink-0 items-center gap-2 text-muted [&_svg]:size-5', className)}
	{...restProps}
>
	{@render children?.()}
</span>
