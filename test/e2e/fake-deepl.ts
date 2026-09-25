import { createServer, type Server } from 'node:http'

/**
 * A DeepL that answers in a language nobody speaks, on purpose: every returned
 * string is the source prefixed with `EN:`, so an assertion can tell a translated
 * value from an untouched one without depending on a real translation.
 *
 * The `<s i="N">` tags are echoed back **intact**, which is the whole point. A mock
 * that swallowed them would make a broken `applyLexicalStrings` look fine, so the
 * protocol round-trip is tested by construction rather than by a separate case.
 */
const translate = (text: string): string =>
  text.replace(/(<s\s+i="\d+"\s*>)([\s\S]*?)(<\/s>)/g, (_match, open, inner, close) =>
    inner.trim() ? `${open}EN: ${inner}${close}` : `${open}${inner}${close}`,
  )

const answer = (text: string, tagged: boolean): string => (tagged ? translate(text) : `EN: ${text}`)

export const startFakeDeepl = async (port: number): Promise<{ close: () => Promise<void> }> => {
  const server: Server = createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/v2/translate')) {
      res.writeHead(404).end()
      return
    }

    // Read as text directly: under this repo's `lib` target, newer `@types/node`
    // `Buffer` typings do not structurally satisfy `Buffer.concat`'s own parameter
    // type, and the request body is JSON text anyway, so `Buffer` never has to
    // appear.
    req.setEncoding('utf8')
    let raw = ''
    req.on('data', (chunk: string) => (raw += chunk))
    req.on('end', () => {
      const body = JSON.parse(raw) as {
        tag_handling?: string
        text: string[]
      }
      const tagged = body.tag_handling === 'xml'
      const payload = { translations: body.text.map((text) => ({ text: answer(text, tagged) })) }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'x-billed-characters': String(body.text.join('').length),
      })
      res.end(JSON.stringify(payload))
    })
  })

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
