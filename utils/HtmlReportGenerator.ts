import * as fs from 'fs';
import * as path from 'path';

export interface ApiCall {
  name: string;
  url: string;
  method: string;
  statusCode: number;
  requestBody?: any;
  expectedResult: any;
  actualResult: any;
  passed?: boolean;
}

export interface TransactionRow {
  transactionId: number;
  bank: string;
  amount: number;
  currency: string;
  status: 'Succeeded' | 'Failed' | 'Pending';
  errorMessage?: string;
  isExpectedError?: boolean;
  testCaseName?: string;
  skipTransactionTable?: boolean;
  category?: string;
  uniqueId?: string;
  apiCalls?: ApiCall[];
  testGroup?: 'positive' | 'negative';
}

export interface BalanceSummary {
  currency: string;
  initialBalance: number;
  totalTransactions: number;
  totalCommission: number;
  finalBalance: number;
}

export type TestType = 'positive' | 'negative' | 'regression';

export class HtmlReportGenerator {
  private reportDir = './distributor-report';

  constructor() {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  generateReport(transactions: TransactionRow[], testName: string, balanceSummary?: BalanceSummary[], testType: TestType = 'positive'): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    // Check if custom report name is provided via environment variable
    const customName = process.env.REPORT_NAME;
    const filename = customName
      ? `DisHubReport-${customName}-${day}-${month}-${year}-${hours}:${minutes}.html`
      : `DisHubReport-${day}-${month}-${year}-${hours}:${minutes}.html`;
    const reportPath = path.join(this.reportDir, filename);

    // Calculate test case summary
    const passedCases = transactions.filter(tx => tx.status === 'Succeeded' || (tx.status === 'Failed' && tx.isExpectedError));
    const failedCases = transactions.filter(tx => tx.status === 'Failed' && !tx.isExpectedError);
    const totalTestCases = passedCases.length + failedCases.length;

    // If cases are tagged with a testGroup (regression report), split into
    // Positive / Negative top-level sections; otherwise show one flat list.
    const hasGroups = transactions.some(tx => tx.testGroup);
    let testCaseSectionsHTML: string;

    if (hasGroups) {
      const positiveTxs = transactions.filter(tx => tx.testGroup === 'positive');
      const negativeTxs = transactions.filter(tx => tx.testGroup === 'negative');
      testCaseSectionsHTML =
        this.buildGroupSection('🟢 Positive Cases', positiveTxs) +
        this.buildGroupSection('🔴 Negative Cases', negativeTxs);
    } else {
      testCaseSectionsHTML = this.buildStatusSections(transactions);
    }

    const testTypeLabel = testType === 'positive' ? '(Positive Cases)' : testType === 'negative' ? '(Negative Cases)' : '(Full Regression)';

    const testCaseSummaryHTML = `
      <div style="margin-bottom: 32px;">
        <h2 style="font-size: 20px; font-weight: 600; color: #333; margin-bottom: 16px;">Test Case Summary - ${testTypeLabel}</h2>
        <div style="padding: 16px; background: #f5f5f5; border-radius: 8px; border-left: 4px solid #667eea; margin-bottom: 24px;">
          <div style="font-size: 14px; color: #666;">
            <strong>Total Test Cases:</strong> <span style="font-weight: 600; color: #333;">${totalTestCases}</span>
            <span style="margin: 0 8px;">|</span>
            <strong>Passed:</strong> <span style="font-weight: 600; color: #2e7d32;">${passedCases.length}</span>
            <span style="margin: 0 8px;">|</span>
            <strong>Failed:</strong> <span style="font-weight: 600; color: #c62828;">${failedCases.length}</span>
            <span style="margin: 0 8px;">|</span>
            <strong>Success Rate:</strong> <span style="font-weight: 600; color: #333;">${totalTestCases > 0 ? ((passedCases.length / totalTestCases) * 100).toFixed(0) : 0}%</span>
          </div>
        </div>
        ${testCaseSectionsHTML}
      </div>
    `;


    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Distributor HUB Test Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }

    .header h1 {
      font-size: 28px;
      margin-bottom: 8px;
    }

    .header p {
      font-size: 14px;
      opacity: 0.9;
    }

    .content {
      padding: 40px;
    }

    button {
      transition: all 0.3s ease;
    }

    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .status-section {
      border-radius: 6px;
      overflow: hidden;
    }

    .test-case-row {
      border-bottom: 1px solid #e0e0e0;
      background: white;
    }

    .test-case-header {
      padding: 16px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fafafa;
      border-bottom: 1px solid #e0e0e0;
    }

    .test-case-header:hover {
      background: #f0f0f0;
    }

    .test-case-content {
      display: none;
      padding: 16px;
      background: white;
    }

    .test-case-content.expanded {
      display: block;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead {
      background: #f5f5f5;
    }

    th {
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      color: #333;
      border-bottom: 2px solid #e0e0e0;
      font-size: 13px;
    }

    td {
      padding: 12px 16px;
      border-bottom: 1px solid #e0e0e0;
    }

    tbody tr:hover {
      background-color: #fafafa;
    }

    .footer {
      padding: 20px 40px;
      background: #f9f9f9;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      color: #666;
      font-size: 12px;
    }

    .error-detail {
      display: none;
      padding: 12px 16px;
      background-color: #ffe6e6;
      border-top: 1px solid #ffcccc;
      color: #cc0000;
      font-size: 12px;
      font-family: monospace;
    }
  </style>
  <script>
    function toggleSection(button) {
      const section = button.nextElementSibling;
      const arrow = button.querySelector('span:last-child');

      if (section.style.display === 'none') {
        section.style.display = 'block';
        arrow.style.transform = 'rotate(0deg)';
      } else {
        section.style.display = 'none';
        arrow.style.transform = 'rotate(-90deg)';
      }
    }

    function toggleTestCase(element) {
      const content = element.nextElementSibling;
      const arrow = element.querySelector('.arrow');
      content.classList.toggle('expanded');
      arrow.style.transform = content.classList.contains('expanded') ? 'rotate(0deg)' : 'rotate(-90deg)';
    }

    function toggleError(button) {
      const errorDetail = button.parentElement.querySelector('.error-detail');
      const arrow = button.querySelector('span:last-child');
      const isHidden = window.getComputedStyle(errorDetail).display === 'none';

      if (isHidden) {
        errorDetail.style.display = 'block';
        arrow.style.transform = 'rotate(0deg)';
      } else {
        errorDetail.style.display = 'none';
        arrow.style.transform = 'rotate(-90deg)';
      }
    }

    function toggleCategory(button) {
      const categorySection = button.nextElementSibling;
      const arrow = button.querySelector('span:last-child');
      const isHidden = window.getComputedStyle(categorySection).display === 'none';

      if (isHidden) {
        categorySection.style.display = 'block';
        arrow.style.transform = 'rotate(0deg)';
      } else {
        categorySection.style.display = 'none';
        arrow.style.transform = 'rotate(-90deg)';
      }
    }

    function toggleDetails(button) {
      const detailsSection = button.parentElement.querySelector('.details-section');
      const arrow = button.querySelector('.details-arrow');
      const isHidden = window.getComputedStyle(detailsSection).display === 'none';

      if (isHidden) {
        detailsSection.style.display = 'block';
        arrow.style.transform = 'rotate(0deg)';
      } else {
        detailsSection.style.display = 'none';
        arrow.style.transform = 'rotate(-90deg)';
      }
    }

    function toggleApiDetails(button) {
      const apiDetails = button.parentElement.querySelector('.api-details');
      const arrow = button.querySelector('.api-arrow');
      const isHidden = window.getComputedStyle(apiDetails).display === 'none';

      if (isHidden) {
        apiDetails.style.display = 'block';
        arrow.style.transform = 'rotate(0deg)';
      } else {
        apiDetails.style.display = 'none';
        arrow.style.transform = 'rotate(-90deg)';
      }
    }
  </script>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Distributor HUB Test Report</h1>
      <p>${testName}</p>
    </div>

    <div class="content">
      <div style="margin-bottom: 24px;">
        <a href="./index.html" style="display: inline-block; padding: 10px 16px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; transition: background 0.2s;">
          ← Back to Portal
        </a>
      </div>
      ${testCaseSummaryHTML}
    </div>

    <div class="footer">
      Generated on ${new Date().toLocaleString()}
    </div>
  </div>
</body>
</html>
    `;

    fs.writeFileSync(reportPath, html);
    console.log(`\n📊 HTML Report generated: ${reportPath}`);

    // Cleanup: Keep only last 20 reports
    this.cleanupOldReports(20);

    // Update report index
    this.updateReportIndex();

    // Add back button to all existing reports
    this.updateAllReportsWithBackButton();

    return reportPath;
  }

  // Builds the Passed Cases + Failed Cases sections (each grouped by category) for a set of cases.
  private buildStatusSections(transactions: TransactionRow[]): string {
    const passedCases = transactions.filter(tx => tx.status === 'Succeeded' || (tx.status === 'Failed' && tx.isExpectedError));
    const failedCases = transactions.filter(tx => tx.status === 'Failed' && !tx.isExpectedError);

    const groupedPassed = this.groupByCategory(passedCases);
    const groupedFailed = this.groupByCategory(failedCases);

    let html = '';

    if (passedCases.length > 0) {
      const passedRows = Object.entries(groupedPassed)
        .map(([category, cases]) => this.buildCategorySection(category, cases, 'passed'))
        .join('');
      html += `
        <div style="margin-bottom: 24px;">
          <button type="button" onclick="toggleSection(this)" style="width: 100%; padding: 16px; background-color: #d4edda; border: none; cursor: pointer; border-radius: 6px; font-weight: 600; text-align: left; font-size: 16px; display: flex; justify-content: space-between; align-items: center;">
            <span>✓ Passed Cases (${passedCases.length})</span>
            <span style="font-size: 20px;">▼</span>
          </button>
          <div class="status-section" style="display: none; margin-top: 12px;">
            <div style="background: white; border-radius: 6px; overflow: hidden;">
              ${passedRows}
            </div>
          </div>
        </div>
      `;
    }

    if (failedCases.length > 0) {
      const failedRows = Object.entries(groupedFailed)
        .map(([category, cases]) => this.buildCategorySection(category, cases, 'failed'))
        .join('');
      html += `
        <div style="margin-bottom: 24px;">
          <button type="button" onclick="toggleSection(this)" style="width: 100%; padding: 16px; background-color: #f8d7da; border: none; cursor: pointer; border-radius: 6px; font-weight: 600; text-align: left; font-size: 16px; display: flex; justify-content: space-between; align-items: center;">
            <span>✗ Failed Cases (${failedCases.length})</span>
            <span style="font-size: 20px;">▼</span>
          </button>
          <div class="status-section" style="display: none; margin-top: 12px;">
            <div style="background: white; border-radius: 6px; overflow: hidden;">
              ${failedRows}
            </div>
          </div>
        </div>
      `;
    }

    return html;
  }

  // Wraps a Positive/Negative top-level group (used in the regression report).
  private buildGroupSection(label: string, transactions: TransactionRow[]): string {
    if (transactions.length === 0) return '';

    const passed = transactions.filter(tx => tx.status === 'Succeeded' || (tx.status === 'Failed' && tx.isExpectedError)).length;
    const failed = transactions.filter(tx => tx.status === 'Failed' && !tx.isExpectedError).length;

    return `
      <div style="margin-bottom: 32px; border: 2px solid #667eea; border-radius: 8px; overflow: hidden;">
        <button type="button" onclick="toggleSection(this)" style="width: 100%; padding: 18px; background-color: #667eea; color: white; border: none; cursor: pointer; font-weight: 700; text-align: left; font-size: 18px; display: flex; justify-content: space-between; align-items: center;">
          <span>${label} (${transactions.length}) — ${passed} passed, ${failed} failed</span>
          <span style="font-size: 20px; transition: transform 0.3s; transform: rotate(-90deg);">▼</span>
        </button>
        <div class="status-section" style="display: none; padding: 16px;">
          ${this.buildStatusSections(transactions)}
        </div>
      </div>
    `;
  }

  private groupByCategory(transactions: TransactionRow[]): { [key: string]: TransactionRow[] } {
    return transactions.reduce((groups, tx) => {
      const category = tx.category || 'Other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(tx);
      return groups;
    }, {} as { [key: string]: TransactionRow[] });
  }

  private buildCategorySection(category: string, cases: TransactionRow[], type: 'passed' | 'failed'): string {
    const categoryRows = cases
      .map((tx, idx) => this.buildTestCaseRow(tx, idx, type))
      .join('');

    return `
      <div style="margin-bottom: 16px;">
        <button type="button" onclick="toggleCategory(this)" style="width: 100%; padding: 12px 16px; background: #f5f5f5; border: none; cursor: pointer; border-left: 4px solid #667eea; font-weight: 500; font-size: 14px; color: #333; display: flex; justify-content: space-between; align-items: center; text-align: left;">
          <span>📁 ${category}</span>
          <span style="font-size: 16px; transition: transform 0.3s; transform: rotate(-90deg);">▼</span>
        </button>
        <div class="category-section" style="display: none; background: white; border-radius: 0 0 6px 6px; overflow: hidden;">
          ${categoryRows}
        </div>
      </div>
    `;
  }

  private buildTestCaseRow(tx: TransactionRow, idx: number, type: 'passed' | 'failed'): string {
    const badgeColor = tx.status === 'Succeeded' || tx.isExpectedError ? '#d4edda' : '#f8d7da';
    const statusText = tx.status === 'Succeeded' || tx.isExpectedError ? 'Passed ✓' : 'Failed ✗';
    const testCaseName = tx.testCaseName || `${tx.bank} - ${tx.currency}`;

    let contentHTML = '';

    // Build Details section with API calls
    let detailsHTML = '';
    if (tx.apiCalls && tx.apiCalls.length > 0) {
      const apiCallsHTML = tx.apiCalls
        .map((call, idx) => {
          const callBadge = call.passed === undefined ? '' :
            `<span style="background-color: ${call.passed ? '#d4edda' : '#f8d7da'}; color: ${call.passed ? '#155724' : '#721c24'}; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 10px;">${call.passed ? 'Passed ✓' : 'Failed ✗'}</span>`;

          // GET requests: show Query Parameters (parsed from URL) instead of Request Body
          const qIndex = call.url.indexOf('?');
          const isGetWithQuery = call.method === 'GET' && qIndex !== -1;
          let bodyOrParamsHTML = '';
          if (isGetWithQuery) {
            const queryParams: { [key: string]: string } = {};
            call.url.substring(qIndex + 1).split('&').forEach(pair => {
              const [k, v] = pair.split('=');
              queryParams[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
            });
            bodyOrParamsHTML = `<div style="margin-bottom: 4px;"><strong>Query Parameters:</strong></div>
              <pre style="margin: 4px 0 8px 0; background: #eef6ff; padding: 8px; border-radius: 3px; border-left: 3px solid #4a90d9; overflow-x: auto; font-family: monospace; font-size: 12px; color: #2c5d8a;">${JSON.stringify(queryParams, null, 2)}</pre>`;
          } else if (call.method !== 'GET' && call.requestBody !== undefined) {
            bodyOrParamsHTML = `<div style="margin-bottom: 4px;"><strong>Request Body:</strong></div>
              <pre style="margin: 4px 0 8px 0; background: #fff8e6; padding: 8px; border-radius: 3px; border-left: 3px solid #f0ad4e; overflow-x: auto; font-family: monospace; font-size: 12px; color: #8a6d3b;">${typeof call.requestBody === 'string' ? call.requestBody : JSON.stringify(call.requestBody, null, 2)}</pre>`;
          }

          return `
          <div style="margin-bottom: 16px; padding: 12px; background: white; border: 1px solid #e0e0e0; border-radius: 4px;">
            <div style="font-weight: 600; color: #333; margin-bottom: 12px;">API Call ${idx + 1}: ${call.name}${callBadge}</div>
            <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
              <div style="margin-bottom: 4px;"><strong>Request URL:</strong> <code style="color: #0066cc; word-break: break-all;">${call.url}</code></div>
              <div style="margin-bottom: 4px;"><strong>Request Method:</strong> <span style="font-weight: 500;">${call.method}</span></div>
              <div style="margin-bottom: 8px;"><strong>Status Code:</strong> <span style="background: #f0f0f0; padding: 2px 8px; border-radius: 3px; font-family: monospace;">${call.statusCode}</span></div>
              ${bodyOrParamsHTML}
            </div>
            <button type="button" onclick="toggleApiDetails(this)" style="width: 100%; padding: 8px 12px; background: #f5f5f5; border: 1px solid #e0e0e0; cursor: pointer; border-radius: 4px; font-size: 12px; color: #333; display: flex; justify-content: space-between; align-items: center;">
              <span>Expected vs Actual Response</span>
              <span class="api-arrow" style="font-size: 14px; transition: transform 0.3s; transform: rotate(-90deg);">▼</span>
            </button>
            <div class="api-details" style="display: none; margin-top: 12px; padding: 12px; background: #f9f9f9; border-radius: 4px; border-left: 3px solid #667eea; font-family: monospace; font-size: 12px; line-height: 1.5; max-height: 400px; overflow-y: auto;">
              <div style="margin-bottom: 12px;">
                <strong style="color: #333;">Expected Result:</strong>
                <pre style="margin: 8px 0 0 0; background: white; padding: 8px; border-radius: 3px; overflow-x: auto; color: #0066cc;">${JSON.stringify(call.expectedResult, null, 2)}</pre>
              </div>
              <div>
                <strong style="color: #333;">Actual Result:</strong>
                <pre style="margin: 8px 0 0 0; background: white; padding: 8px; border-radius: 3px; overflow-x: auto; color: #066600;">${JSON.stringify(call.actualResult, null, 2)}</pre>
              </div>
            </div>
          </div>
        `;
        })
        .join('');

      detailsHTML = `
        <div style="margin-bottom: 16px; padding: 12px; background: #f9f9f9; border-radius: 4px; border-left: 3px solid #667eea;">
          <button type="button" onclick="toggleDetails(this)" style="width: 100%; padding: 12px; background: none; border: none; cursor: pointer; text-align: left; font-size: 13px; font-weight: 500; color: #333; display: flex; justify-content: space-between; align-items: center;">
            <span>📡 Details (${tx.apiCalls.length} API calls)</span>
            <span class="details-arrow" style="font-size: 16px; transition: transform 0.3s; transform: rotate(-90deg);">▼</span>
          </button>
          <div class="details-section" style="display: none; margin-top: 12px;">
            ${apiCallsHTML}
          </div>
        </div>
      `;
    }

    if (tx.skipTransactionTable) {
      // Show Details (API calls) always, plus an optional Response section if errorMessage exists
      let responseSection = '';

      if (tx.errorMessage) {
        const isError = tx.status === 'Failed';
        const backgroundColor = isError ? '#ffe6e6' : '#e6f2ff';
        const textColor = isError ? '#cc0000' : '#0066cc';

        // Check if this is a balance check response (contains "Initial:" or "Transactions:")
        const isBalanceCheck = tx.errorMessage.includes('Initial:') && tx.errorMessage.includes('Transactions:');

        let formattedMessage = tx.errorMessage;
        if (isBalanceCheck) {
          // Format balance details nicely
          formattedMessage = tx.errorMessage
            .split('\n')
            .map(line => {
              const parts = line.split(' | ');
              if (parts.length > 1) {
                return `<div style="margin-bottom: 12px; padding: 12px; background: white; border-radius: 4px; border-left: 3px solid #667eea;">
                  <strong style="color: #333;">${parts[0]}</strong><br>
                  ${parts.slice(1).map(p => `<span style="color: #666; font-size: 13px;">${p}</span>`).join('<br>')}
                </div>`;
              }
              return line;
            })
            .join('');
        }

        // Add uniqueId to response if available
        const uniqueIdSection = tx.uniqueId ? `<div style="margin-bottom: 12px; padding: 12px; background: #f0f0f0; border-radius: 4px; border-left: 3px solid #667eea;"><strong style="color: #333;">Unique ID:</strong> <code style="color: #0066cc; font-family: monospace; word-break: break-all; font-size: 12px;">${tx.uniqueId}</code></div>` : '';

        responseSection = `
            <button type="button" onclick="toggleError(this)" style="width: 100%; padding: 12px 16px; background: none; border: none; cursor: pointer; text-align: left; font-size: 13px; color: ${textColor}; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e0e0e0;">
              <span>📋 ${isBalanceCheck ? 'Balance Details' : 'Response'}</span>
              <span style="font-size: 16px;">▼</span>
            </button>
            <div class="error-detail" style="background-color: ${backgroundColor}; color: ${textColor}; ${isBalanceCheck ? 'background: white; border: none; color: #333;' : ''}">
              ${uniqueIdSection}
              ${isBalanceCheck ? formattedMessage : tx.errorMessage}
            </div>
        `;
      }

      contentHTML = `
          <div style="padding: 16px;">
            ${detailsHTML}
            ${responseSection}
          </div>
        `;
    } else {
      // Show full transaction table with optional error details
      let transactionDetailsHTML = `
        ${detailsHTML}
        <table style="margin-top: 12px;">
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Bank</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${tx.transactionId}</td>
              <td>${tx.bank}</td>
              <td>${tx.amount.toFixed(2)}</td>
              <td>${tx.currency}</td>
              <td>
                <span style="background-color: ${badgeColor}; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; display: inline-block;">
                  ${statusText}
                </span>
              </td>
            </tr>
      `;

      if (tx.uniqueId) {
        transactionDetailsHTML += `
            <tr>
              <td colspan="5" style="padding: 0;">
                <div style="padding: 12px 16px; background: #f0f0f0; border-top: 1px solid #e0e0e0;">
                  <strong style="color: #333;">Unique ID:</strong> <code style="color: #0066cc; font-family: monospace; word-break: break-all; font-size: 12px;">${tx.uniqueId}</code>
                </div>
              </td>
            </tr>
        `;
      }

      if (tx.errorMessage) {
        transactionDetailsHTML += `
            <tr>
              <td colspan="5" style="padding: 0;">
                <button type="button" onclick="toggleError(this)" style="width: 100%; padding: 12px 16px; background: none; border: none; cursor: pointer; text-align: left; font-size: 13px; color: #856404; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e0e0e0;">
                  <span>📋 Error Details</span>
                  <span style="font-size: 16px;">▼</span>
                </button>
                <div class="error-detail">
                  ${tx.errorMessage}
                </div>
              </td>
            </tr>
        `;
      }

      transactionDetailsHTML += `
          </tbody>
        </table>
      `;

      contentHTML = transactionDetailsHTML;
    }

    return `
      <div class="test-case-row">
        <div class="test-case-header" onclick="toggleTestCase(this)">
          <div style="font-weight: 500; color: #333;">${testCaseName}</div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="background-color: ${badgeColor}; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 500;">
              ${statusText}
            </span>
            <span class="arrow" style="font-size: 18px; transition: transform 0.3s; transform: rotate(-90deg);">▼</span>
          </div>
        </div>
        <div class="test-case-content">
          ${contentHTML}
        </div>
      </div>
    `;
  }

  private cleanupOldReports(maxReports: number): void {
    try {
      if (!fs.existsSync(this.reportDir)) {
        return; // Folder doesn't exist, nothing to clean
      }

      const files = fs.readdirSync(this.reportDir)
        .filter(file => file.startsWith('DisHubReport-') && file.endsWith('.html'))
        .map(file => {
          const filePath = path.join(this.reportDir, file);
          const stat = fs.statSync(filePath);
          // Only include actual files, not directories
          if (stat.isFile()) {
            return {
              name: file,
              path: filePath,
              time: stat.mtimeMs,
            };
          }
          return null;
        })
        .filter(file => file !== null)
        .sort((a, b) => (b?.time || 0) - (a?.time || 0)); // Sort newest first

      if (files.length > maxReports) {
        const filesToDelete = files.slice(maxReports);
        filesToDelete.forEach(file => {
          if (file) {
            fs.unlinkSync(file.path);
            console.log(`🗑️  Deleted old report: ${file.name}`);
          }
        });
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  private updateReportIndex(): void {
    try {
      if (!fs.existsSync(this.reportDir)) {
        return;
      }

      // Get all reports sorted by newest first
      const files = fs.readdirSync(this.reportDir)
        .filter(file => file.startsWith('DisHubReport-') && file.endsWith('.html'))
        .map(file => {
          const filePath = path.join(this.reportDir, file);
          // Check if file exists and is a file (not deleted)
          if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              return {
                name: file,
                time: stat.mtimeMs,
              };
            }
          }
          return null;
        })
        .filter(file => file !== null)
        .sort((a, b) => (b?.time || 0) - (a?.time || 0));

      // Generate index HTML
      const reportLinks = files
        .map(file => {
          const fileNameWithoutExt = file!.name.replace('.html', '');
          const timestamp = file!.name.match(/(\d{2}-\d{2}-\d{4}-\d{2}:\d{2})/)?.[1] || 'Unknown';
          return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
            <a href="./${file!.name}" style="color: #0066cc; text-decoration: none; font-weight: 500;">
              📄 ${fileNameWithoutExt}
            </a>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right; color: #666;">
            ${timestamp}
          </td>
        </tr>
          `;
        })
        .join('');

      const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Distributor HUB - Report Portal</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    .header h1 {
      font-size: 32px;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .header p {
      font-size: 14px;
      opacity: 0.9;
    }
    .content {
      padding: 40px;
    }
    .reports-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .reports-table thead {
      background: #f5f5f5;
    }
    .reports-table th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #333;
      border-bottom: 2px solid #e0e0e0;
    }
    .reports-table tr:hover {
      background: #f9f9f9;
    }
    .reports-table a {
      transition: color 0.2s;
    }
    .reports-table a:hover {
      color: #764ba2;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #999;
    }
    .empty-state p {
      font-size: 16px;
    }
    .footer {
      background: #f5f5f5;
      padding: 20px 40px;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Distributor HUB Report Portal</h1>
      <p>Test Reports Archive</p>
    </div>
    <div class="content">
      ${reportLinks.length > 0 ? `
        <table class="reports-table">
          <thead>
            <tr>
              <th>Report Name</th>
              <th style="width: 180px; text-align: right;">Generated At</th>
            </tr>
          </thead>
          <tbody>
            ${reportLinks}
          </tbody>
        </table>
      ` : `
        <div class="empty-state">
          <p>📭 No reports yet</p>
          <p style="font-size: 14px; margin-top: 10px;">Run tests to generate reports</p>
        </div>
      `}
    </div>
    <div class="footer">
      Generated: ${new Date().toLocaleString()} | Total Reports: ${files.length}
    </div>
  </div>
</body>
</html>
      `;

      const indexPath = path.join(this.reportDir, 'index.html');
      fs.writeFileSync(indexPath, indexHtml);
    } catch (error) {
      console.error('Error updating report index:', error);
    }
  }

  private updateAllReportsWithBackButton(): void {
    try {
      if (!fs.existsSync(this.reportDir)) {
        return;
      }

      const files = fs.readdirSync(this.reportDir)
        .filter(file => file.startsWith('DisHubReport-') && file.endsWith('.html'));

      files.forEach(file => {
        const filePath = path.join(this.reportDir, file);
        let content = fs.readFileSync(filePath, 'utf-8');

        // Check if back button already exists
        if (content.includes('Back to Portal')) {
          return; // Already has back button
        }

        // Add back button after <div class="content">
        const backButtonHTML = `<div style="margin-bottom: 24px;">
        <a href="./index.html" style="display: inline-block; padding: 10px 16px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; transition: background 0.2s;">
          ← Back to Portal
        </a>
      </div>`;

        content = content.replace(
          '<div class="content">',
          `<div class="content">\n      ${backButtonHTML}`
        );

        fs.writeFileSync(filePath, content);
      });
    } catch (error) {
      console.error('Error updating reports with back button:', error);
    }
  }
}
