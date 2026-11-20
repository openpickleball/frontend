<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const badgeVariants = tv({
		// Outline pill with a dot. Status always names itself in text, so color is never the only signal.
		base: 'inline-flex h-6 w-fit shrink-0 items-center gap-2 rounded-full border border-current pr-3 pl-2.5 text-sm leading-none font-medium whitespace-nowrap before:size-2 before:rounded-full before:bg-current',
		variants: {
			variant: {
				// Neutral and dashed with a hollow dot.
				pending:
					'border-dashed text-pending before:bg-transparent before:ring-1 before:ring-current before:ring-inset',
				confirmed: 'text-confirmed',
				disputed: 'text-disputed',
				voided: 'text-voided before:h-0.5 before:w-2',
				neutral: 'text-muted before:hidden'
			}
		},
		defaultVariants: {
			variant: 'neutral'
		}
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = 'neutral',
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
	} = $props();
</script>

<svelte:element
	this={href ? 'a' : 'span'}
	bind:this={ref}
	data-slot="badge"
	{href}
	class={cn(badgeVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
