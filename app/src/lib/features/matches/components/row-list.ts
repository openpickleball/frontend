import type { MatchFilter } from '../filter.js';

/**
 * A list of match rows whose title already says what the row notes would: a Matches filter, or
 * Home's "Waiting for the other team".
 */
export type RowList = Exclude<MatchFilter, 'all'> | 'waiting';
