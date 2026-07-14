import { defineConfig } from '@playwright/test';

/**
 * Playwright Configuration
 * ბრაუზერი იხსნება სრულ ეკრანზე
 */
export default defineConfig({
  testDir: './tests',

  /* After every run, publish the generated HTML report to GitHub Pages.
     Skip with PUBLISH_REPORT=false. */
  globalTeardown: './scripts/global-teardown.ts',

  /* Maximum time one test can run */
  timeout: 0, // No timeout for interactive tests

  /* Run tests in files in parallel */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: false,

  /* Retry on CI only */
  retries: 0,

  /* Reporter: 'list' shows test progress in terminal without deleting folders.
     We avoid the 'html' reporter because it wipes the output folder on each run. */
  reporter: [['list']],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        // ✅ ბრაუზერი სრულ ეკრანზე
        viewport: null,
        launchOptions: {
          args: ['--start-maximized'],
        },
        // 🐌 Slow motion (optional - უნდა თუ არა?)
        // slowMo: 500, // 500ms delay between actions
      },
    },

    // თუ გსურთ Firefox ან WebKit - გააქტიურეთ
    // {
    //   name: 'firefox',
    //   use: {
    //     ...devices['Desktop Firefox'],
    //     viewport: null,
    //     launchOptions: {
    //       args: ['-width=1920', '-height=1080'],
    //     },
    //   },
    // },

    // {
    //   name: 'webkit',
    //   use: {
    //     ...devices['Desktop Safari'],
    //     viewport: null,
    //   },
    // },
  ],
});
