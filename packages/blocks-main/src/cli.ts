#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { add, USAGE } from './add.js'

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const [command, ...argv] = process.argv.slice(2)

if (command === undefined || command === '--help' || command === '-h') {
  console.log(USAGE)
  process.exit(command === undefined ? 1 : 0)
}

if (command !== 'add') {
  console.error(`Unknown command: ${command}\n\n${USAGE}`)
  process.exit(1)
}

try {
  const lines = await add(argv, { cwd: process.cwd(), packageRoot })
  console.log(lines.join('\n'))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
