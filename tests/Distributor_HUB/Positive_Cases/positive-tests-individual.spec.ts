import { test } from '@playwright/test';
import * as dotenv from 'dotenv';
import { runHappyPathTest, BOG_BANK, TBC_BANK, LIBERTY_BANK, CREDO_BANK, runAuthenticationSuccessTest, runBalanceUpdateTest, runPaymentDescriptionTest, BALANCE_UPDATE_AMOUNT } from '../helpers';
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

  // Balance Update - per currency
  test('Positive - Balance Update - GEL', async ({ request }) => {
    const result = await runBalanceUpdateTest(request, BALANCE_UPDATE_AMOUNT, ['GEL']);
    allTestResults.push(...result.tableData);
  });

  test('Positive - Balance Update - USD', async ({ request }) => {
    const result = await runBalanceUpdateTest(request, BALANCE_UPDATE_AMOUNT, ['USD']);
    allTestResults.push(...result.tableData);
  });

  test('Positive - Balance Update - EUR', async ({ request }) => {
    const result = await runBalanceUpdateTest(request, BALANCE_UPDATE_AMOUNT, ['EUR']);
    allTestResults.push(...result.tableData);
  });

  // Payer Details - per bank
  test('Positive - Payer Details - BOG', async ({ request }) => {
    const result = await runPaymentDescriptionTest(request, [BOG_BANK], false, 'Payer Details', 'Payer Details Cases');
    allTestResults.push(...result.tableData);
  });

  test('Positive - Payer Details - TBC', async ({ request }) => {
    const result = await runPaymentDescriptionTest(request, [TBC_BANK], false, 'Payer Details', 'Payer Details Cases');
    allTestResults.push(...result.tableData);
  });

  test('Positive - Payer Details - Liberty', async ({ request }) => {
    const result = await runPaymentDescriptionTest(request, [LIBERTY_BANK], false, 'Payer Details', 'Payer Details Cases');
    allTestResults.push(...result.tableData);
  });

  test('Positive - Payer Details - CREDO', async ({ request }) => {
    const result = await runPaymentDescriptionTest(request, [CREDO_BANK], false, 'Payer Details', 'Payer Details Cases');
    allTestResults.push(...result.tableData);
  });

  // Payer + Beneficiary Details - per bank
  test('Positive - Payer + Beneficiary Details - BOG', async ({ request }) => {
    const result = await runPaymentDescriptionTest(request, [BOG_BANK], true, 'Payer + Beneficiary Details', 'Payer + Beneficiary Details Cases');
    allTestResults.push(...result.tableData);
  });

  test('Positive - Payer + Beneficiary Details - TBC', async ({ request }) => {
    const result = await runPaymentDescriptionTest(request, [TBC_BANK], true, 'Payer + Beneficiary Details', 'Payer + Beneficiary Details Cases');
    allTestResults.push(...result.tableData);
  });

  test('Positive - Payer + Beneficiary Details - Liberty', async ({ request }) => {
    const result = await runPaymentDescriptionTest(request, [LIBERTY_BANK], true, 'Payer + Beneficiary Details', 'Payer + Beneficiary Details Cases');
    allTestResults.push(...result.tableData);
  });

  test('Positive - Payer + Beneficiary Details - CREDO', async ({ request }) => {
    const result = await runPaymentDescriptionTest(request, [CREDO_BANK], true, 'Payer + Beneficiary Details', 'Payer + Beneficiary Details Cases');
    allTestResults.push(...result.tableData);
  });

  test.afterAll(async () => {
    if (allTestResults.length > 0) {
      const reportGenerator = new HtmlReportGenerator();
      reportGenerator.generateReport(allTestResults, 'Distributor HUB - Positive Tests (Individual)', balanceSummary || undefined, 'positive');
    }
  });
});
