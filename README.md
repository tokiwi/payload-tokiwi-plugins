# Payload Tokiwi Plugins

Shared [Payload CMS 3](https://payloadcms.com) plugins used across Tokiwi projects,
developed together in one repository and published independently to npm under the
`@tokiwi` scope.

> Status: bootstrapping. No package is published yet.

## Why this repo exists

Every Payload project we start re-solves the same problems: re-skinning the admin panel,
wiring a translation workflow, rebuilding the same content blocks. Until now that meant
copying folders between projects, where fixes never travelled back.

The goal is that starting a Payload project means installing a few versioned packages
rather than copying code:

```bash
bun add @tokiwi/payload-theme
```

Each package is independent. Installing one never pulls in the others.

## Using a package

Install it, register it in `payload.config.ts`, then regenerate Payload's import map:

```ts
import { tokiwiTheme } from '@tokiwi/payload-theme'

export default buildConfig({
  plugins: [tokiwiTheme({ siteName: 'Example' })],
})
```

```bash
bunx payload generate:importmap   # any package shipping admin components
bunx payload generate:types       # any package adding fields or collections
```

`generate:importmap` rewrites `src/app/(payload)/admin/importMap.js`, which is committed
and is never regenerated at runtime or during a production build. Skipping it leaves
components silently missing from the admin panel. Re-run it after every install, update or
removal.

## Repository layout

```
packages/     one npm package per directory, published independently
app/          the showroom: a Payload application rendering every package
test/         one integration suite per package, plus the Next app they run against
```

The showroom is where the packages are developed and where they are verified to coexist.
CI builds it, runs the suites, then packs every package and installs the tarballs into a
scratch application — that last step is what catches a broken `exports` map.

Conventions are in [`AGENTS.md`](AGENTS.md), which is binding for humans and agents alike.

## Development

Requires [bun](https://bun.sh) 1.4.2 and Node 24, both pinned in `.bun-version` and
`.node-version` and used as-is by CI.

```bash
bun install
bun run dev      # starts the showroom against the workspace packages
bun run build    # build the packages, then the showroom
```

## Releasing

Versioning and publishing are handled by [changesets](https://github.com/changesets/changesets).
A pull request that changes a package includes a changeset describing the bump; merging to
`main` opens a release pull request, and merging that one publishes to npm.

npm versions are immutable and cannot be replaced, which is why publishing is gated behind
an explicit release pull request rather than triggered by every push.

## Compatibility

Payload `^3.90`, declared as a peer dependency. 3.90 carries a security fix every project
should take, so it is the floor rather than a wider range.

## License

MIT
