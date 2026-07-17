import { test } from '@playwright/test';
import * as dotenv from 'dotenv';
import {
  // Positive
  runAuthenticationSuccessTest,
  runBalanceUpdateTest,
  runOrderCreatingSuite,
  // Negative
  runAuthenticationFailureTest,
  runIncorrectCredentialsTest,
  runIncorrectClientIdTest,
  runNegativeTest,
  runInsufficientBalanceTest,
  runAboveMaximumAmountTest,
  runBelowMinimumAmountTest,
  // Shared
  ALL_BANKS,
  INVALID_IBANS,
} from './helpers';
import { HtmlReportGenerator } from '../../utils/HtmlReportGenerator';
import { reportFailuresToJira } from '../../utils/JiraReporter';

dotenv.config();

const EXPECTED_ERROR_INVALID_IBAN = 'To iban has invalid format,';
const EXPECTED_ERROR_INSUFFICIENT_BALANCE = "Couldn't make transaction. Insufficient balance amount";
const EXPECTED_ERROR_ABOVE_MAX = 'Amount above maximum transaction amount.';
const EXPECTED_ERROR_BELOW_MIN = 'Amount below minimum transaction amount.';

let allTestResults: any[] = [];

// Tag each case as positive or negative so the report can separate them
const tagPositive = (rows: any[]) => rows.map((r) => ({ ...r, testGroup: 'positive' as const }));
const tagNegative = (rows: any[]) => rows.map((r) => ({ ...r, testGroup: 'negative' as const }));

// Full Regression: runs ALL positive + negative cases and produces ONE combined report.
test.describe('Distributor HUB - Full Regression', () => {
  // ---------- POSITIVE ----------
  test('Positive - Successful Authentication', async ({ request }) => {
    allTestResults.push(...tagPositive(await runAuthenticationSuccessTest(request)));
  });

  test('Positive - Balance Update (All Currencies)', async ({ request }) => {
    const result = await runBalanceUpdateTest(request);
    allTestResults.push(...tagPositive(result.tableData));
  });

  // Order-creating scenarios (Payer Details, Payer + Beneficiary, and happy-path
  // distribution) are run as ONE suite: all orders are created first, then every
  // transaction is awaited to terminal status in a single parallel window,
  // instead of paying the slow BOG/Liberty signing wait three times. Produces the
  // same per-bank cases (Transactions / Payer Details / Payer + Beneficiary /
  // Balance Check) plus a suite-wide balance reconciliation.
  test('Positive - Order-Creating Suite', async ({ request }) => {
    const result = await runOrderCreatingSuite(request);
    allTestResults.push(...tagPositive(result.tableData));
  });

  // ---------- NEGATIVE ----------
  test('Negative - Authentication Failure (No Token)', async ({ request }) => {
    allTestResults.push(...tagNegative(await runAuthenticationFailureTest(request)));
  });

  test('Negative - Authentication Failure (Incorrect Credentials)', async ({ request }) => {
    allTestResults.push(...tagNegative(await runIncorrectCredentialsTest(request)));
  });

  test('Negative - Authentication Failure (Incorrect Client ID)', async ({ request }) => {
    allTestResults.push(...tagNegative(await runIncorrectClientIdTest(request)));
  });

  test('Negative - Distributor ALL BANKS - Invalid IBAN', async ({ request }) => {
    const result = await runNegativeTest(request, INVALID_IBANS, EXPECTED_ERROR_INVALID_IBAN);
    allTestResults.push(...tagNegative(result.tableData));
  });

  test('Negative - Distributor ALL BANKS - Insufficient Balance', async ({ request }) => {
    const result = await runInsufficientBalanceTest(request, ALL_BANKS, EXPECTED_ERROR_INSUFFICIENT_BALANCE);
    allTestResults.push(...tagNegative(result.tableData));
  });

  test('Negative - Distributor ALL BANKS - Above Maximum Amount', async ({ request }) => {
    const result = await runAboveMaximumAmountTest(request, ALL_BANKS, EXPECTED_ERROR_ABOVE_MAX);
    allTestResults.push(...tagNegative(result.tableData));
  });

  test('Negative - Distributor ALL BANKS - Below Minimum Amount', async ({ request }) => {
    const result = await runBelowMinimumAmountTest(request, ALL_BANKS, EXPECTED_ERROR_BELOW_MIN);
    allTestResults.push(...tagNegative(result.tableData));
  });

  test.afterAll(async () => {
    if (allTestResults.length > 0) {
      const reportGenerator = new HtmlReportGenerator();
      reportGenerator.generateReport(allTestResults, 'Distributor HUB - Full Regression', undefined, 'regression');
      // Opt-in: create JIRA bugs for failed cases when CREATE_JIRA_BUGS=true
      await reportFailuresToJira(allTestResults);
    }
  });
});
