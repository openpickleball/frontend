// ESLint rule: no arbitrary Tailwind values in square brackets, such as `text-[15px]` or
// `max-w-[420px]`. Use a Tailwind default or one of our tokens (see "Reuse before you build" in
// app/AGENTS.md).
//
// Allowed without a comment:
// - Values that use `calc()`, `env()` or `var()`, for example `pb-[env(safe-area-inset-bottom)]`.
// - Arbitrary variants, which are selectors and not values: `data-[state=open]:`,
//   `aria-[current=page]:`, `has-[>svg]:`, `*:[svg]:`.
//
// Anything else needs an exception on the line before it, with a reason after `--`:
//   // eslint-disable-next-line local/no-arbitrary-tailwind-values -- optical nudge, no default
//   <!-- eslint-disable-next-line local/no-arbitrary-tailwind-values -- reason -->

/** A utility with an arbitrary value: `text-[15px]`, `-mr-[0.1em]`, `w-[50%]/50`. */
const VALUE = /^-?[a-z][a-z0-9-]*-\[(.+)\](?:\/[\w.[\]-]+)?$/;
/** An arbitrary property: `[mask-type:luminance]`. */
const PROPERTY = /^\[[a-z-]+:.+\]$/;
const ALLOWED_FUNCTION = /\b(?:calc|env|var)\(/;

/**
 * Split a class token on `:` outside brackets, so `data-[a:b]:w-[5px]` gives two parts.
 * @param {string} token
 * @returns {string[]}
 */
function splitVariants(token) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < token.length; i++) {
		const c = token[i];
		if (c === '[' || c === '(') depth++;
		else if (c === ']' || c === ')') depth--;
		else if (c === ':' && depth === 0) {
			parts.push(token.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(token.slice(start));
	return parts;
}

/**
 * The tokens in a class string that use a disallowed arbitrary value.
 * @param {string} text
 * @returns {string[]}
 */
export function findArbitraryValues(text) {
	const found = [];
	for (const token of text.split(/\s+/)) {
		if (!token.includes('[')) continue;
		let utility = splitVariants(token).pop() ?? '';
		utility = utility.replace(/^!|!$/g, '');
		const match = VALUE.exec(utility);
		const isValue = match !== null && !ALLOWED_FUNCTION.test(match[1]);
		const isProperty = PROPERTY.test(utility) && !ALLOWED_FUNCTION.test(utility);
		if (isValue || isProperty) found.push(token);
	}
	return found;
}

// Typed as any: ESLint's node types do not cover svelte-eslint-parser nodes such as SvelteLiteral.
export default /** @type {any} */ ({
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow arbitrary Tailwind values in square brackets'
		},
		messages: {
			arbitrary:
				'Arbitrary Tailwind value `{{token}}`. Use a Tailwind default or a token. Only calc(), env() and var() values are allowed. For a justified exception, add `eslint-disable-next-line local/no-arbitrary-tailwind-values -- reason`.'
		},
		schema: []
	},
	/** @param {any} context */
	create(context) {
		/**
		 * @param {any} node
		 * @param {string} text
		 */
		function check(node, text) {
			for (const token of findArbitraryValues(text)) {
				context.report({ node, messageId: 'arbitrary', data: { token } });
			}
		}
		return {
			/** @param {any} node */
			Literal(node) {
				if (typeof node.value === 'string') check(node, node.value);
			},
			/** @param {any} node */
			TemplateElement(node) {
				check(node, node.value.cooked ?? node.value.raw);
			},
			// Text of a Svelte attribute, such as class="..." (svelte-eslint-parser).
			/** @param {{ value: string }} node */
			SvelteLiteral(node) {
				check(node, node.value);
			}
		};
	}
});
