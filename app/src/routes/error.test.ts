import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const state = vi.hoisted(() => ({ status: 404 }));
vi.mock('$app/state', () => ({ page: state }));

import ErrorPage from './+error.svelte';

// Server output has hydration comments and escaped apostrophes. Compare plain markup.
const markup = (html: string) => html.replace(/<!--.*?-->/g, '').replace(/&#39;/g, "'");
const renderPage = () => {
	const { head, body } = render(ErrorPage);
	return { head: markup(head), body: markup(body) };
};

describe('+error.svelte', () => {
	it('says the page was not found on a 404, with a link home', () => {
		state.status = 404;
		const { head, body } = renderPage();
		expect(head).toContain("<title>We couldn't find this page | OPEN Pickleball</title>");
		expect(body).toMatch(/<h1[^>]*>We couldn't find this page<\/h1>/);
		expect(body).toMatch(/<a[^>]*href="\/"[^>]*>Back to home/);
	});

	it('says something went wrong for any other status', () => {
		state.status = 500;
		const { body } = renderPage();
		expect(body).toMatch(/<h1[^>]*>Something went wrong<\/h1>/);
		expect(body).not.toContain('find this page');
	});

	it('never shows the raw status text or mentions ratings', () => {
		state.status = 404;
		const { body } = renderPage();
		expect(body).not.toMatch(/Not Found|404|rating/i);
	});
});
