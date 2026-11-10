import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

describe('+page.svelte', () => {
	it('server-renders a heading', () => {
		const { body } = render(Page);
		expect(body).toContain('<h1');
	});
});
