import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import AccountLayout from './+layout.svelte';

const card = createRawSnippet(() => ({ render: () => '<div data-testid="card">form</div>' }));

describe('account layout', () => {
	it('centers one narrow column for every account page', async () => {
		const screen = await render(AccountLayout, { children: card });
		const column = screen.getByTestId('account-column').element() as HTMLElement;
		const box = column.getBoundingClientRect();
		const free = document.documentElement.clientWidth - box.width;
		expect(box.width).toBeLessThanOrEqual(448);
		expect(Math.abs(box.left - free / 2)).toBeLessThan(1);
		await expect.element(screen.getByTestId('card')).toBeInTheDocument();
	});
});
