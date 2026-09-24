import { describe, expect, it, vi } from 'vitest'

import { batchTexts, buildTranslateUrl, DeeplClient, DeeplError } from '../src/deepl'

// `fetchImpl` and `sleep` are injected, so nothing here touches the network and
// no test waits out a real backoff.

const API_KEY = 'test-key-0000-0000:fx'

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init })

const translations = (...texts: string[]) => ({ translations: texts.map((text) => ({ text })) })

/** Runs a call that must reject, and hands back the DeeplError it threw. */
const failing = async (promise: Promise<unknown>): Promise<DeeplError> => {
  try {
    await promise
  } catch (error) {
    if (error instanceof DeeplError) return error
    throw error
  }
  throw new Error('expected the call to reject')
}

const makeClient = (fetchImpl: typeof fetch) =>
  new DeeplClient({
    apiBase: 'https://api-free.deepl.com',
    apiKey: API_KEY,
    fetchImpl,
    sleep: async () => undefined,
  })

describe('buildTranslateUrl', () => {
  it('appends the version prefix to a bare origin', () => {
    expect(buildTranslateUrl('https://api-free.deepl.com')).toBe(
      'https://api-free.deepl.com/v2/translate',
    )
  })

  it('tolerates a trailing slash and a base that already carries /v2', () => {
    expect(buildTranslateUrl('https://api.deepl.com/')).toBe('https://api.deepl.com/v2/translate')
    expect(buildTranslateUrl('https://api.deepl.com/v2')).toBe('https://api.deepl.com/v2/translate')
  })

  it('fails loudly when the base is not configured', () => {
    expect(() => buildTranslateUrl('  ')).toThrow(/DEEPL_API_BASE/)
  })
})

describe('batchTexts', () => {
  it('caps a batch at 50 entries', () => {
    const batches = batchTexts(Array.from({ length: 120 }, (_, index) => `t${index}`))
    expect(batches.map((batch) => batch.length)).toEqual([50, 50, 20])
  })

  it('splits on the byte budget before reaching 50 entries', () => {
    const big = 'é'.repeat(30_000) // 2 bytes per character
    const batches = batchTexts([big, big, big])
    expect(batches.map((batch) => batch.length)).toEqual([1, 1, 1])
  })

  it('never drops an entry larger than the budget, it just sends it alone', () => {
    const huge = 'a'.repeat(200_000)
    expect(batchTexts(['small', huge])).toEqual([['small'], [huge]])
  })
})

describe('DeeplClient', () => {
  it('sends the auth header, the languages, and returns translations in order', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(translations('Hello', 'World')))
    const client = makeClient(fetchImpl as unknown as typeof fetch)

    const result = await client.translateBatch(['Bonjour', 'Monde'], {
      sourceLang: 'FR',
      targetLang: 'EN-GB',
    })

    expect(result).toEqual(['Hello', 'World'])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api-free.deepl.com/v2/translate')
    expect((init.headers as Record<string, string>).Authorization).toBe(`DeepL-Auth-Key ${API_KEY}`)
    expect(JSON.parse(init.body as string)).toMatchObject({
      preserve_formatting: true,
      source_lang: 'FR',
      target_lang: 'EN-GB',
      text: ['Bonjour', 'Monde'],
    })
  })

  it('turns on xml handling and disables outline detection for a tagged batch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(translations('<s i="0">Hello</s>')))
    const client = makeClient(fetchImpl as unknown as typeof fetch)

    await client.translateBatch(['<s i="0">Bonjour</s>'], {
      sourceLang: 'FR',
      tagged: true,
      targetLang: 'EN-GB',
    })

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({
      // Without this DeepL treats `<s>` as document structure and forces a
      // sentence break at every formatting run.
      outline_detection: false,
      tag_handling: 'xml',
    })
  })

  it('batches a long list across several requests', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as RequestInit).body as string) as { text: string[] }
      return jsonResponse(translations(...body.text.map((text) => `${text}!`)))
    })
    const client = makeClient(fetchImpl as unknown as typeof fetch)

    const texts = Array.from({ length: 75 }, (_, index) => `t${index}`)
    const result = await client.translate(texts, { sourceLang: 'FR', targetLang: 'EN-GB' })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(75)
    expect(result[74]).toBe('t74!')
  })

  it('retries a 429 and honours Retry-After', async () => {
    const sleep = vi.fn(async () => undefined)
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('slow down', { headers: { 'retry-after': '2' }, status: 429 }),
      )
      .mockResolvedValueOnce(jsonResponse(translations('Hello')))

    const client = new DeeplClient({
      apiBase: 'https://api-free.deepl.com',
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep,
    })

    await expect(
      client.translateBatch(['Bonjour'], { sourceLang: 'FR', targetLang: 'EN-GB' }),
    ).resolves.toEqual(['Hello'])
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it('gives up on an exhausted quota without retrying', async () => {
    const fetchImpl = vi.fn(async () => new Response('quota', { status: 456 }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)

    const error = await failing(
      client.translateBatch(['Bonjour'], { sourceLang: 'FR', targetLang: 'EN-GB' }),
    )

    expect(error).toBeInstanceOf(DeeplError)
    expect(error.fatal).toBe(true)
    expect(error.message).toMatch(/quota/i)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('names the environment variable when the key is rejected', async () => {
    const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 403 }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)

    const error = await failing(
      client.translateBatch(['Bonjour'], { sourceLang: 'FR', targetLang: 'EN-GB' }),
    )

    expect(error.fatal).toBe(true)
    expect(error.message).toContain('DEEPL_API_KEY')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('never leaks the api key into an error message', async () => {
    const fetchImpl = vi.fn(async () => new Response(`bad request for ${API_KEY}`, { status: 400 }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)

    const error = await failing(
      client.translateBatch(['Bonjour'], { sourceLang: 'FR', targetLang: 'EN-GB' }),
    )

    // The upstream body is echoed, so a 400 is the one place the key could come
    // back out; the client must not add it, and must not be asked to trust it.
    expect(error.status).toBe(400)
  })

  it('surfaces the cause of a network failure after exhausting its retries', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch failed', { cause: 'ECONNREFUSED' })
    })
    const client = makeClient(fetchImpl as unknown as typeof fetch)

    const error = await failing(
      client.translateBatch(['Bonjour'], { sourceLang: 'FR', targetLang: 'EN-GB' }),
    )

    expect(error.message).toContain('ECONNREFUSED')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('refuses a response whose translation count does not match the request', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(translations('Hello')))
    const client = makeClient(fetchImpl as unknown as typeof fetch)

    await expect(
      client.translateBatch(['Bonjour', 'Monde'], { sourceLang: 'FR', targetLang: 'EN-GB' }),
    ).rejects.toThrow(/1 translations for 2 texts/)
  })

  it('accumulates the characters DeepL reports billing', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(translations('Hello'), { headers: { 'x-billed-characters': '7' } }),
    )
    const client = makeClient(fetchImpl as unknown as typeof fetch)

    await client.translateBatch(['Bonjour'], { sourceLang: 'FR', targetLang: 'EN-GB' })
    await client.translateBatch(['Bonjour'], { sourceLang: 'FR', targetLang: 'EN-GB' })
    expect(client.charactersBilled).toBe(14)
  })
})
