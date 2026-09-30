import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it } from 'vitest'

import { add } from '../src/add'

// The command writes into someone else's repository, so every refusal below is the
// feature, not an edge case.

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

let cwd: string
let blocks: string

const run = async (argv: string[]) => await add(argv, { cwd, packageRoot })
const written = () => readFileSync(path.join(blocks, 'ImageCarousel.tsx'), 'utf8')

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'tokiwi-add-'))
  blocks = path.join(cwd, 'src', 'blocks')
  mkdirSync(blocks, { recursive: true })
})

describe('add', () => {
  it('copies the template under the default directory', async () => {
    const lines = await run(['imageCarousel'])

    expect(lines[0]).toBe(`Wrote ${path.join('src', 'blocks', 'ImageCarousel.tsx')}`)
    expect(written()).toContain("import { Carousel } from '@mantine/carousel'")
  })

  it('writes a provenance header naming the package version and the block', async () => {
    await run(['imageCarousel'])

    expect(written().split('\n')[0]).toMatch(
      /^\/\/ from @tokiwi\/payload-blocks-main@\S+: imageCarousel$/,
    )
  })

  it('prints the fields the component reads', async () => {
    const lines = await run(['imageCarousel'])

    expect(lines).toContain('  slides: array (required)')
    expect(lines).toContain('    image: upload (required)')
  })

  it('refuses a directory that does not exist rather than creating one', async () => {
    await expect(run(['imageCarousel', '--dir', 'src/components'])).rejects.toThrow(
      /No such directory: src\/components/,
    )
  })

  it('refuses to overwrite without --force', async () => {
    writeFileSync(path.join(blocks, 'ImageCarousel.tsx'), 'mine')

    await expect(run(['imageCarousel'])).rejects.toThrow(/already exists. Pass --force/)
    expect(written()).toBe('mine')
  })

  it('overwrites with --force', async () => {
    writeFileSync(path.join(blocks, 'ImageCarousel.tsx'), 'mine')

    await run(['imageCarousel', '--force'])

    expect(written()).toContain('@mantine/carousel')
  })

  it('writes nothing with --dry-run, and still reports the fields', async () => {
    const lines = await run(['imageCarousel', '--dry-run'])

    expect(lines[0]).toBe(`Would write ${path.join('src', 'blocks', 'ImageCarousel.tsx')}`)
    expect(lines).toContain('  slides: array (required)')
    expect(() => written()).toThrow()
  })

  it('refuses an unknown block, an unknown option and a --dir with no path', async () => {
    await expect(run(['carousel'])).rejects.toThrow(/Unknown block: carousel/)
    await expect(run([])).rejects.toThrow(/Unknown block: \(none given\)/)
    await expect(run(['imageCarousel', '--dirr', 'x'])).rejects.toThrow(/Unknown option: --dirr/)
    await expect(run(['imageCarousel', '--dir'])).rejects.toThrow(/`--dir` needs a path/)
    await expect(run(['imageCarousel', '--dir', '--force'])).rejects.toThrow(/`--dir` needs a path/)
  })
})
