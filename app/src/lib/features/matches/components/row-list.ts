import type { MatchFilter } from '../filter.js';

/**
 * A list of match rows whose title already says what the row notes would: a Matches filter, or
 * Home's Needs you, whose rows say what the player can do instead.
 */
export type RowList = Exclude<MatchFilter, 'all'>;
