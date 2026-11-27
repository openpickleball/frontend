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

<!-- A span, so a row can be a link or a button. It wraps rather than cutting the text off. -->
<span
	bind:this={ref}
	data-slot="item-title"
	class={cn('font-semibold wrap-anywhere', className)}
	{...restProps}
>
	{@render children?.()}
</span>
