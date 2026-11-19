<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	// A notice with a colored rule on the left. The icon is the first child and takes the color.
	export const alertVariants = tv({
		base: 'group/alert relative grid w-full gap-1 border-l-[3px] px-4 py-3.5 text-left text-[15px] text-secondary has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:mt-0.5 *:[svg]:size-5',
		variants: {
			variant: {
				default: 'border-line bg-surface *:[svg]:text-muted',
				destructive: 'border-danger bg-danger-wash *:[svg]:text-danger',
				success: 'border-confirmed bg-confirmed-wash *:[svg]:text-confirmed'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type AlertVariant = VariantProps<typeof alertVariants>['variant'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: AlertVariant;
	} = $props();
</script>

<!-- An error is announced as soon as it appears. Anything else is a polite status. -->
<div
	bind:this={ref}
	data-slot="alert"
	role={variant === 'destructive' ? 'alert' : 'status'}
	class={cn(alertVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
