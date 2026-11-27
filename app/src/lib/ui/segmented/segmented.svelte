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
		options: readonly { value: string; label: string }[];
		value: string;
		/** Classes for the track, for example to let the pills wrap. */
		class?: string;
	} = $props();
</script>

<FieldSet>
	<FieldLegend variant="label">{label}</FieldLegend>
	<RadioGroup bind:value {name} orientation="horizontal" class={className}>
		{#each options as option (option.value)}
			<RadioGroupItem value={option.value}>{option.label}</RadioGroupItem>
		{/each}
	</RadioGroup>
</FieldSet>
