/**
 * Two endpoints, both `POST` under Payload's API route:
 *
 *   /translate/deepl/:collection/:id   one document, from the edit view
 *   /translate/deepl/:collection       a list-view selection
 *
 * `Endpoint` objects registered on the config, `req.routeParams` for the path
 * params, and `APIError(..., isPublic)` so the reason reaches the editor rather
 * than a generic "Something went wrong".
 *
 * Every Local API call they make runs with `overrideAccess: false` and the
 * caller's user, because the Local API bypasses access control by default: the
 * collection's own `update` permission is what decides whether this is allowed.
 */

import type { Endpoint, PayloadRequest, Where } from 'payload'

import { addDataAndFileToRequest, APIError, ValidationError } from 'payload'

import type { BulkProgressEvent, ResolvedPluginConfig, TranslateRequestBody } from './types'

import { BULK_ENDPOINT_PATH, ENDPOINT_PATH } from './constants'
import { DeeplError } from './deepl'
import { translateDocument } from './translateDocument'
import { translateDocuments, TooManyDocumentsError } from './translateDocuments'

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

type Validated = {
  collection: string
  overwrite: boolean
  sourceLocale: string
  targetLocale: string
}

/** The checks both endpoints share: authentication, collection, and the locales. */
const validate = async (req: PayloadRequest, config: ResolvedPluginConfig): Promise<Validated> => {
  if (!req.user) {
    throw new APIError('Unauthorized', 401)
  }

  const collection = asString(req.routeParams?.collection)
  if (!collection) {
    throw new APIError('Missing collection.', 400, undefined, true)
  }
  if (!config.collections.includes(collection)) {
    throw new APIError(`Translation is not enabled for "${collection}".`, 403, undefined, true)
  }

  await addDataAndFileToRequest(req)
  const body = (req.data ?? {}) as TranslateRequestBody

  const sourceLocale = asString(body.sourceLocale)
  const targetLocale = asString(body.targetLocale)
  const localeCodes = req.payload.config.localization
    ? req.payload.config.localization.localeCodes
    : []

  if (!sourceLocale || !targetLocale) {
    throw new APIError('Both a source and a target locale are required.', 400, undefined, true)
  }
  if (sourceLocale === targetLocale) {
    throw new APIError('Pick a locale other than the current one.', 400, undefined, true)
  }
  for (const locale of [sourceLocale, targetLocale]) {
    if (!localeCodes.includes(locale)) {
      throw new APIError(`Unknown locale "${locale}".`, 400, undefined, true)
    }
  }

  return { collection, overwrite: body.overwrite === true, sourceLocale, targetLocale }
}

/** Turns anything the translator throws into a response the drawer can render. */
const toResponse = (error: unknown): never | Response => {
  if (error instanceof ValidationError) {
    // A slug collision on the target locale lands here. Payload's own field
    // messages are far more useful than anything this endpoint could invent.
    return Response.json(
      { errors: error.data?.errors ?? [{ message: error.message }], ok: false },
      { status: 422 },
    )
  }
  if (error instanceof TooManyDocumentsError) {
    throw new APIError(error.message, 400, undefined, true)
  }
  if (error instanceof DeeplError) {
    // A bad key or an exhausted quota: reportable, and not something a retry will
    // fix. The message never contains the key itself.
    throw new APIError(error.message, 502, undefined, true)
  }
  throw error
}

const buildSingleEndpoint = (config: ResolvedPluginConfig): Endpoint => ({
  handler: async (req) => {
    const { collection, overwrite, sourceLocale, targetLocale } = await validate(req, config)

    const rawId = asString(req.routeParams?.id)
    if (!rawId) {
      throw new APIError('Missing document id.', 400, undefined, true)
    }
    // Numeric ids arrive as strings in the path. Payload wants the real type.
    const id = /^\d+$/.test(rawId) ? Number(rawId) : rawId

    try {
      const result = await translateDocument({
        collection,
        config,
        id,
        overwrite,
        req,
        sourceLocale,
        targetLocale,
      })
      return Response.json(result, { status: result.ok ? 200 : 502 })
    } catch (error) {
      return toResponse(error)
    }
  },
  method: 'post',
  path: ENDPOINT_PATH,
})

/**
 * The bulk endpoint answers with newline-delimited JSON rather than one object:
 * a `start` line with the total, a `document` line as each one finishes, and a
 * `done` line carrying the full result. That is what lets the drawer draw a real
 * progress bar over a selection whose size nothing caps.
 *
 * The consequence is that the status code is committed before any work happens,
 * so it is always 200 once the stream opens. A client must read `done.ok`, not
 * `response.ok`. Failures that happen *before* the stream opens (a bad locale,
 * an empty selection) are still ordinary error responses.
 */
const buildBulkEndpoint = (config: ResolvedPluginConfig): Endpoint => ({
  handler: async (req) => {
    const { collection, overwrite, sourceLocale, targetLocale } = await validate(req, config)

    // The admin appends `useSelection().getQueryParams()` to the URL, so `where`
    // is already Payload's own encoding of the selection: explicit ids for a few
    // rows, or the list's current filters for "select all".
    const where = req.query?.where as undefined | Where
    if (!where || typeof where !== 'object') {
      throw new APIError('No documents selected.', 400, undefined, true)
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: BulkProgressEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        }

        try {
          const result = await translateDocuments({
            collection,
            config,
            onProgress: ({ document, index, total }) => {
              // The first callback is also the first moment the total is known.
              if (index === 0) send({ total, type: 'start' })
              send({ document, index, total, type: 'document' })
            },
            overwrite,
            req,
            sourceLocale,
            targetLocale,
            where,
          })
          send({ ...result, type: 'done' })
        } catch (error) {
          // The headers are long gone, so an error has to travel as a `done` line
          // the client can render, not as a status code.
          send({
            documentsFailed: 0,
            documentsTranslated: 0,
            ok: false,
            partial: true,
            requested: 0,
            results: [
              {
                error: error instanceof Error ? error.message : 'Translation failed.',
                id: '',
                ok: false,
                skipped: 0,
                translated: 0,
              },
            ],
            sourceLocale,
            targetLocale,
            translated: 0,
            type: 'done',
          })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-store',
        // Tells nginx and friends not to sit on the stream until it completes.
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'X-Accel-Buffering': 'no',
      },
    })
  },
  method: 'post',
  path: BULK_ENDPOINT_PATH,
})

/** More specific path first, so `/:collection/:id` is never shadowed. */
export const buildTranslateEndpoints = (config: ResolvedPluginConfig): Endpoint[] => [
  buildSingleEndpoint(config),
  buildBulkEndpoint(config),
]
