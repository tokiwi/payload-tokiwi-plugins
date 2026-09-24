/**
 * Pins every Payload dependency across the workspace to one exact version, so the same
 * suites can run against the peer floor and against the latest release.
 *
 *   bun run scripts/use-payload.ts 3.90.0
 *   bun run scripts/use-payload.ts latest
 *
 * `payload` and every `@payloadcms/*` package are released in lockstep, so a mixed set is
 * never a valid configuration — they are rewritten together or not at all.
 *
 * `peerDependencies` are left untouched: they are the range under test.
 */

const MANIFEST_FIELDS = ['dependencies', 'devDependencies'] as const

const isPayloadPackage = (name: string) => name === 'payload' || name.startsWith('@payloadcms/')

async function resolveVersion(requested: string): Promise<string> {
  if (requested !== 'latest') return requested

  const response = await fetch('https://registry.npmjs.org/payload/latest')
  if (!response.ok) {
    throw new Error(`Could not resolve payload@latest: ${response.status} ${response.statusText}`)
  }
  return ((await response.json()) as { version: string }).version
}

const requested = process.argv[2]
if (!requested) {
  console.error('Usage: bun run scripts/use-payload.ts <version|latest>')
  process.exit(1)
}

const version = await resolveVersion(requested)
const manifests = new Bun.Glob('**/package.json').scan({ onlyFiles: true })

// `found` counts every Payload dependency seen, `rewritten` counts manifests actually
// rewritten. They diverge whenever the workspace already pins the target version: found
// stays positive while rewritten is zero, which is success, not the tripwire case below.
let found = 0
let rewritten = 0

for await (const path of manifests) {
  if (path.includes('node_modules/')) continue

  const file = Bun.file(path)
  const manifest = (await file.json()) as Record<string, Record<string, string> | undefined>
  const touched: string[] = []

  for (const field of MANIFEST_FIELDS) {
    const deps = manifest[field]
    if (!deps) continue

    for (const name of Object.keys(deps)) {
      if (!isPayloadPackage(name)) continue
      found += 1
      if (deps[name] === version) continue
      deps[name] = version
      touched.push(name)
    }
  }

  if (touched.length === 0) continue

  await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`)
  rewritten += 1
  console.log(`${path}: ${touched.length} dependencies pinned to ${version}`)
}

if (found === 0) {
  throw new Error(`No Payload dependency found to pin — the workspace layout changed.`)
}

if (rewritten === 0) {
  console.log(`${found} Payload dependencies already pinned to ${version}. Nothing to rewrite.`)
} else {
  console.log(`Pinned Payload ${version} across ${rewritten} manifests.`)
}
