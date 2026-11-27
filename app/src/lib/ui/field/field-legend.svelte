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
		/**
		 * `legend` is a section heading in `section-title`, for a FieldSet with `sectionClass` from
		 * `#lib/ui/section`. `label` names one control, like a field label.
		 */
		variant?: 'legend' | 'label';
	} = $props();
</script>

<legend
	bind:this={ref}
	data-slot="field-legend"
	data-variant={variant}
	class={cn(
		'data-[variant=label]:mb-2 data-[variant=label]:text-base data-[variant=label]:font-semibold data-[variant=label]:text-secondary data-[variant=legend]:section-title data-[variant=legend]:float-left data-[variant=legend]:w-full data-[variant=legend]:[&+*]:clear-left',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</legend>
