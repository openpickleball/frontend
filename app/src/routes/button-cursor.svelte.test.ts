import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import './layout.css';
import Button from '#lib/ui/button/button.svelte';

const label = createRawSnippet(() => ({ render: () => '<span>Go</span>' }));

describe('Button cursor', () => {
	it('shows a pointer on an enabled button', async () => {
		const screen = await render(Button, { children: label });
		const el = screen.getByRole('button').element();
		expect(getComputedStyle(el).cursor).toBe('pointer');
	});

	it('keeps the default cursor on a disabled button', async () => {
		const screen = await render(Button, { children: label, disabled: true });
		const el = screen.getByRole('button').element();
		expect(getComputedStyle(el).cursor).toBe('default');
	});
});
