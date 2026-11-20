import type { AppError } from '#lib/api/index.js';
import { asAppError, focusFirstError, issueMessages, serverMessages } from './forms.js';

/** A problem with a form as a whole, shown in a notice below its submit button. */
export type FormProblem = { title: string; detail?: string };

type Parsed<T> =
	| { success: true; data: T }
	| {
			success: false;
			error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
	  };

/**
 * The state and submit steps the auth forms share: check the fields, then call the backend, then
 * show what went wrong. `prefix` and `order` say which field gets focus first, as in
 * `focusFirstError`.
 */
export function createAuthForm(prefix: string, order: string[]) {
	let errors = $state<Record<string, string>>({});
	let problem = $state<FormProblem | null>(null);
	let busy = $state(false);

	/** Mark fields with messages, and move focus to the first one. */
	function showFields(next: Record<string, string>) {
		errors = next;
		focusFirstError(next, order, prefix);
	}

	return {
		/** A message per field name. */
		get errors() {
			return errors;
		},
		get problem() {
			return problem;
		},
		/** Say what went wrong with the form as a whole. */
		set problem(next: FormProblem | null) {
			problem = next;
		},
		get busy() {
			return busy;
		},
		showFields,
		/**
		 * Handle a submit event. `parse` checks the fields: when it fails the messages show inline and
		 * nothing is sent (unless `onInvalid` returns true to say it dealt with them). Otherwise `run`
		 * gets the parsed data. When `run` throws, `onError` gets the error as an `AppError`.
		 */
		async submit<T>(
			event: SubmitEvent,
			options: {
				parse: () => Parsed<T>;
				run: (data: T) => Promise<void>;
				onError: (error: AppError, fields: Record<string, string>) => void;
				onInvalid?: (messages: Record<string, string>) => boolean;
			}
		) {
			event.preventDefault();
			if (busy) return;
			problem = null;
			const parsed = options.parse();
			if (!parsed.success) {
				const messages = issueMessages(parsed.error.issues);
				if (options.onInvalid?.(messages)) {
					errors = messages;
				} else {
					showFields(messages);
				}
				return;
			}
			errors = {};
			busy = true;
			try {
				await options.run(parsed.data);
			} catch (cause) {
				const error = asAppError(cause);
				options.onError(error, serverMessages(error));
			} finally {
				busy = false;
			}
		}
	};
}
