import { test } from '@playwright/test';
import * as dotenv from 'dotenv';
import { retestReadyForTestingBugs } from '../../utils/JiraRetest';

dotenv.config();

/**
 * Closed-loop retest runner.
 * Finds our bugs in "Ready For Testing", re-runs each specific case, and moves
 * the bug to Testing Done (pass) or Testing Failed (fail).
 *
 * Run manually or on a schedule:  npm run retest-jira
 */
test('Retest JIRA bugs in Ready For Testing', async ({ request }) => {
  test.setTimeout(0); // some cases poll transactions
  await retestReadyForTestingBugs(request);
});
