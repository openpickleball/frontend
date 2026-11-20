// A text box with a list of matches under it (WAI-ARIA combobox), on Bits UI's Combobox.
// Bits UI owns the keys, the highlighted option and the ARIA wiring. Style the input itself
// with the Input component, passed through Combobox.Input's `child` snippet.
import { Combobox as ComboboxPrimitive } from 'bits-ui';
import Content from './combobox-content.svelte';
import Item from './combobox-item.svelte';

const Root = ComboboxPrimitive.Root;
const Input = ComboboxPrimitive.Input;

export {
	Root,
	Input,
	Content,
	Item,
	//
	Root as Combobox,
	Input as ComboboxInput,
	Content as ComboboxContent,
	Item as ComboboxItem
};
