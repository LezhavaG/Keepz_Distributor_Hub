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
    // Tell GitHub Pages to serve these files as-is (no Jekyll processing) when
    // the folder is published via `npm run publish-report`.
    const noJekyll = path.join(this.reportDir, '.nojekyll');
    if (!fs.existsSync(noJekyll)) fs.writeFileSync(noJekyll, '');
  }

  private isPlainObject(v: any): boolean {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /**
   * Does an actual value satisfy an expected value? Handles the descriptor forms
   * the suite uses: 'number'/'string' (type checks) and 'A|B' (one-of), else a
   * deep literal comparison.
   */
  private valueMatches(expected: any, actual: any): boolean {
    if (expected === 'number') return typeof actual === 'number';
    if (expected === 'string') return typeof actual === 'string';
    if (typeof expected === 'string' && expected.includes('|')) {
      return expected.split('|').includes(String(actual));
    }
    return JSON.stringify(expected) === JSON.stringify(actual);
  }

  /** "paymentDescription" -> "payment description" for readable text. */
  private humanizeKey(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase().trim();
  }

  /** Keys in expected whose value the actual doesn't satisfy. */
  private mismatchedKeys(expected: any, actual: any): string[] {
    if (!this.isPlainObject(expected) || !this.isPlainObject(actual)) return [];
    return Object.keys(expected).filter((k) => !this.valueMatches(expected[k], actual[k]));
  }

  /**
   * Plain-language explanation of why an API call failed, derived from its
   * expected vs actual result — so a tester/dev can understand it at a glance.
   */
  private buildCallFailureReason(call: ApiCall): string {
    const exp = call.expectedResult;
    const act = call.actualResult;

    const short = (v: any): string => {
      if (v === undefined || v === null) return '(missing)';
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return s.length > 200 ? `${s.slice(0, 200)}…` : s;
    };
    // "COMPLETED|SUCCESS" -> "COMPLETED / SUCCESS"
    const options = (v: any): string => (typeof v === 'string' ? v.split('|').join(' / ') : short(v));

    // Transaction status is the most common failure — phrase it clearly.
    if (this.isPlainObject(exp) && this.isPlainObject(act) && 'status' in exp && 'status' in act && !this.valueMatches(exp.status, act.status)) {
      return `We were expecting the status to be "${options(exp.status)}", but instead it was returned as "${short(act.status)}".`;
    }

    // Otherwise name each mismatched field in plain language.
    const mism = this.mismatchedKeys(exp, act);
    if (mism.length > 0) {
      return mism
        .map((k) => `We were expecting the ${this.humanizeKey(k)} to be "${options(exp[k])}", but instead it was "${short(act[k])}".`)
        .join(' ');
    }

    return 'The actual response did not match the expected response.';
  }

  /** Small "N ✓ / M ✗" counts chip shown on nav group/category headers. */
  private countChip(passed: number, failed: number): string {
    return `<span class="nav-counts"><span class="nc-pass">${passed} ✓</span> / <span class="nc-fail${failed > 0 ? ' nc-fail-on' : ''}">${failed} ✗</span></span>`;
  }

  /**
   * Escape HTML so dynamic values (case names, URLs, and especially live API
   * response bodies) can't inject markup/scripts into the published report.
   */
  private esc(value: any): string {
    const s = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return (s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

    const testTypeLabel = testType === 'positive' ? '(Positive Cases)' : testType === 'negative' ? '(Negative Cases)' : '(Full Regression)';

    // Left-nav case tree + right-side detail panels (two-column layout).
    const { nav: navHTML, panels: panelsHTML } = this.buildNavAndPanels(transactions);

    const testCaseSummaryHTML = `
      <h2 style="font-size: 20px; font-weight: 600; color: #333; margin-bottom: 12px;">Test Case Summary - ${testTypeLabel}</h2>
      <div style="padding: 16px; background: #f5f5f5; border-radius: 8px; border-left: 4px solid #667eea;">
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
      background: #eef0f6;
      min-height: 100vh;
    }

    /* Full-width top bar */
    .topbar {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 22px 32px;
      text-align: center;
    }
    .topbar h1 { font-size: 24px; margin-bottom: 4px; }
    .topbar p { font-size: 13px; opacity: 0.9; }

    /* Two-column layout: nav (20%) + main (80%) */
    .layout { display: flex; align-items: flex-start; }

    .nav {
      width: 20%;
      min-width: 240px;
      max-width: 360px;
      background: white;
      border-right: 1px solid #e5e5e5;
      padding: 16px 12px;
      position: sticky;
      top: 0;
      align-self: flex-start;
      max-height: 100vh;
      overflow-y: auto;
    }

    .main {
      flex: 1;
      min-width: 0;
      background: white;
      padding: 24px 32px;
    }

    /* Nav tree */
    .nav-group-btn {
      width: 100%; text-align: left; background: #667eea; color: white; border: none;
      padding: 10px 12px; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer;
      display: flex; justify-content: space-between; align-items: center; margin-top: 10px;
    }
    .nav-cat-btn {
      width: 100%; text-align: left; background: #f2f2f7; border: none; border-left: 3px solid #667eea;
      padding: 8px 10px; font-weight: 500; font-size: 13px; color: #333; cursor: pointer;
      display: flex; justify-content: space-between; align-items: center; margin: 8px 0 4px;
    }
    .nav-group-body, .nav-cat-body { overflow: hidden; }
    .nav-cat-body { padding-left: 6px; }
    .nav-case {
      width: 100%; text-align: left; background: white; border: none; border-bottom: 1px solid #eee;
      padding: 8px 10px; cursor: pointer; font-size: 13px; color: #333;
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
    }
    .nav-case:hover { background: #f7f8ff; }
    .nav-case.active { background: #eef0ff; border-left: 3px solid #667eea; font-weight: 600; }
    .nav-case-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nav-badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap; color: #333; }
    .nav-arrow { font-size: 12px; transition: transform 0.2s; }
    .nav-counts { font-size: 11px; font-weight: 500; opacity: 0.9; white-space: nowrap; }
    .nc-fail-on { font-weight: 700; }

    /* Main / detail panels */
    .main-top { margin-bottom: 20px; }
    .back-btn {
      display: inline-block; padding: 10px 16px; background: #667eea; color: white;
      text-decoration: none; border-radius: 6px; font-weight: 500; margin-bottom: 16px;
    }
    .case-panel { display: none; }
    .case-panel-head { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #eee; padding-bottom: 12px; margin-bottom: 16px; }
    .case-panel-head h2 { font-size: 20px; color: #333; }
    .empty-state { color: #888; text-align: center; padding: 48px 16px; }

    @media (max-width: 768px) {
      .layout { flex-direction: column; }
      .nav { width: 100%; max-width: none; position: static; max-height: none; border-right: none; border-bottom: 1px solid #e5e5e5; }
    }

    button {
      transition: all 0.3s ease;
    }

    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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
    // Collapse/expand a nav group or category (button + following body element).
    function toggleNav(button) {
      const body = button.nextElementSibling;
      const arrow = button.querySelector('.nav-arrow');
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      if (arrow) arrow.style.transform = hidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    }

    // Show one case's detail panel in the right column and highlight its nav item.
    function selectCase(id, el) {
      document.querySelectorAll('.case-panel').forEach(function (p) { p.style.display = 'none'; });
      const panel = document.getElementById(id);
      if (panel) panel.style.display = 'block';
      document.querySelectorAll('.nav-case').forEach(function (n) { n.classList.remove('active'); });
      if (el) el.classList.add('active');
      const empty = document.getElementById('empty-state');
      if (empty) empty.style.display = 'none';
    }

    // Auto-select the first case so the report opens on real content.
    document.addEventListener('DOMContentLoaded', function () {
      const first = document.querySelector('.nav-case');
      if (first) first.click();
    });

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
  <div class="topbar">
    <h1>Distributor HUB Test Report</h1>
    <p>${testName}</p>
  </div>

  <div class="layout">
    <aside class="nav">
      ${navHTML}
    </aside>

    <main class="main">
      <div class="main-top">
        <a href="./index.html" class="back-btn">← Back to Portal</a>
        ${testCaseSummaryHTML}
      </div>
      <div class="panels">
        ${panelsHTML}
        <div class="case-panel empty-state" id="empty-state">Select a test case from the left to view its details.</div>
      </div>
    </main>
  </div>

  <div class="footer">
    Generated on ${new Date().toLocaleString()}
  </div>
</body>
</html>
    `;

    fs.writeFileSync(reportPath, html);
    console.log(`\n📊 HTML Report generated: ${reportPath}`);

    // Cleanup: keep only the last N reports (override via .env MAX_REPORTS_TO_KEEP)
    this.cleanupOldReports(parseInt(process.env.MAX_REPORTS_TO_KEEP || '20', 10));

    // Update report index
    this.updateReportIndex();

    return reportPath;
  }

  // Builds the left-nav case tree and the matching right-side detail panels.
  // Each case in the nav has data-target pointing at its hidden panel; clicking
  // it (selectCase) reveals that panel in the 80% content column.
  private buildNavAndPanels(transactions: TransactionRow[]): { nav: string; panels: string } {
    const isPassed = (tx: TransactionRow) => tx.status === 'Succeeded' || (tx.status === 'Failed' && tx.isExpectedError);
    const hasGroups = transactions.some(tx => tx.testGroup);

    const groups = hasGroups
      ? [
          { label: '🟢 Positive Cases', txs: transactions.filter(tx => tx.testGroup === 'positive') },
          { label: '🔴 Negative Cases', txs: transactions.filter(tx => tx.testGroup === 'negative') },
        ]
      : [
          { label: '✓ Passed Cases', txs: transactions.filter(isPassed) },
          { label: '✗ Failed Cases', txs: transactions.filter(tx => !isPassed(tx)) },
        ];

    let nav = '';
    let panels = '';
    let id = 0;

    for (const group of groups) {
      if (group.txs.length === 0) continue;
      const byCat = this.groupByCategory(group.txs);

      let cats = '';
      for (const [category, cases] of Object.entries(byCat)) {
        let items = '';
        for (const tx of cases) {
          const caseId = `case-${id++}`;
          const passed = isPassed(tx);
          const name = tx.testCaseName || `${tx.bank} - ${tx.currency}`;
          const badge = passed ? 'Passed ✓' : 'Failed ✗';
          const badgeColor = passed ? '#d4edda' : '#f8d7da';

          items += `
            <button type="button" class="nav-case" data-target="${caseId}" onclick="selectCase('${caseId}', this)">
              <span class="nav-case-name">${this.esc(name)}</span>
              <span class="nav-badge" style="background:${badgeColor};">${badge}</span>
            </button>`;

          panels += `
            <section class="case-panel" id="${caseId}" style="display:none;">
              <div class="case-panel-head">
                <h2>${this.esc(name)}</h2>
                <span class="nav-badge" style="background:${badgeColor};">${badge}</span>
              </div>
              ${this.buildCaseDetailContent(tx)}
            </section>`;
        }

        const catPassed = cases.filter(isPassed).length;
        cats += `
          <div class="nav-cat">
            <button type="button" class="nav-cat-btn" onclick="toggleNav(this)">
              <span>📁 ${this.esc(category)} ${this.countChip(catPassed, cases.length - catPassed)}</span><span class="nav-arrow">▼</span>
            </button>
            <div class="nav-cat-body">${items}</div>
          </div>`;
      }

      const grpPassed = group.txs.filter(isPassed).length;
      nav += `
        <div class="nav-group">
          <button type="button" class="nav-group-btn" onclick="toggleNav(this)">
            <span>${group.label} ${this.countChip(grpPassed, group.txs.length - grpPassed)}</span><span class="nav-arrow">▼</span>
          </button>
          <div class="nav-group-body">${cats}</div>
        </div>`;
    }

    return { nav, panels };
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

  // Builds just the detail content for one case (API calls, tables, responses).
  // Rendered inside a right-side panel; the nav supplies the case title/badge.
  private buildCaseDetailContent(tx: TransactionRow): string {
    const badgeColor = tx.status === 'Succeeded' || tx.isExpectedError ? '#d4edda' : '#f8d7da';
    const statusText = tx.status === 'Succeeded' || tx.isExpectedError ? 'Passed ✓' : 'Failed ✗';

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
              <pre style="margin: 4px 0 8px 0; background: #eef6ff; padding: 8px; border-radius: 3px; border-left: 3px solid #4a90d9; overflow-x: auto; font-family: monospace; font-size: 12px; color: #2c5d8a;">${this.esc(queryParams)}</pre>`;
          } else if (call.method !== 'GET' && call.requestBody !== undefined) {
            bodyOrParamsHTML = `<div style="margin-bottom: 4px;"><strong>Request Body:</strong></div>
              <pre style="margin: 4px 0 8px 0; background: #fff8e6; padding: 8px; border-radius: 3px; border-left: 3px solid #f0ad4e; overflow-x: auto; font-family: monospace; font-size: 12px; color: #8a6d3b;">${this.esc(call.requestBody)}</pre>`;
          }

          return `
          <div style="margin-bottom: 16px; padding: 12px; background: white; border: 1px solid #e0e0e0; border-radius: 4px;">
            <div style="font-weight: 600; color: #333; margin-bottom: 12px;">API Call ${idx + 1}: ${this.esc(call.name)}${callBadge}</div>
            <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
              <div style="margin-bottom: 4px;"><strong>Request URL:</strong> <code style="color: #0066cc; word-break: break-all;">${this.esc(call.url)}</code></div>
              <div style="margin-bottom: 4px;"><strong>Request Method:</strong> <span style="font-weight: 500;">${this.esc(call.method)}</span></div>
              <div style="margin-bottom: 8px;"><strong>Status Code:</strong> <span style="background: #f0f0f0; padding: 2px 8px; border-radius: 3px; font-family: monospace;">${call.statusCode}</span></div>
              ${bodyOrParamsHTML}
            </div>
            ${call.passed === false ? `<div style="margin-bottom: 12px; padding: 12px 14px; background: #fff3f3; border-left: 4px solid #c62828; border-radius: 4px; color: #8a1f1f; font-size: 13px; line-height: 1.5;">
              <strong>Why this failed:</strong> ${this.esc(this.buildCallFailureReason(call))}
            </div>` : ''}
            <button type="button" onclick="toggleApiDetails(this)" style="width: 100%; padding: 8px 12px; background: #f5f5f5; border: 1px solid #e0e0e0; cursor: pointer; border-radius: 4px; font-size: 12px; color: #333; display: flex; justify-content: space-between; align-items: center;">
              <span>Expected vs Actual Response</span>
              <span class="api-arrow" style="font-size: 14px; transition: transform 0.3s; transform: rotate(-90deg);">▼</span>
            </button>
            <div class="api-details" style="display: none; margin-top: 12px; padding: 12px; background: #f9f9f9; border-radius: 4px; border-left: 3px solid #667eea; font-family: monospace; font-size: 12px; line-height: 1.5; max-height: 400px; overflow-y: auto;">
              <div style="margin-bottom: 12px;">
                <strong style="color: #333;">Expected Result:</strong>
                <pre style="margin: 8px 0 0 0; background: white; padding: 8px; border-radius: 3px; overflow-x: auto; color: #0066cc;">${this.esc(call.expectedResult)}</pre>
              </div>
              <div>
                <strong style="color: #333;">Actual Result:</strong>
                <pre style="margin: 8px 0 0 0; background: white; padding: 8px; border-radius: 3px; overflow-x: auto; color: #066600;">${this.esc(call.actualResult)}</pre>
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
                  <strong style="color: #333;">${this.esc(parts[0])}</strong><br>
                  ${parts.slice(1).map(p => `<span style="color: #666; font-size: 13px;">${this.esc(p)}</span>`).join('<br>')}
                </div>`;
              }
              return this.esc(line);
            })
            .join('');
        }

        // Add uniqueId to response if available
        const uniqueIdSection = tx.uniqueId ? `<div style="margin-bottom: 12px; padding: 12px; background: #f0f0f0; border-radius: 4px; border-left: 3px solid #667eea;"><strong style="color: #333;">Unique ID:</strong> <code style="color: #0066cc; font-family: monospace; word-break: break-all; font-size: 12px;">${this.esc(tx.uniqueId)}</code></div>` : '';

        responseSection = `
            <button type="button" onclick="toggleError(this)" style="width: 100%; padding: 12px 16px; background: none; border: none; cursor: pointer; text-align: left; font-size: 13px; color: ${textColor}; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e0e0e0;">
              <span>📋 ${isBalanceCheck ? 'Balance Details' : 'Response'}</span>
              <span style="font-size: 16px;">▼</span>
            </button>
            <div class="error-detail" style="background-color: ${backgroundColor}; color: ${textColor}; ${isBalanceCheck ? 'background: white; border: none; color: #333;' : ''}">
              ${uniqueIdSection}
              ${isBalanceCheck ? formattedMessage : this.esc(tx.errorMessage)}
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
              <td>${this.esc(tx.bank)}</td>
              <td>${tx.amount.toFixed(2)}</td>
              <td>${this.esc(tx.currency)}</td>
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
                  <strong style="color: #333;">Unique ID:</strong> <code style="color: #0066cc; font-family: monospace; word-break: break-all; font-size: 12px;">${this.esc(tx.uniqueId)}</code>
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
                  ${this.esc(tx.errorMessage)}
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

    return contentHTML;
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

}
