import { withPayload } from '@payloadcms/next/withPayload'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next writes its own AGENTS.md and CLAUDE.md into the application on the first dev run.
  // This repository already has one, and it is binding.
  agentRules: false,
  // The showroom renders block templates that live in the packages, outside this
  // application. Anchoring the root at the repository is what lets Next compile and trace
  // them instead of treating them as foreign files.
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
}

export default withPayload(nextConfig)
