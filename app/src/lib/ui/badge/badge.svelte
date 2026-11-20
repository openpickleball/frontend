<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const badgeVariants = tv({
		// Outline pill with a dot. Status always names itself in text, so color is never the only signal.
		base: "inline-flex h-[26px] w-fit shrink-0 items-center gap-[7px] rounded-full border border-current pr-[11px] pl-2.5 text-sm leading-none font-medium whitespace-nowrap before:size-[7px] before:rounded-full before:bg-current before:content-['']",
		variants: {
			variant: {
				// Neutral and dashed with a hollow dot.
				pending:
					'border-dashed text-pending before:bg-transparent before:shadow-[inset_0_0_0_1.5px_currentColor]',
				confirmed: 'text-confirmed',
				disputed: 'text-disputed',
				voided: 'text-voided before:h-[1.5px] before:w-[9px]',
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
