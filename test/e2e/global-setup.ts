import { startFakeDeepl } from './fake-deepl'

/**
 * Playwright runs this before the web server starts, which is what lets
 * `test/app` point at a DeepL that is already listening. The port is fixed rather
 * than picked: the application reads it from its own environment, set in
 * `playwright.config.ts`, and two values agreeing by construction beats two
 * values agreeing by convention.
 */
export const FAKE_DEEPL_PORT = 3002

export default async (): Promise<() => Promise<void>> => {
  const server = await startFakeDeepl(FAKE_DEEPL_PORT)
  return () => server.close()
}
