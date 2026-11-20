<script lang="ts">
	import { FieldLegend, FieldSet } from '#lib/ui/field/index.js';
	import { RadioGroup, RadioGroupItem } from '#lib/ui/radio-group/index.js';

	let {
		name,
		label,
		options,
		value = $bindable()
	}: {
		/** Names the radio group. */
		name: string;
		label: string;
		options: readonly { value: string; label: string }[];
		value: string;
	} = $props();
</script>

<FieldSet>
	<FieldLegend variant="label">{label}</FieldLegend>
	<RadioGroup bind:value {name} orientation="horizontal">
		{#each options as option (option.value)}
			<RadioGroupItem value={option.value}>{option.label}</RadioGroupItem>
		{/each}
	</RadioGroup>
</FieldSet>
