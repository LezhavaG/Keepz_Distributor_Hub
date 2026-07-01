import { test } from '@playwright/test';
import * as dotenv from 'dotenv';
import { runNegativeTest, INVALID_IBANS, runAuthenticationFailureTest, runIncorrectCredentialsTest, runIncorrectClientIdTest, ALL_BANKS, runInsufficientBalanceTest, runAboveMaximumAmountTest, runBelowMinimumAmountTest } from '../helpers';
import { HtmlReportGenerator } from '../../../utils/HtmlReportGenerator';
import { reportFailuresToJira } from '../../../utils/JiraReporter';

dotenv.config();

const EXPECTED_ERROR_INVALID_IBAN = 'To iban has invalid format,';
const EXPECTED_ERROR_INSUFFICIENT_BALANCE = 'Couldn\'t make transaction. Insufficient balance amount';
const EXPECTED_ERROR_ABOVE_MAX = 'Amount above maximum transaction amount.';
const EXPECTED_ERROR_BELOW_MIN = 'Amount below minimum transaction amount.';

let allTestResults: any[] = [];
let balanceSummary: any[] = [];

test.describe('Distributor HUB - Negative Tests (Combined)', () => {
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

  test('Negative - Distributor ALL BANKS - Invalid IBAN', async ({ request }) => {
    const result = await runNegativeTest(request, INVALID_IBANS, EXPECTED_ERROR_INVALID_IBAN);
    allTestResults.push(...result.tableData);
    balanceSummary = result.balanceSummary;
  });

  test('Negative - Distributor ALL BANKS - Insufficient Balance', async ({ request }) => {
    const result = await runInsufficientBalanceTest(request, ALL_BANKS, EXPECTED_ERROR_INSUFFICIENT_BALANCE);
    allTestResults.push(...result.tableData);
  });

  test('Negative - Distributor ALL BANKS - Above Maximum Amount', async ({ request }) => {
    const result = await runAboveMaximumAmountTest(request, ALL_BANKS, EXPECTED_ERROR_ABOVE_MAX);
    allTestResults.push(...result.tableData);
  });

  test('Negative - Distributor ALL BANKS - Below Minimum Amount', async ({ request }) => {
    const result = await runBelowMinimumAmountTest(request, ALL_BANKS, EXPECTED_ERROR_BELOW_MIN);
    allTestResults.push(...result.tableData);
  });

  test.afterAll(async () => {
    if (allTestResults.length > 0) {
      const reportGenerator = new HtmlReportGenerator();
      reportGenerator.generateReport(allTestResults, 'Distributor HUB - Negative Tests', balanceSummary || undefined, 'negative');
      await reportFailuresToJira(allTestResults);
    }
  });
});
