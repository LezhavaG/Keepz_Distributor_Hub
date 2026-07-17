import { test } from '@playwright/test';
import * as dotenv from 'dotenv';
import { runOrderCreatingSuite, runAuthenticationSuccessTest, runBalanceUpdateTest } from '../helpers';
import { HtmlReportGenerator } from '../../../utils/HtmlReportGenerator';
import { reportFailuresToJira } from '../../../utils/JiraReporter';

dotenv.config();

let allTestResults: any[] = [];
let balanceSummary: any[] = [];

test.describe('Distributor HUB - Positive Tests (Combined)', () => {
  test('Positive - Successful Authentication', async ({ request }) => {
    const authResults = await runAuthenticationSuccessTest(request);
    allTestResults.push(...authResults);
  });

  // Balance Update flow per currency: check -> update -> check -> verify increase
  test('Positive - Balance Update (All Currencies)', async ({ request }) => {
    const result = await runBalanceUpdateTest(request);
    allTestResults.push(...result.tableData);
  });

  // Order-creating scenarios (Payer Details, Payer + Beneficiary, and happy-path
  // distribution) run as ONE suite: create all orders, then await every
  // transaction to terminal status in a single parallel window (instead of the
  // slow BOG/Liberty signing wait three times over). Produces the same per-bank
  // cases plus a suite-wide balance reconciliation.
  test('Positive - Order-Creating Suite', async ({ request }) => {
    const result = await runOrderCreatingSuite(request);
    allTestResults.push(...result.tableData);
    balanceSummary = result.balanceSummary;
  });

  test.afterAll(async () => {
    if (allTestResults.length > 0) {
      const reportGenerator = new HtmlReportGenerator();
      reportGenerator.generateReport(allTestResults, 'Distributor HUB - Positive Tests', balanceSummary || undefined, 'positive');
      await reportFailuresToJira(allTestResults);
    }
  });
});
