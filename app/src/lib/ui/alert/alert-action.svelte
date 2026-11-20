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

<!-- A button or link under the text, such as "Try again". -->
<div
	bind:this={ref}
	data-slot="alert-action"
	class={cn('mt-1 justify-self-start group-has-[>svg]/alert:col-start-2', className)}
	{...restProps}
>
	{@render children?.()}
</div>
