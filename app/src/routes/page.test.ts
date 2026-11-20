import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

describe('+page.svelte', () => {
	it('sets the page title', () => {
		const { head } = render(Page);
		expect(head).toContain('<title>OPEN Pickleball</title>');
	});

	it('sets the meta description', () => {
		const { head } = render(Page);
		expect(head).toContain('name="description"');
		expect(head).toContain('content="Record and confirm your pickleball matches, always free."');
		expect(head).not.toMatch(/rating/i);
	});

	it('has one heading, for the home screen', () => {
		const { body } = render(Page);
		expect(body.match(/<h1[\s>]/g)).toHaveLength(1);
		expect(body).toMatch(/<h1[^>]*>Home<\/h1>/);
	});
});
