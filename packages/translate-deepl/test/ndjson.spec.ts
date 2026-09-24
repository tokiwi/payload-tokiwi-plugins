import { describe, expect, it } from 'vitest'

import { readNdjson } from '../src/ndjson'

// Framing only: a network chunk has nothing to do with a line, and these are the
// splits that break a naive reader.

const streamOf = (chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      }
      controller.close()
    },
  })
}

const collect = async (chunks: (string | Uint8Array)[]) => {
  const events: unknown[] = []
  await readNdjson(streamOf(chunks), (event) => events.push(event))
  return events
}

describe('readNdjson', () => {
  it('reads several events out of one chunk', async () => {
    expect(await collect(['{"a":1}\n{"a":2}\n'])).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('joins an event split across chunks', async () => {
    expect(await collect(['{"a":', '1}', '\n'])).toEqual([{ a: 1 }])
  })

  it('handles a chunk boundary landing on the newline itself', async () => {
    expect(await collect(['{"a":1}', '\n{"a":2}\n'])).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('emits a final line that has no trailing newline', async () => {
    expect(await collect(['{"a":1}\n{"a":2}'])).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('survives a multi-byte character split down the middle', async () => {
    // "é" is two bytes. Cut between them so a per-chunk decode would corrupt it.
    const full = new TextEncoder().encode('{"t":"é"}\n')
    const boundary = full.indexOf(0xc3) + 1
    expect(await collect([full.slice(0, boundary), full.slice(boundary)])).toEqual([{ t: 'é' }])
  })

  it('skips a line that is not JSON rather than losing the run', async () => {
    expect(await collect(['{"a":1}\n<proxy noise>\n{"a":2}\n'])).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('ignores blank lines and a truncated tail', async () => {
    expect(await collect(['\n{"a":1}\n\n{"a":'])).toEqual([{ a: 1 }])
  })

  it('yields nothing for an empty stream', async () => {
    expect(await collect([])).toEqual([])
  })
})
