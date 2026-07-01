import { test } from '@playwright/test';
import * as dotenv from 'dotenv';
import { runNegativeTest, runAuthenticationFailureTest, runIncorrectCredentialsTest, runIncorrectClientIdTest, BOG_INVALID, TBC_INVALID, LIBERTY_INVALID, CREDO_INVALID, BOG_BANK, TBC_BANK, LIBERTY_BANK, CREDO_BANK, runInsufficientBalanceTest, runAboveMaximumAmountTest, runBelowMinimumAmountTest } from '../helpers';
import { HtmlReportGenerator } from '../../../utils/HtmlReportGenerator';
import { reportFailuresToJira } from '../../../utils/JiraReporter';

dotenv.config();

const EXPECTED_ERROR_INVALID_IBAN = 'To iban has invalid format,';
const EXPECTED_ERROR_INSUFFICIENT_BALANCE = 'Couldn\'t make transaction. Insufficient balance amount';
const EXPECTED_ERROR_ABOVE_MAX = 'Amount above maximum transaction amount.';
const EXPECTED_ERROR_BELOW_MIN = 'Amount below minimum transaction amount.';

let allTestResults: any[] = [];
let balanceSummary: any[] = [];

test.describe('Distributor HUB - Negative Tests (Individual Banks)', () => {
  // Authentication tests (shared - no bank specific)
  test('Negative - Authentication Failure (No Token)', async ({ request }) => {
    const authResults = await runAuthenticationFailureTest(request);
    allTestResults.push(...authResults);
  });

  test('Negative - Authentication Failure (Incorrect Credentials)', async ({ request }) => {
    const credentialResults = await runIncorrectCredentialsTest(request);
    allTestResults.push(...credentialResults);
  });

  test('Negative - Authentication Failure (Incorrect Client ID)', async ({ request }) => {
    const clientIdResults = await runIncorrectClientIdTest(request);
    allTestResults.push(...clientIdResults);
  });

  // Invalid IBAN tests (per bank)
  test('Negative - BOG - Invalid IBAN', async ({ request }) => {
    const result = await runNegativeTest(request, [BOG_INVALID], EXPECTED_ERROR_INVALID_IBAN);
    allTestResults.push(...result.tableData);
    balanceSummary = result.balanceSummary;
  });

  test('Negative - TBC - Invalid IBAN', async ({ request }) => {
    const result = await runNegativeTest(request, [TBC_INVALID], EXPECTED_ERROR_INVALID_IBAN);
    allTestResults.push(...result.tableData);
    balanceSummary = result.balanceSummary;
  });

  test('Negative - Liberty - Invalid IBAN', async ({ request }) => {
    const result = await runNegativeTest(request, [LIBERTY_INVALID], EXPECTED_ERROR_INVALID_IBAN);
    allTestResults.push(...result.tableData);
    balanceSummary = result.balanceSummary;
  });

  test('Negative - CREDO - Invalid IBAN', async ({ request }) => {
    const result = await runNegativeTest(request, [CREDO_INVALID], EXPECTED_ERROR_INVALID_IBAN);
    allTestResults.push(...result.tableData);
    balanceSummary = result.balanceSummary;
  });

  // Insufficient Balance tests (per bank)
  test('Negative - BOG - Insufficient Balance', async ({ request }) => {
    const result = await runInsufficientBalanceTest(request, [BOG_BANK], EXPECTED_ERROR_INSUFFICIENT_BALANCE);
    allTestResults.push(...result.tableData);
  });

  test('Negative - TBC - Insufficient Balance', async ({ request }) => {
    const result = await runInsufficientBalanceTest(request, [TBC_BANK], EXPECTED_ERROR_INSUFFICIENT_BALANCE);
    allTestResults.push(...result.tableData);
  });

  test('Negative - Liberty - Insufficient Balance', async ({ request }) => {
    const result = await runInsufficientBalanceTest(request, [LIBERTY_BANK], EXPECTED_ERROR_INSUFFICIENT_BALANCE);
    allTestResults.push(...result.tableData);
  });

  test('Negative - CREDO - Insufficient Balance', async ({ request }) => {
    const result = await runInsufficientBalanceTest(request, [CREDO_BANK], EXPECTED_ERROR_INSUFFICIENT_BALANCE);
    allTestResults.push(...result.tableData);
  });

  // Above Maximum Amount tests (per bank)
  test('Negative - BOG - Above Maximum Amount', async ({ request }) => {
    const result = await runAboveMaximumAmountTest(request, [BOG_BANK], EXPECTED_ERROR_ABOVE_MAX);
    allTestResults.push(...result.tableData);
  });

  test('Negative - TBC - Above Maximum Amount', async ({ request }) => {
    const result = await runAboveMaximumAmountTest(request, [TBC_BANK], EXPECTED_ERROR_ABOVE_MAX);
    allTestResults.push(...result.tableData);
  });

  test('Negative - Liberty - Above Maximum Amount', async ({ request }) => {
    const result = await runAboveMaximumAmountTest(request, [LIBERTY_BANK], EXPECTED_ERROR_ABOVE_MAX);
    allTestResults.push(...result.tableData);
  });

  test('Negative - CREDO - Above Maximum Amount', async ({ request }) => {
    const result = await runAboveMaximumAmountTest(request, [CREDO_BANK], EXPECTED_ERROR_ABOVE_MAX);
    allTestResults.push(...result.tableData);
  });

  // Below Minimum Amount tests (per bank)
  test('Negative - BOG - Below Minimum Amount', async ({ request }) => {
    const result = await runBelowMinimumAmountTest(request, [BOG_BANK], EXPECTED_ERROR_BELOW_MIN);
    allTestResults.push(...result.tableData);
  });

  test('Negative - TBC - Below Minimum Amount', async ({ request }) => {
    const result = await runBelowMinimumAmountTest(request, [TBC_BANK], EXPECTED_ERROR_BELOW_MIN);
    allTestResults.push(...result.tableData);
  });

  test('Negative - Liberty - Below Minimum Amount', async ({ request }) => {
    const result = await runBelowMinimumAmountTest(request, [LIBERTY_BANK], EXPECTED_ERROR_BELOW_MIN);
    allTestResults.push(...result.tableData);
  });

  test('Negative - CREDO - Below Minimum Amount', async ({ request }) => {
    const result = await runBelowMinimumAmountTest(request, [CREDO_BANK], EXPECTED_ERROR_BELOW_MIN);
    allTestResults.push(...result.tableData);
  });

  test.afterAll(async () => {
    if (allTestResults.length > 0) {
      const reportGenerator = new HtmlReportGenerator();
      reportGenerator.generateReport(allTestResults, 'Distributor HUB - Negative Tests (Individual)', balanceSummary || undefined, 'negative');
      await reportFailuresToJira(allTestResults);
    }
  });
});
