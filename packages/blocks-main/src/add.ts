import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Block, Field } from 'payload'

import { imageCarousel } from './blocks/imageCarousel.js'

/**
 * `add` writes into someone else's repository, so it never creates a directory, never
 * overwrites without `--force`, and leaves a provenance header behind.
 */

type Template = {
  block: Block
  /** Relative to `templates/`, and its basename is the name the copy takes. */
  file: string
}

export const TEMPLATES: Record<string, Template> = {
  imageCarousel: { block: imageCarousel(), file: 'imageCarousel/ImageCarousel.tsx' },
}

const DEFAULT_DIR = 'src/blocks'

export const USAGE = `Usage: payload-blocks-main add <block> [options]

Blocks:
${Object.keys(TEMPLATES)
  .map((name) => `  ${name}`)
  .join('\n')}

Options:
  --dir <path>  Directory to write the component into (default: ${DEFAULT_DIR})
  --force       Overwrite an existing file
  --dry-run     Print what would happen, write nothing`

export type AddContext = {
  /** The project being written into. */
  cwd: string
  /** The installed package, holding `package.json` and `templates/`. */
  packageRoot: string
}

type Flags = {
  directory: string
  dryRun: boolean
  force: boolean
}

const parseFlags = (argv: string[]): Flags => {
  const flags: Flags = { directory: DEFAULT_DIR, dryRun: false, force: false }

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]

    if (flag === '--dir') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error('`--dir` needs a path.')
      flags.directory = value
      index += 1
    } else if (flag === '--force') {
      flags.force = true
    } else if (flag === '--dry-run') {
      flags.dryRun = true
    } else {
      throw new Error(`Unknown option: ${flag}\n\n${USAGE}`)
    }
  }

  return flags
}

/** The fields the copied component reads, before the project extends the schema. */
const describeFields = (fields: Field[], indent = '  '): string[] =>
  fields.flatMap((field) => {
    const label = 'name' in field ? field.name : field.type
    const required = 'required' in field && field.required ? ' (required)' : ''
    const nested = 'fields' in field ? describeFields(field.fields, `${indent}  `) : []

    return [`${indent}${label}: ${field.type}${required}`, ...nested]
  })

const isDirectory = async (target: string): Promise<boolean> =>
  await stat(target).then(
    (entry) => entry.isDirectory(),
    () => false,
  )

const exists = async (target: string): Promise<boolean> =>
  await stat(target).then(
    () => true,
    () => false,
  )

/** Copies one template into the project. Returns the lines the command prints. */
export const add = async (argv: string[], context: AddContext): Promise<string[]> => {
  const [name, ...rest] = argv
  const template = name === undefined ? undefined : TEMPLATES[name]

  if (name === undefined || template === undefined) {
    throw new Error(`Unknown block: ${name ?? '(none given)'}\n\n${USAGE}`)
  }

  const flags = parseFlags(rest)
  const directory = path.resolve(context.cwd, flags.directory)

  if (!(await isDirectory(directory))) {
    throw new Error(`No such directory: ${flags.directory}. Create it first, or pass --dir <path>.`)
  }

  const destination = path.join(directory, path.basename(template.file))
  const relative = path.relative(context.cwd, destination)

  if ((await exists(destination)) && !flags.force) {
    throw new Error(`${relative} already exists. Pass --force to overwrite it.`)
  }

  const manifest = JSON.parse(
    await readFile(path.join(context.packageRoot, 'package.json'), 'utf8'),
  ) as { name: string; version: string }
  const source = await readFile(path.join(context.packageRoot, 'templates', template.file), 'utf8')

  if (flags.dryRun) {
    return [
      `Would write ${relative}`,
      '',
      `${name} fields:`,
      ...describeFields(template.block.fields),
    ]
  }

  await writeFile(destination, `// from ${manifest.name}@${manifest.version}: ${name}\n${source}`)

  return [
    `Wrote ${relative}`,
    '',
    `${name} fields:`,
    ...describeFields(template.block.fields),
    '',
    'Register the block, then run `bunx payload generate:types`.',
  ]
}
