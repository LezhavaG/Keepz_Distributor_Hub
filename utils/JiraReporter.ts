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

function isPlainObject(v: any): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Does an actual value satisfy an expected value? Handles the descriptor forms
 * the suite uses: 'number'/'string' (type checks) and 'A|B' (one-of alternation).
 * Everything else is a deep literal comparison.
 */
function valueMatches(expected: any, actual: any): boolean {
  if (expected === 'number') return typeof actual === 'number';
  if (expected === 'string') return typeof actual === 'string';
  if (typeof expected === 'string' && expected.includes('|')) {
    return expected.split('|').includes(String(actual));
  }
  return JSON.stringify(expected) === JSON.stringify(actual);
}

/** "paymentDescription" -> "payment description" for human-readable text. */
function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase().trim();
}

/** Keys in expected whose value the actual does not satisfy. */
function mismatchedKeys(expected: any, actual: any): string[] {
  if (!isPlainObject(expected) || !isPlainObject(actual)) return [];
  return Object.keys(expected).filter((k) => !valueMatches(expected[k], actual[k]));
}

function pick(obj: any, keys: string[]): any {
  const out: any = {};
  for (const k of keys) out[k] = obj == null ? undefined : obj[k];
  return out;
}

/**
 * Reduce a call's expected/actual to just the mismatched fields, so the bug
 * shows only what differs. Falls back to the full objects when the shapes don't
 * line up (e.g. the actual is an error object missing the validated keys), so
 * nothing is hidden.
 */
function diffForCall(call: any): { expected: any; actual: any } {
  const exp = call.expectedResult;
  const act = call.actualResult;
  if (
    isPlainObject(exp) && isPlainObject(act) &&
    Object.keys(exp).every((k) => k in act)
  ) {
    const mism = mismatchedKeys(exp, act);
    const keys = mism.length > 0 ? mism : Object.keys(exp);
    return { expected: pick(exp, keys), actual: pick(act, keys) };
  }
  return { expected: exp, actual: act };
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

/** Case name with the bank stripped, so per-bank variants collapse together. */
function baseCaseName(testCase: any): string {
  const bank = testCase.bank && testCase.bank !== 'N/A' ? testCase.bank : '';
  let name = testCase.testCaseName || '';
  if (bank && name.includes(bank)) name = name.replace(new RegExp(`\\b${bank}\\b`, 'g'), '');
  return name.replace(/[-–—\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Group failed cases that are identical except for the bank (same category + base name). */
function groupFailedCases(cases: any[]): any[][] {
  const groups = new Map<string, any[]>();
  for (const tc of cases) {
    const key = `${tc.category || 'N/A'}::${baseCaseName(tc)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tc);
  }
  return [...groups.values()];
}

/** Distinct real banks affected by a group of cases, in a stable order. */
function banksOf(group: any[]): string[] {
  const order = ['BOG', 'TBC', 'Liberty', 'CREDO'];
  const set = new Set(group.map((c) => c.bank).filter((b) => b && b !== 'N/A'));
  const known = order.filter((b) => set.has(b));
  const rest = [...set].filter((b) => !order.includes(b));
  return [...known, ...rest];
}

/** Short human-readable sentence summarising what actually failed (case-relevant). */
function buildFailureText(testCase: any, calls: any[], banks: string[]): string {
  const first = calls[0];
  const where = banks.length > 1
    ? `${banks.join(', ')} — `
    : testCase.bank && testCase.bank !== 'N/A' ? `${testCase.bank} — ` : '';
  if (!first) return `${where}${baseCaseName(testCase)} failed.`;

  const exp = first.expectedResult;
  const act = first.actualResult;

  // Transaction status didn't reach the expected state — call it out specifically.
  if (isPlainObject(exp) && isPlainObject(act) && 'status' in exp && 'status' in act && !valueMatches(exp.status, act.status)) {
    const id = act.transactionId ?? '';
    return `${where}Transaction ${id} returned status "${act.status}", but "${exp.status}" was expected.`.replace(/\s+/g, ' ').trim();
  }

  // Otherwise name the field(s) that didn't match, so the text reflects the case.
  const mism = mismatchedKeys(exp, act);
  if (mism.length > 0) {
    const fields = mism.map(humanizeKey).join(', ');
    return `${where}The ${fields} did not match the expected value${mism.length > 1 ? 's' : ''}.`;
  }
  return `${where}The result did not match the expected result.`;
}

/**
 * Build a compact wiki-markup description from a representative failed case.
 * When `banks` has more than one entry, the same failure occurred on several
 * banks — they're listed and a note clarifies the details are from one of them.
 */
function buildDescription(testCase: any, banks: string[]): string {
  const allCalls = testCase.apiCalls || [];
  const failingCalls = allCalls.filter((c: any) => c.passed === false);
  const calls = failingCalls.length > 0 ? failingCalls : allCalls;

  let desc = `h3. Automated test failure\n\n`;
  desc += `*Test case:* ${baseCaseName(testCase)}\n`;
  desc += `*Category:* ${testCase.category || 'N/A'}\n`;
  if (banks.length > 1) {
    desc += `*Affected banks:* ${banks.join(', ')}\n`;
  } else if (testCase.bank && testCase.bank !== 'N/A') {
    desc += `*Bank:* ${testCase.bank}\n`;
  }
  desc += `\n*Description:* ${buildFailureText(testCase, calls, banks)}\n`;
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
    const { expected, actual } = diffForCall(call);
    desc += `*Expected Result:* ${compact(expected)}\n`;
    desc += `*Actual Result:* ${compact(actual)}\n`;
    desc += `\n`;
  }

  if (banks.length > 1) {
    desc += `_The same failure occurs on all affected banks (${banks.join(', ')}); the details above are from ${testCase.bank}._\n\n`;
  }
  desc += `_Created automatically by the Distributor HUB test suite._`;
  return desc;
}

function buildSummary(name: string): string {
  return `[Automated Test] ${name}`;
}

/** Returns the key of an existing open bug with the EXACT same summary, or null. */
async function findExistingBug(ctx: APIRequestContext, base: string, summary: string): Promise<string | null> {
  const jql = `project = ${process.env.JIRA_PROJECT_KEY} AND labels = "${LABEL}" AND summary ~ ${JSON.stringify(summary)} AND statusCategory != "${DONE_STATUS_CATEGORY}"`;
  const resp = await ctx.get(`${base}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=10&fields=summary`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  if (!resp.ok()) return null;
  const data = await resp.json();
  // JQL '~' is a fuzzy text match; require an exact summary match to avoid
  // collapsing e.g. "Payer Details" into "Payer + Beneficiary Details".
  const hit = (data.issues || []).find((i: any) => i.fields?.summary === summary);
  return hit ? hit.key : null;
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

/**
 * Resolve the assignee accountId for auto-created bugs, or null to leave them
 * unassigned. Prefers JIRA_ASSIGNEE_ACCOUNT_ID; otherwise looks up
 * JIRA_ASSIGNEE_EMAIL via user search (Jira Cloud needs accountId, not email).
 */
async function resolveAssigneeAccountId(ctx: APIRequestContext, base: string): Promise<string | null> {
  const explicit = process.env.JIRA_ASSIGNEE_ACCOUNT_ID;
  if (explicit) return explicit;
  const email = process.env.JIRA_ASSIGNEE_EMAIL;
  if (!email) return null;
  try {
    const resp = await ctx.get(`${base}/rest/api/3/user/search?query=${encodeURIComponent(email)}`, {
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    });
    if (!resp.ok()) return null;
    const users = await resp.json();
    if (!Array.isArray(users) || users.length === 0) {
      console.log(`   ⚠️  JIRA: no user found for JIRA_ASSIGNEE_EMAIL "${email}" - bugs left unassigned.`);
      return null;
    }
    return users[0].accountId || null;
  } catch {
    return null;
  }
}

/** Assign an issue to the given accountId. No-op on failure (bug still exists). */
async function assignIssue(ctx: APIRequestContext, base: string, key: string, accountId: string): Promise<void> {
  try {
    await ctx.put(`${base}/rest/api/3/issue/${key}/assignee`, {
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      data: { accountId },
    });
  } catch {
    // ignore - issue still exists, just unassigned
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

  // Resolve the (optional) default assignee once, up front.
  const assigneeAccountId = await resolveAssigneeAccountId(ctx, base);

  // Collapse cases that are identical except for the bank into one bug each.
  const groups = groupFailedCases(failedCases);

  for (const group of groups) {
    const rep = group[0];
    const banks = banksOf(group);
    const summary = buildSummary(baseCaseName(rep));
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
            description: buildDescription(rep, banks),
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
      if (assigneeAccountId) await assignIssue(ctx, base, key, assigneeAccountId);
      const who = assigneeAccountId ? ', assigned' : '';
      const banksNote = banks.length > 1 ? ` [${banks.length} banks: ${banks.join(', ')}]` : banks.length === 1 ? ` [${banks[0]}]` : '';
      console.log(`   ✅ Created ${key} (To Do, active sprint${who})${banksNote}: ${summary}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`   ❌ Error creating bug for "${summary}": ${msg}`);
    }
  }

  await ctx.dispose();
}
