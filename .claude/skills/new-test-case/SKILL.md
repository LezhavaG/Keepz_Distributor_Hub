---
name: new-test-case
description: Scaffold a new Distributor HUB test case following all project rules. Use when the user asks to add/create a test case, test scenario, or negative/positive case (e.g. "add a negative case for TBC invalid IBAN", "add a positive balance-update test"). Ensures the case is wired into BOTH the combined and individual spec files, the shared helper, the JIRA retest resolver, and follows the mandatory report/config/secret rules.
---

# Add a Distributor HUB test case

Guide for adding a new test case so it is consistent with every other case and
compliant with the project's mandatory rules. Do NOT freehand a test — follow
this procedure and mirror the existing patterns exactly.

## 0. Clarify before writing

Confirm (ask only what is genuinely ambiguous):
- **Positive or negative?** → determines which pair of spec files + report `type`.
- **Category** (report grouping), e.g. `Invalid IBAN Cases`, `Amount Validation Cases`, `Balance Update Cases`, `Transactions`. Reuse an existing category name if one fits.
- **Scope**: single bank, all banks, single currency, all currencies?
- **Expected result**: for negative cases, the exact backend error string to assert.

## 1. The architecture (read `tests/Distributor_HUB/helpers.ts` first)

Test *logic* never lives in the spec files. It lives as a `runXxxTest(request, ...)`
function in `tests/Distributor_HUB/helpers.ts`. Spec files only call those helpers
and push results into `allTestResults`.

Each helper returns either:
- an array of result rows (auth-style cases), or
- `{ tableData, balanceSummary }` (bank/currency-looped cases).

A result **row** looks like this and every field matters for the report:

```ts
{
  transactionId: 0,
  bank: 'BOG' | 'TBC' | 'Liberty' | 'CREDO' | 'N/A',
  amount: <number>,
  currency: 'GEL' | 'USD' | 'EUR' | 'ALL',
  status: 'Succeeded' | 'Failed',        // negative cases that behaved correctly are 'Failed' + isExpectedError:true
  isExpectedError: <bool>,               // negative cases only
  testCaseName: '<stable, unique name>', // used by JIRA + retest resolver — keep it parseable
  skipTransactionTable: true,
  category: '<report group>',
  apiCalls: [ /* see rule below */ ],
}
```

## 2. MANDATORY rules (these are gated by the pre-commit code-reviewer)

1. **API request details in the report.** Every API call in `apiCalls[]` MUST include
   `name`, `url`, `method`, `requestBody`, `statusCode`, `expectedResult`, `actualResult`,
   and `passed`. This is how the report shows URL / Method / Status / Expected vs Actual.
2. **Never expose secrets.** Mask `client_secret` (and any secret) as `'***'` in
   `requestBody` before it goes into a result row. See `runAuthenticationSuccessTest`.
3. **No hardcoded configurable values.** Amounts, limits, IBANs, commission, and
   fixtures come from `.env` / `DistributorConfig`, never literals. Use the getters:
   `getTransactionAmount`, `getBelowMinAmount`, `getAboveMaxAmount`, `getInsufficientAmount`,
   and `computeExpectedCommission` — and call `await loadDistributorConfig(request)`
   at the top of any helper that uses amounts (limits are fetched live from the admin panel).
4. **Commission is verified against the EXPECTED (admin-config) value**, not the value
   the API reports back — otherwise a wrong backend commission would pass. Mirror the
   `perCurrency`/`computeExpectedCommission` logic in `runHappyPathTest`.
5. **Add the case to BOTH spec files.** Every case exists in the *combined* spec
   (all banks) AND the *individual* spec (one test per bank). Never just one.
6. **Keep `testCaseName` stable and parseable** — JIRA bug titles and the retest
   resolver depend on it (see step 4).

## 3. Wire the case into BOTH spec files

Positive:
- `tests/Distributor_HUB/Positive_Cases/positive-tests.spec.ts` (combined → `ALL_BANKS`)
- `tests/Distributor_HUB/Positive_Cases/positive-tests-individual.spec.ts` (one `test(...)` per `BOG_BANK`, `TBC_BANK`, `LIBERTY_BANK`, `CREDO_BANK`)

Negative:
- `tests/Distributor_HUB/Negative_Cases/negative-tests.spec.ts` (combined)
- `tests/Distributor_HUB/Negative_Cases/negative-tests-individual.spec.ts` (per bank)

In each spec `test(...)` block, follow the exact existing shape:
```ts
test('Positive - Distributor BOG', async ({ request }) => {
  const result = await runHappyPathTest(request, [BOG_BANK]);
  allTestResults.push(...result.tableData);
  balanceSummary = result.balanceSummary;   // only if the helper returns one
});
```
- Add any new imports to the `import { ... } from '../helpers'` line.
- If you introduce a new expected-error string, add it as a `const EXPECTED_ERROR_*`
  at the top of the negative spec files (both), matching the existing four.
- Do NOT touch the `afterAll` block — report generation + `reportFailuresToJira`
  are already wired and must stay.

## 4. Wire the JIRA retest resolver (in `helpers.ts`)

`retestCaseByName(request, testCaseName)` re-runs a single case when a JIRA bug is
retested. If your new case's `testCaseName` is not matched there, retest will silently
report "not found". Add a branch that matches your `testCaseName` (exact string or a
regex like the existing `^Distributor (\w+) - Invalid IBAN$`) and calls your helper
with the right single-bank/currency args. Reuse `RETEST_EXPECTED` / `BANKS_BY_NAME`
/ `INVALID_BY_NAME` maps where relevant.

## 5. Verify

- Type-check / list the tests without running the whole suite:
  `npx playwright test tests/Distributor_HUB/ --list`
- Run just the new case to confirm it works, e.g.:
  `npx playwright test tests/Distributor_HUB/Negative_Cases/ -g "<part of testCaseName>"`
- Confirm it appears in the generated HTML report under the right category with full
  Expected vs Actual details.

## 6. Before finishing

- Re-read your diff against the rules in step 2 (the commit hook will block on any 🔴).
- If this introduces a genuinely new test *category* or rule, per project policy
  **ask the user first** before editing `DISTRIBUTOR_HUB_RULES.md` — don't edit docs unprompted.
