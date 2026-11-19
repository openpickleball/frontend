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

<!-- A label, the control, and its hint and error, stacked. -->
<div
	bind:this={ref}
	data-slot="field"
	class={cn('group/field grid gap-2', className)}
	{...restProps}
>
	{@render children?.()}
</div>
