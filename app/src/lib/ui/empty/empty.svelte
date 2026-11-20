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

<!-- Left aligned, like the rest of the app, unlike the centered shadcn default. -->
<div
	bind:this={ref}
	data-slot="empty"
	class={cn('flex w-full min-w-0 flex-col items-start gap-4', className)}
	{...restProps}
>
	{@render children?.()}
</div>
