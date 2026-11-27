<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLUListElement>> = $props();
</script>

<!--
	A list, not a div with role="list": each row sits in an <li>, so a screen reader counts them.
	A line between rows and none above or below, because it sits under a section title and the
	next section's line closes it (app/AGENTS.md, Layout).
-->
<ul
	bind:this={ref}
	data-slot="item-group"
	class={cn('flex w-full flex-col divide-y divide-line', className)}
	{...restProps}
>
	{@render children?.()}
</ul>
