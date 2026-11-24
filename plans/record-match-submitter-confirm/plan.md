# Plan: Stop confirming a match again right after recording it (issue #208)

**Status:** active

Risk tier: Medium. It changes existing behavior of the record-match flow (one request fewer, the failure toast gone) and the shared `AppError` type, across about ten files. Confirmed by the user.

Domain skills:
- superpowers:test-driven-development: invoke (every behavior change gets a failing test first).
- frontend-design, impeccable: not applicable because no screen layout changes; only a failure toast goes away.
- django, django-allauth, django-ninja-api: not applicable because the backend is only read, never changed.

## Goal

Since backend#197, `POST /api/v1/matches/` records the submitter's team confirmation. The app's follow-up `POST /api/v1/matches/{code}/confirm` is a no-op that can still fail on its own, and its failure toast now says something false ("We couldn't confirm your score"). Remove the call, its error path and its copy. Also, as the issue's comment asks (user decision, see Decisions), read the earlier match's code from the 409 item's structured `existing_code`.

## Acceptance criteria

1. `submitMatch` (`app/src/lib/features/record-match/service.ts`) sends exactly one request, `POST /api/v1/matches/`, and never calls `POST /api/v1/matches/{code}/confirm`. It resolves to `{ match }`, the match as the create call returned it. `SubmitResult` has no `confirmError`.
2. No code, copy or comment in `app/src` reports or explains a failed confirmation after recording. `recorded-toast.ts` and its test are removed. The record page shows the toast "Match recorded" with the default duration after every successful record. `git grep -n -E "confirmError|recordedToast|LONG_TOAST_MS|couldn't confirm your score|Confirm it on the match page" -- app` finds nothing.
3. Comments that describe the submit as "create, then confirm" (`service.ts` header and `submitMatch` doc, `record-match/index.ts`, `record-form.svelte` `onrecorded` doc, `routes/record/+page.svelte`, `features/matches/index.ts` and `features/matches/services.ts` `rememberMatch` docs) say instead that the backend records the submitter's confirmation with the match.
4. `AppError` carries an optional `existingCode: string`. `toAppError` sets it from the first Ninja error item whose `existing_code` is a non-empty string, and leaves it unset otherwise. Allauth errors never set it.
5. `duplicateMatchCode(error)` returns the parsed `existingCode` when it is set and valid. Otherwise it falls back to reading the code from the message, as today, for a backend older than backend#199. It still returns null for a non-duplicate error or when neither names a valid code. Its comment no longer says to switch once backend#199 ships.
6. The record button and its hint stay as they are ("Record and confirm score", "This confirms the score for your team."): they are still true. The duplicate notice's "You may still need to confirm it." stays: the earlier match may have been submitted by the other team.
7. `plans/frontend-v1/plan.md` Q4 notes that the backend now does this (backend#197) and the app's extra call was removed in frontend#208. `plans/frontend-v1/proposal.md` row "Confirm my own submission" no longer says the removal is still to come.
8. The full app gate passes (`pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test`, `pnpm build`), and `pnpm e2e` passes.

## Files that change

- `app/src/lib/api/errors.ts`, `app/src/lib/api/errors.test.ts`: `existingCode` (criterion 4).
- `app/src/lib/features/record-match/service.ts`, `service.test.ts`: drop the confirm call and `confirmError`; `duplicateMatchCode` reads `existingCode` first (criteria 1, 5).
- `app/src/lib/features/record-match/recorded-toast.ts`, `recorded-toast.test.ts`: deleted (criterion 2).
- `app/src/lib/features/record-match/index.ts`: drop the `recordedToast` export, fix the docs.
- `app/src/lib/features/record-match/components/record-form.svelte`, `record-form.svelte.test.ts`, `form.svelte.test.ts`: `SubmitResult` without `confirmError`, doc comment.
- `app/src/routes/record/+page.svelte`: `toast('Match recorded')`, comments.
- `app/src/lib/features/matches/index.ts`, `app/src/lib/features/matches/services.ts`: comments only.
- `plans/frontend-v1/plan.md`, `plans/frontend-v1/proposal.md`: criterion 7.
- This plan.

Not changed: the mocks (frontend#207 already records the submitter's confirmation and sends `existing_code`), `features/matches` confirm and dispute (players still confirm matches the other team submitted), e2e specs (they already expect "Match recorded" and the waiting state; no spec covers the confirm failure).

## Order of work

1. `errors.ts`: failing tests in `errors.test.ts` for `existingCode` set from the 409 item, unset when absent or empty, unset for allauth. Then the field and the parsing.
2. `service.ts`: failing tests in `service.test.ts`:
   - `submitMatch` makes no request to `/api/v1/matches/:code/confirm` (an msw handler that counts calls, or `onUnhandledRequest`-proof listener on `server.events`), and resolves to an object with only `match`.
   - The match comes back pending with the submitter's team confirmed (from the mock's create response).
   - `duplicateMatchCode` prefers `existingCode` over the message (a message naming a different code), and falls back to the message when `existingCode` is unset.
   - Remove the two "keeps the created match when confirming fails" tests and the `confirmError` assertions.
   Then the code change.
3. Delete `recorded-toast.ts` and its test; update `index.ts`, the record page and the type users (`record-form.svelte`, its test, `form.svelte.test.ts`).
4. Comment updates (criterion 3) and the plan docs (criterion 7).
5. Full gate and `pnpm e2e`, then the live drive.

## Risks

- A caller still reading `confirmError` or `recordedToast`: `pnpm check` catches it; criterion 2's grep confirms.
- `missing` mock mode or an older backend without backend#197: the submitter's team would not be confirmed. The issue accepts this: backend#197 is shipped, and the app targets backend `main`. The match page still shows Confirm for a pending match the player has not confirmed, so the player can recover.
- `existingCode` on a plain-object `AppError` built by tests: the field is optional, so `isAppError` still accepts objects without it.
- Riskiest step: step 2's "no confirm request" test must actually observe requests, or it passes vacuously. It must fail against the current code first (red run recorded).

Not done: changing the record button wording, the duplicate notice, or `features/matches` confirm flows.

## Proof

- Criterion 1: `service.test.ts` "sends only the create request" (fails on the current code, which calls confirm). Criterion 4: `errors.test.ts`. Criterion 5: `service.test.ts` duplicate tests, plus the existing "reports a duplicate with the earlier match code" against the mock, which now sends `existing_code`.
- Criterion 2: the grep in criterion 2, run after the change, prints nothing.
- Criterion 8: gate output.
- Live drive (Medium, the changed path): `pnpm dev` with `PUBLIC_API_MOCK=all`, sign in as `player@example.com`, record a doubles match, see "Match recorded" and the match page "Waiting for the other team" with "You confirmed this score.", and in the network log exactly one `POST /api/v1/matches/` and no `/confirm` request. Then record the same match again: the duplicate notice links "See the match" to the first match's code.
- Measured on `origin/main` (9a4bc6b): `git grep -n "matches/{code}/confirm" origin/main -- app/src/lib/features/record-match/service.ts` prints line 94, so the current code does send the confirm request, and the "no confirm request" test must start red.

## Decisions

- Read `existing_code` in this PR, keeping the message parse as a fallback (user decision, 2026-11-24).
- Keep `SubmitResult` as `{ match }` rather than returning a bare `Match`, so the form and page signatures stay the same (fewer files change).
