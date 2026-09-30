import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { withPayload } from '@payloadcms/next/withPayload'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The showroom renders block templates that live in the packages, outside this
  // application. Anchoring the root at the repository is what lets Next compile and trace
  // them instead of treating them as foreign files.
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
