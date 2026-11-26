<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	export const buttonVariants = tv({
		base: "inline-flex shrink-0 items-center justify-center gap-2.5 rounded-full border border-transparent font-semibold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				// The site call to action: solid text color on the page color.
				default: 'bg-secondary text-primary hover:bg-muted',
				// border-field, not border-line: the faint line color is hard to see on ivory. On hover the
				// border takes the text color: a surface background is nearly invisible in black.
				outline: 'border-field text-secondary hover:border-secondary',
				// Outline in the danger color. Use destructive-solid only inside a confirm dialog.
				destructive: 'border-current text-danger hover:bg-danger-wash',
				'destructive-solid': 'bg-danger text-primary hover:bg-danger/90',
				ghost: 'px-1 font-medium text-secondary hover:text-muted',
				link: 'px-0 font-semibold text-secondary underline underline-offset-4 hover:text-muted'
			},
			size: {
				default: 'min-h-12 px-7 py-3 text-base',
				sm: 'min-h-10 px-4 py-2 text-base',
				icon: 'size-9 p-0',
				// A link inside a sentence: wraps with the text and takes its size.
				inline: 'inline min-h-0 p-0 text-base whitespace-normal'
			}
		},
		compoundVariants: [
			{ variant: ['ghost', 'link'], size: ['default', 'sm'], class: 'min-h-0 px-1 py-1' }
		],
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<!-- The caller resolves the link: pass href={resolve(...)} for app routes. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
