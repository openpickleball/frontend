import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { Section } from './index.js';

const html = (markup: string) => createRawSnippet(() => ({ render: () => markup }));

describe('Section', () => {
	it('is a region named by its h2, which uses section-title', async () => {
		const screen = await render(Section, {
			title: 'Recent matches',
			children: html('<p>Content</p>')
		});
		const region = screen.getByRole('region', { name: 'Recent matches' });
		await expect.element(region).toBeVisible();
		const heading = screen.getByRole('heading', { level: 2, name: 'Recent matches' });
		await expect.element(heading).toHaveClass('section-title');
		const section = region.element();
		const id = heading.element().id;
		expect(id).not.toBe('');
		expect(section.getAttribute('aria-labelledby')).toBe(id);
		expect(section.tagName).toBe('SECTION');
		await expect.element(screen.getByText('Content')).toBeVisible();
	});

	it('draws the line above with the section spacing', async () => {
		const screen = await render(Section, { title: 'Ratings' });
		const section = screen.getByRole('region', { name: 'Ratings' });
		for (const cls of ['mt-12', 'border-t', 'border-line', 'pt-4']) {
			await expect.element(section).toHaveClass(cls);
		}
	});

	it('gives two sections different heading ids', async () => {
		const first = await render(Section, { title: 'One' });
		const second = await render(Section, { title: 'Two' });
		const a = first.getByRole('heading', { name: 'One' }).element().id;
		const b = second.getByRole('heading', { name: 'Two' }).element().id;
		expect(a).not.toBe(b);
	});

	it('keeps a given heading id, so links and focus can use it', async () => {
		const screen = await render(Section, {
			title: 'Name and privacy',
			headingId: 'settings-heading'
		});
		const region = screen.getByRole('region', { name: 'Name and privacy' });
		expect(region.element().getAttribute('aria-labelledby')).toBe('settings-heading');
		await expect
			.element(screen.getByRole('heading', { name: 'Name and privacy' }))
			.toHaveAttribute('id', 'settings-heading');
	});

	it('shows the aside next to the title', async () => {
		const screen = await render(Section, {
			title: 'Disputed matches',
			aside: html('<span>2 matches</span>')
		});
		const heading = screen.getByRole('heading', { name: 'Disputed matches' }).element();
		expect(heading.nextElementSibling?.textContent).toBe('2 matches');
	});

	it('puts an info button right after the title, inside the title row', async () => {
		const screen = await render(Section, {
			title: 'In progress',
			info: html('<button type="button" aria-label="What does on hold mean?">i</button>'),
			children: html('<p>Content</p>')
		});
		const heading = screen.getByRole('heading', { name: 'In progress' }).element();
		const button = screen.getByRole('button', { name: 'What does on hold mean?' }).element();
		expect(heading.nextElementSibling).toBe(button);
		expect(heading.contains(button)).toBe(false);
	});
});
