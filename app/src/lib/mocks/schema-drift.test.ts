import { describe, expect, it } from 'vitest';
import openJson from '../api/schema/open.json?raw';
import {
	BEST_OF_VALUES,
	EVENT_KINDS,
	GAME_TARGETS,
	MATCH_FORMATS,
	MATCH_STATUSES,
	SCORING_TYPES
} from '../domain/models';
import {
	EVENTS_MAX_PAGE_SIZE,
	EVENTS_PAGE_SIZE,
	HISTORY_MAX_PAGE_SIZE,
	HISTORY_PAGE_SIZE,
	MAX_GAME_ENTRIES,
	MAX_TEAM_ENTRIES
} from './validation';
import { MEMBER_ROLES } from './fixtures';

// The domain and the mock copy the schema's enums and limits by hand, so both could drift from it
// together and still agree with each other. This pins them to the committed snapshot.
type Schema = { enum?: unknown[]; maxItems?: number };
type Parameter = { name: string; schema: { default?: number; maximum?: number } };
const doc = JSON.parse(openJson) as {
	components: { schemas: Record<string, Schema & { properties?: Record<string, Schema> }> };
	paths: Record<string, { get?: { parameters?: Parameter[] } }>;
};
const schemas = doc.components.schemas;

describe('schema/open.json against the domain and the mock', () => {
	it.each([
		['MatchFormat', MATCH_FORMATS],
		['MatchStatus', MATCH_STATUSES],
		['ScoringType', SCORING_TYPES],
		['BestOf', BEST_OF_VALUES],
		['GameTarget', GAME_TARGETS],
		['MemberRole', MEMBER_ROLES],
		['EventKind', EVENT_KINDS]
	] as const)('%s lists the same values', (name, values) => {
		expect([...(schemas[name].enum ?? [])].sort()).toEqual([...values].sort());
	});

	it('limits the team and game lists as the mock does', () => {
		const { properties } = schemas.MatchCreateIn;
		expect(properties?.team_a.maxItems).toBe(MAX_TEAM_ENTRIES);
		expect(properties?.team_b.maxItems).toBe(MAX_TEAM_ENTRIES);
		expect(properties?.games.maxItems).toBe(MAX_GAME_ENTRIES);
	});

	it('pages the match history as the mock does', () => {
		const params = doc.paths['/api/v1/players/{code}/matches'].get?.parameters ?? [];
		const limit = params.find((p) => p.name === 'limit')?.schema;
		expect(limit?.default).toBe(HISTORY_PAGE_SIZE);
		expect(limit?.maximum).toBe(HISTORY_MAX_PAGE_SIZE);
	});

	it('pages the organizer Events as the mock does', () => {
		const params = doc.paths['/api/v1/organizer/events'].get?.parameters ?? [];
		const limit = params.find((p) => p.name === 'limit')?.schema;
		expect(limit?.default).toBe(EVENTS_PAGE_SIZE);
		expect(limit?.maximum).toBe(EVENTS_MAX_PAGE_SIZE);
	});
});
