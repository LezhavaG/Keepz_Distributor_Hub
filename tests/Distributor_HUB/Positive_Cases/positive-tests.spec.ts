import { test } from '@playwright/test';
import * as dotenv from 'dotenv';
import { runHappyPathTest, ALL_BANKS, runAuthenticationSuccessTest, runBalanceUpdateTest, runPaymentDescriptionTest } from '../helpers';
import { HtmlReportGenerator } from '../../../utils/HtmlReportGenerator';

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

  // Payer Details only -> verify paymentDescription = payer details + description
  test('Positive - Orders with Payer Details', async ({ request }) => {
    const result = await runPaymentDescriptionTest(request, ALL_BANKS, false, 'Payer Details', 'Payer Details Cases');
    allTestResults.push(...result.tableData);
  });

  // Payer + Beneficiary Details -> verify paymentDescription has ONLY payer details + description
  test('Positive - Orders with Payer + Beneficiary Details', async ({ request }) => {
    const result = await runPaymentDescriptionTest(request, ALL_BANKS, true, 'Payer + Beneficiary Details', 'Payer + Beneficiary Details Cases');
    allTestResults.push(...result.tableData);
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
