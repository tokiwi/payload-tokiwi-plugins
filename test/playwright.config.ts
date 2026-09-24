import { defineConfig, devices } from '@playwright/test'

const PORT = 3001
const baseURL = `http://127.0.0.1:${PORT}`
const serve = 'bun run --filter test-app prepare-db && bun run --filter test-app start'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: './test-results',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build and start rather than dev: the suites must not be the first thing
    // that compiles a route, and a production server is what consumers run.
    // prepare-db must run between build and start; see test/app/src/prepare-db.ts
    // for why `next start` alone cannot create the schema.
    //
    // The CI test job already ran `bun run build`; rebuilding here costs a second
    // full Next build on every matrix leg. Locally nothing has built yet.
    command: process.env.CI ? serve : `bun run --filter test-app build && ${serve}`,
    // The app serves nothing at `/` (only `/admin` and `/api`), so polling
    // `baseURL` itself 404s forever and the readiness check never succeeds.
    url: `${baseURL}/admin`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    cwd: '..',
    env: {
      DATABASE_URI: 'file:./e2e.db',
      PAYLOAD_SECRET: 'e2e-secret',
    },
  },
})
