import { startFakeDeepl } from './fake-deepl'

/**
 * Playwright runs this before the web server starts, which is what lets
 * `test/app` point at a DeepL that is already listening. The port is fixed rather
 * than picked: `playwright.config.ts` imports this constant and builds
 * `DEEPL_API_BASE` from it, so the two agree by construction. `test/app` is a
 * separate application and cannot import from the test harness, so its own
 * fallback of the same number still agrees only by convention.
 */
export const FAKE_DEEPL_PORT = 3002

export default async (): Promise<() => Promise<void>> => {
  const server = await startFakeDeepl(FAKE_DEEPL_PORT)
  return () => server.close()
}
