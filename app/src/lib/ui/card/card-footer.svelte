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

<!-- The actions, one per row. No band or rule above them, unlike the shadcn original. -->
<div bind:this={ref} data-slot="card-footer" class={cn('grid gap-4', className)} {...restProps}>
	{@render children?.()}
</div>
