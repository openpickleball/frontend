<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'legend',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLLegendElement>> & {
		/** `legend` is a section heading. `label` names one control, like a field label. */
		variant?: 'legend' | 'label';
	} = $props();
</script>

<legend
	bind:this={ref}
	data-slot="field-legend"
	data-variant={variant}
	class={cn(
		'font-semibold text-secondary data-[variant=label]:mb-2 data-[variant=label]:text-base data-[variant=label]:leading-snug data-[variant=legend]:text-xl',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</legend>
