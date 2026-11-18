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
		expect(head).toContain('content="Your pickleball rating, always free."');
	});

	it('names OPEN in the heading', () => {
		const { body } = render(Page);
		expect(body).toMatch(/<h1[^>]*>OPEN<\/h1>/);
	});

	it('names the Open Pickleball Evaluation Network', () => {
		const { body } = render(Page);
		expect(body).toContain('Open Pickleball Evaluation Network');
	});

	it('links to openpb.org', () => {
		const { body } = render(Page);
		expect(body).toContain('href="https://openpb.org/"');
	});

	it('drops the SvelteKit starter text', () => {
		const { body } = render(Page);
		expect(body).not.toContain('SvelteKit');
		expect(body).not.toContain('svelte.dev');
	});
});
