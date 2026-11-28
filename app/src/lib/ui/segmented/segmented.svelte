<script lang="ts">
	import { FieldLegend, FieldSet } from '#lib/ui/field/index.js';
	import { RadioGroup, RadioGroupItem } from '#lib/ui/radio-group/index.js';

	/**
	 * A segmented control: one choice from a few, as pills in a rounded track. It is a radio group
	 * named by its legend, so arrow keys move between the pills and pick one.
	 */
	let {
		name,
		label,
		options,
		value = $bindable(),
		class: className
	}: {
		/** Names the radio group. */
		name: string;
		label: string;
		/** `count`, when set, follows the label, such as "Needs you 3", and is part of its name. */
		options: readonly { value: string; label: string; count?: number }[];
		value: string;
		/** Classes for the track, for example to let the pills wrap. */
		class?: string;
	} = $props();
</script>

<FieldSet>
	<FieldLegend variant="label">{label}</FieldLegend>
	<RadioGroup bind:value {name} orientation="horizontal" class={className}>
		{#each options as option (option.value)}
			<!-- With a count, the pill's name says it with a comma, "Needs you, 3", rather than run the
			     two together. -->
			<RadioGroupItem
				value={option.value}
				aria-label={option.count === undefined ? undefined : `${option.label}, ${option.count}`}
			>
				{option.label}
				{#if option.count !== undefined}
					<span class="ms-1.5 font-normal tabular-nums" data-testid="pill-count">
						{option.count}
					</span>
				{/if}
			</RadioGroupItem>
		{/each}
	</RadioGroup>
</FieldSet>
