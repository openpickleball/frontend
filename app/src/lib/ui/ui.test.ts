import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { Button } from './button/index.js';
import { Badge } from './badge/index.js';
import { Card, CardDescription, CardFooter, CardTitle } from './card/index.js';
import { EmptyDescription, EmptyMedia, EmptyTitle } from './empty/index.js';
import { Input } from './input/index.js';
import { Item, ItemDescription, ItemGroup, ItemTitle } from './item/index.js';
import { LoadingState } from './loading-state/index.js';
import { Skeleton } from './skeleton/index.js';
import { Spinner } from './spinner/index.js';
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
				'card',
				'dialog',
				'empty',
				'input',
				'label',
				'loading-state',
				'sidebar',
				'skeleton',
				'sonner',
				'spinner',
				'theme-toggle'
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

	it('knows the gutter is spacing', () => {
		expect(cn('px-gutter pt-8', 'p-0')).toBe('p-0');
		expect(cn('p-0', 'px-gutter')).toBe('p-0 px-gutter');
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
		expect(body).toContain('border-field');
	});

	it('does not use shadcn color names', () => {
		const { body } = render(Button, { props: { variant: 'destructive', children: text('x') } });
		expect(body).toContain('text-danger');
		expect(body).not.toMatch(/bg-background|text-foreground|bg-destructive|bg-muted-foreground/);
	});
});

describe('Item', () => {
	it('is a row in our tokens, not shadcn color names', () => {
		const { body } = render(Item, { props: { children: text('Display name') } });
		expect(body).toContain('data-slot="item"');
		for (const cls of ['text-secondary', 'min-h-14', 'focus-visible:focus-ring']) {
			expect(body).toContain(cls);
		}
		expect(body).not.toMatch(/bg-muted|text-muted-foreground|border-border|ring-ring/);
	});

	it('styles its title and description with our tokens', () => {
		expect(render(ItemTitle, { props: { children: text('x') } }).body).toContain('font-semibold');
		const description = render(ItemDescription, { props: { children: text('x') } }).body;
		expect(description).toContain('text-muted');
		expect(description).not.toContain('text-muted-foreground');
	});

	it('groups rows in a list with a line between them', () => {
		const { body } = render(ItemGroup, { props: { children: text('x') } });
		expect(body).toMatch(/<ul[^>]*divide-y divide-line/);
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

describe('Empty', () => {
	it('renders its title as a heading, h2 by default and h1 on request', () => {
		const h2 = render(EmptyTitle, { props: { children: text('No matches yet') } });
		expect(h2.body).toMatch(/<h2[^>]*data-slot="empty-title"/);
		const h1 = render(EmptyTitle, { props: { level: 'h1', children: text('Not found') } });
		expect(h1.body).toMatch(/<h1[^>]*class="[^"]*page-title/);
	});

	it('uses the site tokens, not shadcn color names', () => {
		const { body } = render(EmptyDescription, { props: { children: text('x') } });
		expect(body).toContain('text-muted');
		expect(body).not.toMatch(/text-muted-foreground|bg-muted/);
		const media = render(EmptyMedia, { props: { variant: 'icon', children: text('x') } });
		expect(media.body).toContain('bg-surface');
		expect(media.body).not.toMatch(/bg-muted|text-foreground/);
	});
});

describe('Card', () => {
	it('is a borderless section, so a title id in aria-labelledby makes it a region', () => {
		const { body } = render(Card, {
			props: { 'aria-labelledby': 'card-title', children: text('x') }
		});
		expect(body).toMatch(/<section[^>]*data-slot="card"/);
		expect(body).toContain('aria-labelledby="card-title"');
		expect(body).not.toMatch(/ring-1|border|rounded-xl|shadow/);
	});

	it('renders its title as a heading, h2 by default and h1 on request', () => {
		const h2 = render(CardTitle, { props: { children: text('Ratings') } });
		expect(h2.body).toMatch(/<h2[^>]*data-slot="card-title"/);
		const h1 = render(CardTitle, { props: { level: 'h1', children: text('Sign in') } });
		expect(h1.body).toMatch(/<h1[^>]*class="[^"]*page-title/);
	});

	it('uses the site tokens, not shadcn color names', () => {
		const description = render(CardDescription, { props: { children: text('x') } });
		expect(description.body).toContain('text-muted');
		const footer = render(CardFooter, { props: { children: text('x') } });
		for (const { body } of [description, footer]) {
			expect(body).not.toMatch(/text-muted-foreground|bg-muted|bg-card|border-t/);
		}
	});
});

describe('Skeleton and Spinner', () => {
	it('are decoration, and their motion stops under reduced motion', () => {
		const skeleton = render(Skeleton, { props: { class: 'h-4' } }).body;
		expect(skeleton).toContain('aria-hidden="true"');
		expect(skeleton).toContain('bg-line');
		expect(skeleton).toContain('motion-safe:animate-pulse');
		expect(skeleton).not.toMatch(/bg-muted|(?<!motion-safe:)animate-pulse/);
		const spinner = render(Spinner).body;
		expect(spinner).toContain('aria-hidden="true"');
		expect(spinner).toContain('motion-safe:animate-spin');
		expect(spinner).not.toMatch(/(?<!motion-safe:)animate-spin/);
	});

	it('lets a lone spinner name itself for screen readers', () => {
		const { body } = render(Spinner, { props: { role: 'status', 'aria-label': 'Loading' } });
		expect(body).toContain('role="status"');
		expect(body).not.toContain('aria-hidden');
	});
});

describe('LoadingState', () => {
	it('is a busy status region whose text says what is loading', () => {
		const { body } = render(LoadingState, { props: { label: 'Loading your matches…' } });
		expect(body).toMatch(/<div[^>]*role="status"[^>]*aria-busy="true"/);
		expect(body).toContain('Loading your matches…');
	});

	it('hides the placeholder shapes from screen readers', () => {
		const list = render(LoadingState, { props: { label: 'x', variant: 'list', rows: 2 } }).body;
		expect(list.match(/data-slot="skeleton"/g)).toHaveLength(8);
		const detail = render(LoadingState, { props: { label: 'x', variant: 'detail' } }).body;
		expect(detail).toContain('data-slot="skeleton"');
		expect(detail).toContain('aria-hidden="true"');
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
