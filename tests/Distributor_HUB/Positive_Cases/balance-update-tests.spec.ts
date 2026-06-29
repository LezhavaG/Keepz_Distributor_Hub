import { test } from '@playwright/test';
import * as dotenv from 'dotenv';
import { runBalanceUpdateTest } from '../helpers';
import { HtmlReportGenerator } from '../../../utils/HtmlReportGenerator';

dotenv.config();

let allTestResults: any[] = [];

test.describe('Distributor HUB - Balance Update Tests', () => {
  // Flow per currency: check balance -> update balance -> check again -> verify increase
  test('Positive - Balance Update (All Currencies)', async ({ request }) => {
    const result = await runBalanceUpdateTest(request);
    allTestResults.push(...result.tableData);
  });

  test.afterAll(async () => {
    if (allTestResults.length > 0) {
      const reportGenerator = new HtmlReportGenerator();
      reportGenerator.generateReport(allTestResults, 'Distributor HUB - Balance Update Tests', undefined, 'positive');
    }
  });
});
