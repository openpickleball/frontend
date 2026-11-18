import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { Button } from './button/index.js';
import { Badge } from './badge/index.js';
import { Input } from './input/index.js';
import { cn } from './utils.js';

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

describe('index files', () => {
	// Each folder exports its parts through index.ts, which is how features and routes import them.
	const indexes = import.meta.glob('./*/index.ts', { eager: true });

	it('exports something from every component folder', () => {
		const folders = Object.keys(indexes).map((path) => path.split('/')[1]);
		expect(folders).toEqual(
			expect.arrayContaining([
				'alert-dialog',
				'badge',
				'button',
				'input',
				'label',
				'sheet',
				'sonner',
				'theme-toggle',
				'toggle-group'
			])
		);
		for (const [path, mod] of Object.entries(indexes)) {
			expect(Object.keys(mod as object), path).not.toHaveLength(0);
		}
	});
});

describe('cn', () => {
	it('lets the last conflicting utility win', () => {
		expect(cn('px-2 text-muted', 'px-4')).toBe('text-muted px-4');
	});
});

describe('Button', () => {
	it('is the site call to action by default: a pill in the text color on the page color', () => {
		const { body } = render(Button, { props: { children: text('Record a match') } });
		expect(body).toMatch(/<button[^>]*type="button"/);
		for (const cls of ['rounded-full', 'bg-secondary', 'text-primary', 'min-h-12']) {
			expect(body).toContain(cls);
		}
	});

	it('renders a link when it has an href', () => {
		const { body } = render(Button, {
			props: { href: '/record', variant: 'outline', children: text('Record') }
		});
		expect(body).toMatch(/<a[^>]*href="\/record"/);
		expect(body).toContain('border-line');
	});

	it('does not use shadcn color names', () => {
		const { body } = render(Button, { props: { variant: 'destructive', children: text('x') } });
		expect(body).toContain('text-danger');
		expect(body).not.toMatch(/bg-background|text-foreground|bg-destructive|bg-muted-foreground/);
	});
});

describe('Badge', () => {
	it('names its status in text and styles each status', () => {
		for (const [variant, cls] of [
			['pending', 'border-dashed'],
			['confirmed', 'text-confirmed'],
			['disputed', 'text-disputed'],
			['voided', 'text-voided']
		] as const) {
			const { body } = render(Badge, { props: { variant, children: text(variant) } });
			expect(body).toContain(cls);
			expect(body).toContain(`<span>${variant}</span>`);
		}
	});
});

describe('Input', () => {
	it('uses the field border token and shows invalid state through aria-invalid', () => {
		const { body } = render(Input, { props: { 'aria-invalid': true, type: 'email' } });
		expect(body).toContain('border-field');
		expect(body).toContain('aria-invalid="true"');
		expect(body).toContain('aria-invalid:border-danger');
	});
});
