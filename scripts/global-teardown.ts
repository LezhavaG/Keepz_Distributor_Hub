import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Global teardown — runs once after every test run (pass or fail) and publishes
 * the generated HTML report to GitHub Pages, so the shared link always reflects
 * the latest run:
 *   https://lezhavag.github.io/Keepz_Distributor_Hub/
 *
 * - Skip with PUBLISH_REPORT=false (e.g. quick local debugging runs).
 * - Never fails the test run: publish errors are logged as warnings only.
 */
export default async function globalTeardown(): Promise<void> {
  if (process.env.PUBLISH_REPORT === 'false') {
    console.log('\n📄 Report publish skipped (PUBLISH_REPORT=false).');
    return;
  }

  const reportIndex = path.join('distributor-report', 'index.html');
  if (!fs.existsSync(reportIndex)) {
    console.log('\n📄 No report generated this run — nothing to publish.');
    return;
  }

  try {
    console.log('\n📤 Publishing report to GitHub Pages...');
    execSync('npm run publish-report', { stdio: 'inherit' });
    console.log('✅ Report published: https://lezhavag.github.io/Keepz_Distributor_Hub/');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`⚠️  Report publish failed (test results are unaffected): ${msg}`);
  }
}
