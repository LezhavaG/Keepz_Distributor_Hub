import { test } from '@playwright/test';
import * as dotenv from 'dotenv';
import { runHappyPathTest, ALL_BANKS, runAuthenticationSuccessTest } from '../helpers';
import { HtmlReportGenerator } from '../../../utils/HtmlReportGenerator';

dotenv.config();

let allTestResults: any[] = [];
let balanceSummary: any[] = [];

test.describe('Distributor HUB - Positive Tests (Combined)', () => {
  test('Positive - Successful Authentication', async ({ request }) => {
    const authResults = await runAuthenticationSuccessTest(request);
    allTestResults.push(...authResults);
  });

  test('Positive - Distributor ALL BANKS', async ({ request }) => {
    const result = await runHappyPathTest(request, ALL_BANKS);
    allTestResults.push(...result.tableData);
    balanceSummary = result.balanceSummary;
  });

  test.afterAll(async () => {
    if (allTestResults.length > 0) {
      const reportGenerator = new HtmlReportGenerator();
      reportGenerator.generateReport(allTestResults, 'Distributor HUB - Positive Tests', balanceSummary || undefined, 'positive');
    }
  });
});
