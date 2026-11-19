<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const inputGroupAddonVariants = tv({
		base: 'flex items-center justify-center gap-2 text-sm select-none',
		variants: {
			align: {
				'inline-start': 'order-first pl-3',
				'inline-end': 'order-last pr-1.5'
			}
		},
		defaultVariants: {
			align: 'inline-end'
		}
	});

	export type InputGroupAddonAlign = VariantProps<typeof inputGroupAddonVariants>['align'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		align = 'inline-end',
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		align?: InputGroupAddonAlign;
	} = $props();
</script>

<div
	bind:this={ref}
	role="group"
	data-slot="input-group-addon"
	data-align={align}
	class={cn(inputGroupAddonVariants({ align }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
