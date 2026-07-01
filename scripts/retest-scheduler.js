/**
 * In-code retest scheduler.
 *
 * Runs the JIRA retest (tests/Distributor_HUB/retest-jira.spec.ts) on a fixed
 * interval - no OS cron needed. Committed to the repo so it works anywhere:
 *
 *   npm run retest-watch
 *
 * Interval is configurable via .env (RETEST_INTERVAL_MINUTES, default 10).
 * Uses recursive scheduling so runs never overlap (waits for each to finish,
 * then waits the interval before the next).
 */
require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

const intervalMin = parseFloat(process.env.RETEST_INTERVAL_MINUTES || '10');
const intervalMs = intervalMin * 60 * 1000;
const projectRoot = path.resolve(__dirname, '..');

function runOnce() {
  const ts = new Date().toISOString();
  console.log(`\n=== [${ts}] Running JIRA retest ===`);
  try {
    execSync('npx playwright test tests/Distributor_HUB/retest-jira.spec.ts', {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  } catch (e) {
    // A failing retest run shouldn't kill the scheduler
    console.error(`   Retest run errored: ${e.message}`);
  }
}

function loop() {
  runOnce();
  console.log(`   ⏱️  Next retest in ${intervalMin} min...`);
  setTimeout(loop, intervalMs);
}

console.log(`🔁 Retest scheduler started — every ${intervalMin} min. Press Ctrl+C to stop.`);
loop();
