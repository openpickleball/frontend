/**
 * Review finding P (frontend#261): the 403 messages were looked up with a plain object index, so a
 * code such as `constructor` found `Object.prototype.constructor` and became the message.
 */
import { describe, expect, it } from 'vitest';
import { toAppError } from './errors';

describe('the 403 message for a code that is an Object property name', () => {
	it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
		'uses the plain forbidden message for %s',
		(code) => {
			const error = toAppError(
				{ code, message: 'x', errors: [] },
				new Response(null, { status: 403 })
			);
			expect(error.message).toBe("You can't do that. Only the players in a match can change it.");
		}
	);
});
