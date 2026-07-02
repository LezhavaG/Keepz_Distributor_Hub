import { request as playwrightRequest, APIRequestContext } from '@playwright/test';

/**
 * Creates JIRA bugs for failed test cases (opt-in via CREATE_JIRA_BUGS=true).
 *
 * Each bug includes the captured API details (URL, method, status, body/params,
 * expected vs actual). Bugs are created in the configured project and moved to
 * the "To Do" column. Duplicate open bugs (same summary + label) are skipped.
 */

const LABEL = 'automated-test-failure';
// Target column for new bugs and the statusCategory considered "closed".
// Override per-board via .env (boards may use "Open"/"Backlog", "Completed", etc.).
const TODO_STATUS = process.env.JIRA_TODO_STATUS || 'To Do';
const DONE_STATUS_CATEGORY = process.env.JIRA_DONE_STATUS_CATEGORY || 'Done';

function authHeader(): string {
  const token = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  return `Basic ${token}`;
}

// Max length for the compact Expected/Actual values before truncation.
const MAX_RESULT_LEN = parseInt(process.env.JIRA_DESC_MAX_LEN || '400', 10);

/** Single-line, length-capped rendering of a value for the bug description. */
function compact(value: any): string {
  if (value === undefined || value === null) return 'N/A';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > MAX_RESULT_LEN ? `${s.slice(0, MAX_RESULT_LEN)}… (truncated)` : s;
}

/** Pull the transaction uniqueId from a single call's request/response data. */
function callUniqueId(call: any): string | null {
  return (
    call?.requestBody?.uniqueId ||
    call?.actualResult?.uniqueId ||
    call?.actualResult?.value?.uniqueId ||
    call?.expectedResult?.uniqueId ||
    call?.expectedResult?.value?.uniqueId ||
    null
  );
}

/**
 * Trim the actual result down to only the fields the test actually validates,
 * i.e. the keys present in the expected result. Keeps the bug focused on what
 * was checked (e.g. transactionId + status) instead of the whole response.
 */
function projectToExpected(expected: any, actual: any): any {
  if (
    expected && actual &&
    typeof expected === 'object' && typeof actual === 'object' &&
    !Array.isArray(expected) && !Array.isArray(actual)
  ) {
    // Only trim when the actual response contains every validated key. If any is
    // missing (e.g. the API returned an error object), show the full actual so
    // the real response isn't hidden behind an empty/partial projection.
    if (!Object.keys(expected).every((k) => k in actual)) return actual;
    const out: any = {};
    for (const key of Object.keys(expected)) {
      const ev = expected[key];
      out[key] =
        ev && typeof ev === 'object' && !Array.isArray(ev)
          ? projectToExpected(ev, actual[key])
          : actual[key];
    }
    return out;
  }
  return actual;
}

/** Inline "key=value, key=value" from a URL query string, or null if none. */
function queryParams(url: string): string | null {
  if (!url.includes('?')) return null;
  return url
    .substring(url.indexOf('?') + 1)
    .split('&')
    .map((p) => {
      const [k, v] = p.split('=');
      return `${decodeURIComponent(k)}=${decodeURIComponent(v ?? '')}`;
    })
    .join(', ');
}

/** Short human-readable sentence summarising what actually failed. */
function buildFailureText(testCase: any, calls: any[]): string {
  const first = calls[0];
  const where = testCase.bank && testCase.bank !== 'N/A' ? `${testCase.bank} — ` : '';
  if (!first) return `${where}${testCase.testCaseName} failed.`;

  const exp = first.expectedResult;
  const act = first.actualResult;
  // Transaction cases: the request usually succeeds (HTTP 200) but the
  // transaction status doesn't reach the expected state — call that out.
  if (act && typeof act === 'object' && 'status' in act && exp && typeof exp === 'object' && 'status' in exp) {
    const id = act.transactionId ?? '';
    return `${where}Transaction ${id} returned status "${act.status}", but "${exp.status}" was expected.`.replace(/\s+/g, ' ');
  }
  return `${where}The "${first.name}" result did not match the expected result.`;
}

/** Build a compact wiki-markup description from a failed test case's API calls. */
function buildDescription(testCase: any): string {
  const allCalls = testCase.apiCalls || [];
  const failingCalls = allCalls.filter((c: any) => c.passed === false);
  const calls = failingCalls.length > 0 ? failingCalls : allCalls;

  let desc = `h3. Automated test failure\n\n`;
  desc += `*Test case:* ${testCase.testCaseName}\n`;
  desc += `*Category:* ${testCase.category || 'N/A'}\n`;
  if (testCase.bank && testCase.bank !== 'N/A') desc += `*Bank:* ${testCase.bank}\n`;
  desc += `\n*Description:* ${buildFailureText(testCase, calls)}\n`;
  desc += `\n----\n\n`;

  for (const call of calls) {
    const baseUrl = call.url.includes('?') ? call.url.substring(0, call.url.indexOf('?')) : call.url;
    desc += `h4. ${call.name}\n`;
    desc += `*URL:* ${baseUrl}\n`;
    desc += `*Method:* ${call.method}\n`;
    desc += `*Status Code:* ${call.statusCode}\n`;
    const qp = queryParams(call.url);
    if (qp) desc += `*Query Parameters:* ${qp}\n`;
    const uniqueId = callUniqueId(call);
    if (uniqueId) desc += `*Unique ID:* ${uniqueId}\n`;
    desc += `*Expected Result:* ${compact(call.expectedResult)}\n`;
    desc += `*Actual Result:* ${compact(projectToExpected(call.expectedResult, call.actualResult))}\n`;
    desc += `\n`;
  }

  desc += `_Created automatically by the Distributor HUB test suite._`;
  return desc;
}

function buildSummary(testCase: any): string {
  return `[Automated Test] ${testCase.testCaseName}`;
}

/** Returns the key of an existing open bug with the same summary, or null. */
async function findExistingBug(ctx: APIRequestContext, base: string, summary: string): Promise<string | null> {
  const jql = `project = ${process.env.JIRA_PROJECT_KEY} AND labels = "${LABEL}" AND summary ~ ${JSON.stringify(summary)} AND statusCategory != "${DONE_STATUS_CATEGORY}"`;
  const resp = await ctx.get(`${base}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=1&fields=key`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  if (!resp.ok()) return null;
  const data = await resp.json();
  return data.issues && data.issues.length > 0 ? data.issues[0].key : null;
}

/**
 * Add the issue to the board's ACTIVE sprint (Scrum boards only).
 * Without this, API-created issues sit in the Backlog and don't appear on the
 * "Active sprints" board view. No-op for Kanban boards / if no active sprint.
 */
async function addIssueToActiveSprint(ctx: APIRequestContext, base: string, key: string): Promise<void> {
  const boardId = process.env.JIRA_BOARD_ID;
  if (!boardId) return;
  try {
    const sprintResp = await ctx.get(`${base}/rest/agile/1.0/board/${boardId}/sprint?state=active`, {
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    });
    if (!sprintResp.ok()) return; // Kanban board or no access
    const sprints = (await sprintResp.json()).values || [];
    if (sprints.length === 0) return; // no active sprint
    const sprintId = sprints[0].id;
    await ctx.post(`${base}/rest/agile/1.0/sprint/${sprintId}/issue`, {
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      data: { issues: [key] },
    });
  } catch {
    // ignore - issue still exists in backlog
  }
}

/** Move a newly created issue to the "To Do" column. */
async function transitionToToDo(ctx: APIRequestContext, base: string, key: string): Promise<void> {
  const tResp = await ctx.get(`${base}/rest/api/3/issue/${key}/transitions`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  const transitions = (await tResp.json()).transitions || [];
  const todo = transitions.find((t: any) => t.to?.name === TODO_STATUS || t.name === TODO_STATUS);
  if (!todo) return; // already in To Do or no such transition
  await ctx.post(`${base}/rest/api/3/issue/${key}/transitions`, {
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    data: { transition: { id: todo.id } },
  });
}

/** Convenience: filter failed (non-expected) cases from all results and report them. */
export async function reportFailuresToJira(allResults: any[]): Promise<void> {
  if (process.env.CREATE_JIRA_BUGS !== 'true') return;
  const failed = (allResults || []).filter((tx) => tx.status === 'Failed' && !tx.isExpectedError);
  await createBugsForFailedCases(failed);
}

/** Main entry: create bugs for all failed cases (with dedup). */
export async function createBugsForFailedCases(failedCases: any[]): Promise<void> {
  if (process.env.CREATE_JIRA_BUGS !== 'true') return;
  if (!failedCases || failedCases.length === 0) {
    console.log('🐞 JIRA: no failed cases, nothing to create.');
    return;
  }

  const base = process.env.JIRA_BASE_URL!;
  const ctx = await playwrightRequest.newContext();

  console.log(`🐞 JIRA: creating bugs for ${failedCases.length} failed case(s)...`);

  for (const testCase of failedCases) {
    const summary = buildSummary(testCase);
    try {
      const existing = await findExistingBug(ctx, base, summary);
      if (existing) {
        console.log(`   ⏭️  Skipped (open bug already exists: ${existing}): ${summary}`);
        continue;
      }

      const createResp = await ctx.post(`${base}/rest/api/2/issue`, {
        headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
        data: {
          fields: {
            project: { key: process.env.JIRA_PROJECT_KEY },
            issuetype: { name: 'Bug' },
            summary,
            description: buildDescription(testCase),
            labels: [LABEL],
          },
        },
      });

      if (!createResp.ok()) {
        console.log(`   ❌ Failed to create bug for "${summary}": ${createResp.status()} ${await createResp.text()}`);
        continue;
      }

      const key = (await createResp.json()).key;
      await addIssueToActiveSprint(ctx, base, key); // put it on the active sprint board
      await transitionToToDo(ctx, base, key);
      console.log(`   ✅ Created ${key} (To Do, active sprint): ${summary}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`   ❌ Error creating bug for "${summary}": ${msg}`);
    }
  }

  await ctx.dispose();
}
