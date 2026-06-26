import { test } from '@playwright/test';
import * as dotenv from 'dotenv';
import { runHappyPathTest, BOG_BANK, TBC_BANK, LIBERTY_BANK, CREDO_BANK, runAuthenticationSuccessTest } from '../helpers';
import { HtmlReportGenerator } from '../../../utils/HtmlReportGenerator';

dotenv.config();

let allTestResults: any[] = [];
let balanceSummary: any[] = [];

test.describe('Distributor HUB - Positive Tests (Individual Banks)', () => {
  test('Positive - Successful Authentication', async ({ request }) => {
    const authResults = await runAuthenticationSuccessTest(request);
    allTestResults.push(...authResults);
  });

  test('Positive - Distributor BOG', async ({ request }) => {
    const result = await runHappyPathTest(request, [BOG_BANK]);
    allTestResults.push(...result.tableData);
    balanceSummary = result.balanceSummary;
  });

  test('Positive - Distributor TBC', async ({ request }) => {
    const result = await runHappyPathTest(request, [TBC_BANK]);
    allTestResults.push(...result.tableData);
    balanceSummary = result.balanceSummary;
  });

  test('Positive - Distributor Liberty', async ({ request }) => {
    const result = await runHappyPathTest(request, [LIBERTY_BANK]);
    allTestResults.push(...result.tableData);
    balanceSummary = result.balanceSummary;
  });

  test('Positive - Distributor CREDO', async ({ request }) => {
    const result = await runHappyPathTest(request, [CREDO_BANK]);
    allTestResults.push(...result.tableData);
    balanceSummary = result.balanceSummary;
  });

  test.afterAll(async () => {
    if (allTestResults.length > 0) {
      const reportGenerator = new HtmlReportGenerator();
      reportGenerator.generateReport(allTestResults, 'Distributor HUB - Positive Tests (Individual)', balanceSummary || undefined, 'positive');
    }
  });
});
