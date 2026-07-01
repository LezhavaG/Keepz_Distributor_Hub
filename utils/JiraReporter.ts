import { request as playwrightRequest, APIRequestContext } from '@playwright/test';

/**
 * Creates JIRA bugs for failed test cases (opt-in via CREATE_JIRA_BUGS=true).
 *
 * Each bug includes the captured API details (URL, method, status, body/params,
 * expected vs actual). Bugs are created in the configured project and moved to
 * the "To Do" column. Duplicate open bugs (same summary + label) are skipped.
 */

const LABEL = 'automated-test-failure';
const TODO_STATUS = 'To Do';

function authHeader(): string {
  const token = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  return `Basic ${token}`;
}

function jsonBlock(label: string, value: any): string {
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return `*${label}:*\n{code}\n${body}\n{code}\n`;
}

/** Build a wiki-markup description from a failed test case's API calls. */
function buildDescription(testCase: any): string {
  const failingCalls = (testCase.apiCalls || []).filter((c: any) => c.passed === false);
  const calls = failingCalls.length > 0 ? failingCalls : (testCase.apiCalls || []);

  let desc = `h3. Automated test failure\n\n`;
  desc += `*Test case:* ${testCase.testCaseName}\n`;
  desc += `*Category:* ${testCase.category || 'N/A'}\n`;
  if (testCase.bank && testCase.bank !== 'N/A') desc += `*Bank:* ${testCase.bank}\n`;
  desc += `\n----\n\n`;

  for (const call of calls) {
    desc += `h4. ${call.name}\n`;
    desc += `*Request URL:* ${call.url}\n`;
    desc += `*Request Method:* ${call.method}\n`;
    desc += `*Status Code:* ${call.statusCode}\n`;
    if (call.method === 'GET' && call.url.includes('?')) {
      const qp: { [k: string]: string } = {};
      call.url.substring(call.url.indexOf('?') + 1).split('&').forEach((p: string) => {
        const [k, v] = p.split('=');
        qp[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
      });
      desc += jsonBlock('Query Parameters', qp);
    } else if (call.requestBody !== undefined) {
      desc += jsonBlock('Request Body', call.requestBody);
    }
    desc += jsonBlock('Expected Result', call.expectedResult);
    desc += jsonBlock('Actual Result', call.actualResult);
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
  const jql = `project = ${process.env.JIRA_PROJECT_KEY} AND labels = "${LABEL}" AND summary ~ ${JSON.stringify(summary)} AND statusCategory != Done`;
  const resp = await ctx.get(`${base}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=1&fields=key`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  if (!resp.ok()) return null;
  const data = await resp.json();
  return data.issues && data.issues.length > 0 ? data.issues[0].key : null;
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
      await transitionToToDo(ctx, base, key);
      console.log(`   ✅ Created ${key} (To Do): ${summary}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`   ❌ Error creating bug for "${summary}": ${msg}`);
    }
  }

  await ctx.dispose();
}
