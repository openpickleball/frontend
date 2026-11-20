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

<!-- The fields, or the body of a result. -->
<div bind:this={ref} data-slot="card-content" class={cn('grid gap-4', className)} {...restProps}>
	{@render children?.()}
</div>
