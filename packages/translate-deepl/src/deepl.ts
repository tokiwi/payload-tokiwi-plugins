/**
 * Minimal DeepL v2 client: just the `/translate` call, with the batching and
 * retry behaviour the API actually requires.
 *
 * `fetchImpl` and `sleep` are injectable so the whole thing can be tested without
 * a network or a real backoff wait.
 */

import { MAX_REQUEST_BYTES, MAX_TEXTS_PER_REQUEST, REQUEST_TIMEOUT_MS } from './constants'

export type DeeplTranslateOptions = {
  /** Sent as DeepL's `context`: not translated, not billed, improves short strings. */
  context?: string
  sourceLang: string
  /** `tag_handling: 'xml'`, for the `<s i="N">` protocol in `xml.ts`. */
  tagged?: boolean
  targetLang: string
}

export type DeeplClientOptions = {
  apiBase: string
  apiKey: string
  fetchImpl?: typeof fetch
  formality?: string
  glossaryId?: string
  sleep?: (ms: number) => Promise<void>
}

/**
 * `fatal` means the whole run must stop: no amount of retrying or degrading will
 * help, and continuing would only burn more of a quota that is already gone.
 */
export class DeeplError extends Error {
  readonly fatal: boolean
  readonly status?: number

  constructor(message: string, options: { fatal?: boolean; status?: number } = {}) {
    super(message)
    this.name = 'DeeplError'
    this.fatal = options.fatal ?? false
    this.status = options.status
  }
}

const MAX_ATTEMPTS = 3

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * `DEEPL_API_BASE` is configured as an origin (`https://api-free.deepl.com`), but
 * accept a base that already carries the version prefix rather than producing
 * `/v2/v2/translate`.
 */
export const buildTranslateUrl = (apiBase: string): string => {
  const trimmed = apiBase.trim().replace(/\/+$/, '')
  if (!trimmed) throw new DeeplError('DEEPL_API_BASE is not set', { fatal: true })
  if (/\/v2$/.test(trimmed)) return `${trimmed}/translate`
  return `${trimmed}/v2/translate`
}

/**
 * Splits `texts` into requests that respect both of DeepL's limits: at most 50
 * entries, and a body comfortably under the ~128 KiB cap. A single entry larger
 * than the byte budget still gets its own request — the caller has already tried
 * to break it up, and letting DeepL reject it produces a far clearer message than
 * silently dropping it.
 */
export const batchItems = <T>(items: T[], textOf: (item: T) => string): T[][] => {
  const batches: T[][] = []
  let current: T[] = []
  let currentBytes = 0

  for (const item of items) {
    const bytes = Buffer.byteLength(textOf(item), 'utf8')
    const wouldOverflow =
      current.length >= MAX_TEXTS_PER_REQUEST ||
      (current.length > 0 && currentBytes + bytes > MAX_REQUEST_BYTES)

    if (wouldOverflow) {
      batches.push(current)
      current = []
      currentBytes = 0
    }

    current.push(item)
    currentBytes += bytes
  }

  if (current.length > 0) batches.push(current)
  return batches
}

export const batchTexts = (texts: string[]): string[][] => batchItems(texts, (text) => text)

type DeeplResponse = {
  translations?: { text?: string }[]
}

export class DeeplClient {
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch
  private readonly formality?: string
  private readonly glossaryId?: string
  private readonly sleep: (ms: number) => Promise<void>
  private readonly url: string

  /** Characters DeepL reported billing across every request this client made. */
  charactersBilled = 0

  constructor(options: DeeplClientOptions) {
    this.url = buildTranslateUrl(options.apiBase)
    this.apiKey = options.apiKey
    this.fetchImpl = options.fetchImpl ?? fetch
    this.formality = options.formality
    this.glossaryId = options.glossaryId
    this.sleep = options.sleep ?? defaultSleep
  }

  /**
   * Translates one batch of at most `MAX_TEXTS_PER_REQUEST` strings. DeepL returns
   * `translations` in request order, which is the only thing that keeps the result
   * aligned with the callers' paths.
   */
  async translateBatch(texts: string[], options: DeeplTranslateOptions): Promise<string[]> {
    if (texts.length === 0) return []

    const body: Record<string, unknown> = {
      preserve_formatting: true,
      source_lang: options.sourceLang,
      target_lang: options.targetLang,
      text: texts,
    }
    if (options.tagged) {
      body.tag_handling = 'xml'
      // Without this, DeepL treats `<s>` as document structure and forces a
      // sentence break at every formatting run.
      body.outline_detection = false
    }
    if (options.context) body.context = options.context
    if (this.formality) body.formality = this.formality
    if (this.glossaryId) body.glossary_id = this.glossaryId

    const payload = await this.request(body)
    const translations = payload.translations ?? []
    if (translations.length !== texts.length) {
      throw new DeeplError(
        `DeepL returned ${translations.length} translations for ${texts.length} texts`,
      )
    }
    return translations.map((entry) => entry.text ?? '')
  }

  /** Batches, then translates each batch in turn. Sequential on purpose: see `request`. */
  async translate(texts: string[], options: DeeplTranslateOptions): Promise<string[]> {
    const out: string[] = []
    for (const batch of batchTexts(texts)) {
      out.push(...(await this.translateBatch(batch, options)))
    }
    return out
  }

  private async request(body: Record<string, unknown>): Promise<DeeplResponse> {
    let lastError: DeeplError | undefined

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let response: Response
      try {
        response = await this.fetchImpl(this.url, {
          body: JSON.stringify(body),
          headers: {
            // DeepL's own scheme, not Bearer.
            Authorization: `DeepL-Auth-Key ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        // A network failure hides its real cause on `error.cause`, which is what
        // turns "fetch failed" into a message naming the host or the certificate.
        const cause = error instanceof Error && error.cause ? ` (${String(error.cause)})` : ''
        lastError = new DeeplError(
          `Could not reach DeepL: ${error instanceof Error ? error.message : 'unknown error'}${cause}`,
        )
        if (attempt < MAX_ATTEMPTS) {
          await this.sleep(this.backoffMs(attempt))
          continue
        }
        throw lastError
      }

      if (response.ok) {
        this.recordUsage(response)
        return (await response.json()) as DeeplResponse
      }

      const error = await this.toError(response)
      if (error.fatal || attempt === MAX_ATTEMPTS || !this.isRetryable(response.status)) {
        throw error
      }
      lastError = error
      await this.sleep(this.retryDelayMs(response, attempt))
    }

    throw lastError ?? new DeeplError('DeepL request failed')
  }

  private backoffMs(attempt: number): number {
    // 1s, 2s, plus jitter so several documents translated at once do not retry in lockstep.
    return 2 ** (attempt - 1) * 1000 + Math.floor(Math.random() * 250)
  }

  private isRetryable(status: number): boolean {
    return status === 429 || status >= 500
  }

  private recordUsage(response: Response): void {
    const billed = Number(response.headers.get('x-billed-characters'))
    if (Number.isFinite(billed) && billed > 0) this.charactersBilled += billed
  }

  private retryDelayMs(response: Response, attempt: number): number {
    const retryAfter = Number(response.headers.get('retry-after'))
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 10) * 1000
    return this.backoffMs(attempt)
  }

  private async toError(response: Response): Promise<DeeplError> {
    // The body may carry a `message`, but it may also be HTML from a proxy — never
    // let it grow unbounded into a toast.
    let detail = ''
    try {
      const text = (await response.text()).trim()
      if (text) detail = `: ${text.slice(0, 200)}`
    } catch {
      /* body already consumed or not readable */
    }

    switch (response.status) {
      case 403:
        return new DeeplError('DeepL rejected the credentials — check DEEPL_API_KEY.', {
          fatal: true,
          status: 403,
        })
      case 456:
        return new DeeplError('DeepL translation quota exhausted for this billing period.', {
          fatal: true,
          status: 456,
        })
      default:
        return new DeeplError(`DeepL request failed (${response.status})${detail}`, {
          status: response.status,
        })
    }
  }
}
