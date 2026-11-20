<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLParagraphElement>> = $props();
</script>

<p
	bind:this={ref}
	data-slot="card-description"
	class={cn('max-w-md text-muted', className)}
	{...restProps}
>
	{@render children?.()}
</p>
