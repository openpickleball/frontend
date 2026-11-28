import { describe, expect, it, vi } from 'vitest';
import {
	cameFromMatch,
	isPlainClick,
	matchBackTarget,
	type Arrival,
	type BackTarget
} from './back-link.js';

const paths = { home: '/', matches: '/matches' };
const nothing = () => undefined;

function from(routeId: string | null, address: string, params: Record<string, string> = {}) {
	return { route: { id: routeId }, url: new URL(address, 'http://localhost'), params };
}

function arrival(type: string, source: Arrival['from']): Arrival {
	return { type, from: source };
}

describe('matchBackTarget', () => {
	it('goes back to Home in history after a link from Home', () => {
		expect(matchBackTarget(arrival('link', from('/', '/')), paths, nothing)).toEqual({
			href: '/',
			label: 'Home',
			back: true
		});
	});

	it('keeps the Matches filter and page', () => {
		const target = matchBackTarget(
			arrival('link', from('/matches', '/matches?show=needs-you&page=2')),
			paths,
			nothing
		);
		expect(target).toEqual({
			href: '/matches?show=needs-you&page=2',
			label: 'Matches',
			back: true
		});
	});

	it('drops an old Disputed or On hold filter, and keeps the page', () => {
		for (const show of ['disputed', 'on-hold']) {
			const target = matchBackTarget(
				arrival('link', from('/matches', `/matches?show=${show}&page=2`)),
				paths,
				nothing
			);
			expect(target).toEqual({ href: '/matches?page=2', label: 'Matches', back: true });
		}
	});

	it('drops an unknown filter, a bad page and anything else in the query', () => {
		const target = matchBackTarget(
			arrival('goto', from('/matches', '/matches?show=waiting&page=x&utm=1')),
			paths,
			nothing
		);
		expect(target).toEqual({ href: '/matches', label: 'Matches', back: true });
	});

	it('links to Matches for a shared link, with no page before it', () => {
		expect(matchBackTarget(arrival('enter', null), paths, nothing)).toEqual({
			href: '/matches',
			label: 'Matches',
			back: false
		});
	});

	it('links to the page instead of going back after back or forward', () => {
		// After back or forward, the page it came from may be after this one in history.
		expect(matchBackTarget(arrival('popstate', from('/', '/')), paths, nothing)).toEqual({
			href: '/',
			label: 'Home',
			back: false
		});
	});

	it('links to Matches from any other page, such as the record page', () => {
		expect(matchBackTarget(arrival('goto', from('/record', '/record')), paths, nothing)).toEqual({
			href: '/matches',
			label: 'Matches',
			back: false
		});
	});

	it('after a correction, links to where the old match went, not back to the form', () => {
		const home: BackTarget = { href: '/', label: 'Home', back: true };
		const remembered = vi.fn((code: string) => (code === 'M-OLD' ? home : undefined));
		const target = matchBackTarget(
			arrival('goto', from('/matches/[code]/correct', '/matches/M-OLD/correct', { code: 'M-OLD' })),
			paths,
			remembered
		);
		expect(target).toEqual({ href: '/', label: 'Home', back: false });
		expect(remembered).toHaveBeenCalledWith('M-OLD');
	});

	it('from another match, links to where that match went', () => {
		const filtered: BackTarget = { href: '/matches?show=needs-you', label: 'Matches', back: true };
		const target = matchBackTarget(
			arrival('link', from('/matches/[code]', '/matches/M-OLD', { code: 'M-OLD' })),
			paths,
			() => filtered
		);
		expect(target).toEqual({ ...filtered, back: false });
	});

	it('falls back to Matches when the other match has no remembered origin', () => {
		const target = matchBackTarget(
			arrival('link', from('/matches/[code]', '/matches/M-OLD', { code: 'M-OLD' })),
			paths,
			nothing
		);
		expect(target).toEqual({ href: '/matches', label: 'Matches', back: false });
	});
});

describe('cameFromMatch', () => {
	const match = from('/matches/[code]', '/matches/M-ONE', { code: 'M-ONE' });

	it('is true after a link from the same match', () => {
		expect(cameFromMatch(arrival('link', match), 'M-ONE')).toBe(true);
	});

	it('is false for another match, a shared link, or back and forward', () => {
		expect(cameFromMatch(arrival('link', match), 'M-TWO')).toBe(false);
		expect(cameFromMatch(arrival('enter', null), 'M-ONE')).toBe(false);
		expect(cameFromMatch(arrival('popstate', match), 'M-ONE')).toBe(false);
		expect(cameFromMatch(arrival('link', from('/', '/')), 'M-ONE')).toBe(false);
	});
});

describe('isPlainClick', () => {
	const click = (init: Partial<MouseEvent> = {}) =>
		({
			defaultPrevented: false,
			button: 0,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
			...init
		}) as MouseEvent;

	it('is true for a main-button click with no modifier', () => {
		expect(isPlainClick(click())).toBe(true);
	});

	it('is false for a middle click, a modifier key or a handled click', () => {
		expect(isPlainClick(click({ button: 1 }))).toBe(false);
		expect(isPlainClick(click({ metaKey: true }))).toBe(false);
		expect(isPlainClick(click({ ctrlKey: true }))).toBe(false);
		expect(isPlainClick(click({ shiftKey: true }))).toBe(false);
		expect(isPlainClick(click({ altKey: true }))).toBe(false);
		expect(isPlainClick(click({ defaultPrevented: true }))).toBe(false);
	});
});
