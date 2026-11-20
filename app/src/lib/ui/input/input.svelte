<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList | null } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'h-12 w-full min-w-0 rounded-full border border-field bg-surface px-5 text-base text-secondary transition-colors placeholder:text-faint hover:border-muted aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger aria-invalid:ring-inset disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium',
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'h-12 w-full min-w-0 rounded-full border border-field bg-surface px-5 text-base text-secondary transition-colors placeholder:text-faint hover:border-muted aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger aria-invalid:ring-inset disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium',
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
