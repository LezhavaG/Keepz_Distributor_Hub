import { APIRequestContext } from '@playwright/test';
import { retestCaseByName } from '../tests/Distributor_HUB/helpers';

/**
 * Closed-loop retest: find our bugs that a developer moved to "Ready For Testing",
 * re-run ONLY that specific case, and move the bug to Testing Done (pass) or
 * Testing Failed (fail) with a comment.
 *
 * Run via `npm run retest-jira` (schedule it hourly with cron or CI).
 */

const LABEL = 'automated-test-failure';
const READY_STATUS = 'READY FOR TESTING';
const PASS_STATUS = 'TESTING DONE';
const FAIL_STATUS = 'TESTING FAILED';

function authHeader(): string {
  const token = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  return `Basic ${token}`;
}

async function getReadyForTestingBugs(request: APIRequestContext, base: string): Promise<Array<{ key: string; summary: string }>> {
  const jql = `project = ${process.env.JIRA_PROJECT_KEY} AND labels = "${LABEL}" AND status = "${READY_STATUS}"`;
  const resp = await request.get(`${base}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  if (!resp.ok()) {
    console.log(`⚠️  JIRA search failed: ${resp.status()} ${await resp.text()}`);
    return [];
  }
  const data = await resp.json();
  return (data.issues || []).map((i: any) => ({ key: i.key, summary: i.fields.summary }));
}

/** Transition an issue to a target status by name (matches available transition). */
async function transitionTo(request: APIRequestContext, base: string, key: string, statusName: string): Promise<boolean> {
  const tResp = await request.get(`${base}/rest/api/3/issue/${key}/transitions`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  const transitions = (await tResp.json()).transitions || [];
  const t = transitions.find((x: any) => (x.to?.name || '').toUpperCase() === statusName.toUpperCase() || (x.name || '').toUpperCase() === statusName.toUpperCase());
  if (!t) {
    console.log(`   ⚠️  No transition to "${statusName}" available from current status of ${key}. Available: ${transitions.map((x: any) => x.to?.name).join(', ')}`);
    return false;
  }
  const post = await request.post(`${base}/rest/api/3/issue/${key}/transitions`, {
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    data: { transition: { id: t.id } },
  });
  return post.ok();
}

async function addComment(request: APIRequestContext, base: string, key: string, text: string): Promise<void> {
  await request.post(`${base}/rest/api/2/issue/${key}/comment`, {
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    data: { body: text },
  });
}

/** Main entry: retest all "Ready For Testing" bugs and update them. */
export async function retestReadyForTestingBugs(request: APIRequestContext): Promise<void> {
  const base = process.env.JIRA_BASE_URL!;
  const bugs = await getReadyForTestingBugs(request, base);

  if (bugs.length === 0) {
    console.log('🔁 Retest: no bugs in "Ready For Testing".');
    return;
  }

  console.log(`🔁 Retest: found ${bugs.length} bug(s) in "Ready For Testing".`);

  for (const bug of bugs) {
    const testCaseName = bug.summary.replace(/^\[Automated Test\]\s*/, '');
    console.log(`   ▶ ${bug.key}: retesting "${testCaseName}"...`);

    const { found, passed } = await retestCaseByName(request, testCaseName);

    if (!found) {
      console.log(`   ⚠️  ${bug.key}: could not resolve test case "${testCaseName}" — skipped.`);
      await addComment(request, base, bug.key, `Automated retest could not resolve the test case "${testCaseName}". Please retest manually.`);
      continue;
    }

    if (passed) {
      const ok = await transitionTo(request, base, bug.key, PASS_STATUS);
      await addComment(request, base, bug.key, `✅ Automated retest PASSED — "${testCaseName}" now behaves as expected.`);
      console.log(`   ✅ ${bug.key}: retest PASSED -> ${ok ? PASS_STATUS : '(transition failed)'}`);
    } else {
      const ok = await transitionTo(request, base, bug.key, FAIL_STATUS);
      await addComment(request, base, bug.key, `❌ Automated retest FAILED — "${testCaseName}" still not behaving as expected.`);
      console.log(`   ❌ ${bug.key}: retest FAILED -> ${ok ? FAIL_STATUS : '(transition failed)'}`);
    }
  }
}
