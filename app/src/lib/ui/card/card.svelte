<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<!--
	Borderless and flat, unlike the shadcn original: the card gives its header, content and footer
	the same spacing, not a box. A section, so aria-labelledby pointing at its title makes it a region.
-->
<section
	bind:this={ref}
	data-slot="card"
	class={cn('flex flex-col gap-8 text-secondary', className)}
	{...restProps}
>
	{@render children?.()}
</section>
