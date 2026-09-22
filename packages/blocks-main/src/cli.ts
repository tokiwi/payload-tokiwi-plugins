#!/usr/bin/env node
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Block, Field } from 'payload'

import { imageCarousel } from './blocks/imageCarousel/index.js'

/**
 * Copies a front-end template out of this package and into the project running the
 * command. It writes into someone else's repository, so it never creates a directory,
 * never overwrites without `--force`, and leaves a provenance header behind.
 */

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
  name: string
  version: string
}

const BLOCKS: Record<string, { block: Block; template: string }> = {
  imageCarousel: { block: imageCarousel(), template: 'imageCarousel/ImageCarousel.tsx' },
}

const usage = `Usage: ${manifest.name.split('/')[1]} add <block> [options]

Blocks:
${Object.keys(BLOCKS)
  .map((name) => `  ${name}`)
  .join('\n')}

Options:
  --dir <path>  Directory to write the component into (default: src/blocks)
  --force       Overwrite an existing file
  --dry-run     Print what would happen, write nothing`

// Annotated, not inferred: TypeScript only narrows on a never-returning call when the
// declaration carries the type.
const fail: (message: string) => never = (message) => {
  console.error(message)
  process.exit(1)
}

/** The fields the copied component reads, before the project extends the schema. */
const describeFields = (fields: Field[], indent = '  '): string[] =>
  fields.flatMap((field) => {
    const label = 'name' in field ? field.name : field.type
    const required = 'required' in field && field.required ? ' (required)' : ''
    const nested = 'fields' in field ? describeFields(field.fields, `${indent}  `) : []

    return [`${indent}${label}: ${field.type}${required}`, ...nested]
  })

const [command, blockName, ...flags] = process.argv.slice(2)

if (command === '--help' || command === '-h' || command === undefined) {
  console.log(usage)
  process.exit(command === undefined ? 1 : 0)
}

if (command !== 'add') {
  fail(`Unknown command: ${command}\n\n${usage}`)
}

const entry = blockName === undefined ? undefined : BLOCKS[blockName]
if (blockName === undefined || entry === undefined) {
  fail(`Unknown block: ${blockName ?? '(none given)'}\n\n${usage}`)
}

let directory = 'src/blocks'
let force = false
let dryRun = false

for (let index = 0; index < flags.length; index += 1) {
  const flag = flags[index]

  if (flag === '--dir') {
    const value = flags[index + 1]
    if (value === undefined || value.startsWith('--')) {
      fail('`--dir` needs a path.')
    }
    directory = value
    index += 1
  } else if (flag === '--force') {
    force = true
  } else if (flag === '--dry-run') {
    dryRun = true
  } else {
    fail(`Unknown option: ${flag}\n\n${usage}`)
  }
}

const targetDirectory = path.resolve(process.cwd(), directory)
const target = await stat(targetDirectory).catch(() => null)

if (!target?.isDirectory()) {
  fail(`No such directory: ${directory}. Create it first, or pass --dir <path>.`)
}

const destination = path.join(targetDirectory, path.basename(entry.template))
const relative = path.relative(process.cwd(), destination)
const occupied = await stat(destination).then(
  () => true,
  () => false,
)

if (occupied && !force) {
  fail(`${relative} already exists. Pass --force to overwrite it.`)
}

const template = await readFile(path.join(packageRoot, 'templates', entry.template), 'utf8')

if (dryRun) {
  console.log(`Would write ${relative}`)
} else {
  await writeFile(
    destination,
    `// from ${manifest.name}@${manifest.version} — ${blockName}\n${template}`,
  )
  console.log(`Wrote ${relative}`)
}

console.log(`\n${blockName} fields:\n${describeFields(entry.block.fields).join('\n')}`)
console.log(`\nRegister the block, then run \`bunx payload generate:types\`.`)
