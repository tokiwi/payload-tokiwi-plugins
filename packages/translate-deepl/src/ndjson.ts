/**
 * Reading the bulk endpoint's newline-delimited JSON as it arrives.
 *
 * Kept free of React so the framing rules can be tested directly: a chunk
 * boundary can fall anywhere, including mid-character.
 */

/**
 * Calls `onEvent` for every complete line in `body`, as soon as that line lands.
 *
 * A network chunk has nothing to do with a line: one chunk may carry several
 * events, half an event, or split a multi-byte character down the middle.
 */
export const readNdjson = async <T>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void,
): Promise<void> => {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flush = (chunk: string): void => {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) {
        try {
          onEvent(JSON.parse(line) as T)
        } catch {
          /* not our line. The run is still fine */
        }
      }
      newline = buffer.indexOf('\n')
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    flush(decoder.decode(value, { stream: true }))
  }

  // A well-formed stream ends with a newline, but never rely on the last one.
  flush(decoder.decode())
  const tail = buffer.trim()
  if (tail) {
    try {
      onEvent(JSON.parse(tail) as T)
    } catch {
      /* ignore a truncated final line */
    }
  }
}
