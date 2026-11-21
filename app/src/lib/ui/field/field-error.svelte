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

<!-- Announced as soon as it appears. The "!" means the message is not carried by color alone. -->
<div
	bind:this={ref}
	role="alert"
	data-slot="field-error"
	class={cn('flex items-start gap-2 text-sm font-medium text-danger', className)}
	{...restProps}
>
	<span
		aria-hidden="true"
		class="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-danger text-xs leading-none font-bold text-primary"
	>
		!
	</span>
	<span>{@render children?.()}</span>
</div>
