# Agent instructions

Rules for this repository. Written for coding agents, binding on humans too. This file
is the single source of truth: a local `CLAUDE.md` may add local context, never a rule,
and never a restatement of one from here.

## What this repository is

A public monorepo of Payload CMS 3 plugins, published as independent npm packages under
the `@tokiwi` scope. The monorepo is the development layout only: a consumer installs
one package and never receives the others.

These packages are dependencies of several client projects at once. A defect here
reaches all of them, and a published npm version can never be replaced. The standard is
therefore not the standard of a project: nothing lands that the gates below do not prove.

## Hard rules

Never:

- **Commit anything client-specific.** Client names, staging URLs, internal endpoints,
  hardcoded IDs. The repository is public and every commit is permanent. Read every line
  ported out of a client project before it enters a commit.
- **Commit slop.** No prose written to look thorough, no documentation of a package,
  option or folder that does not exist yet, no file whose only purpose is to exist, no
  second document restating a rule from this one. Generated filler is the failure mode
  this repository dies of: every line earns its place, and a document that stops earning
  it is deleted rather than kept in sync. When a sentence does the job, it is not a
  section.
- **Commit anything that belongs to one machine.** Editor and tool settings, personal
  notes, scratch state: gitignored or kept outside the repository. `CLAUDE.md` and
  `_local/` already are.
- **Add a package or a feature without a named second consumer.** A package is created
  when a second _named_ project will consume it, and its code is ported from a project
  already running it in production. Everything else is refused, including "we will surely
  need it".
- **Ship branding.** Packages carry neutral defaults. Colours, copy and logos are plugin
  options supplied by the consuming project.
- **Ship an opinion the consumer cannot remove.** No UI library, no design system, no
  markup a project has to fight. A package that can only be used one way does not belong
  here.
- **Break a consumer silently.** A change to a package's options, exports or component
  paths is breaking and is released as a major bump.
- **Bypass a gate.** No `--no-verify`, no skipped CI job, no version bumped by hand, no
  publish outside a release pull request. A failing gate is reported, not routed around.
- **Claim a gate passed without its output.** "It builds" is not a result. The command
  and what it printed are.

## Structure

```
packages/<name>/   one npm package, published as @tokiwi/payload-<name>
app/               the showroom: a Payload application rendering every package
test/<suite>/      one integration suite per package
test/app/          the Next application the suites run against
test/e2e/          the Playwright end-to-end suite, with playwright.config.ts and
                   vitest.config.mts at the test/ root
test/consumer/     the fixture CI installs the packed tarballs into
scripts/           repository tooling, run with bun
```

A package directory is self-contained, with its own `package.json`, build and tests. It never
imports another package by relative path, only through its package name, declared as a
dependency.

Packages resolve through their built `dist` and their `exports` map, in the showroom and
in the suites alike. **Do not add tsconfig `paths` entries that short-circuit a package to
its `src`.** It hides exactly the failures that reach consumers: a malformed `exports`
map, a missing `'use client'` boundary, a stylesheet absent from `files`.

Shared code is not created in advance. When the same helper genuinely appears in three
packages, it is extracted then, with real consumers.

## Package conventions

- **Plugin shape**: a function taking options and returning a Payload config transformer:
  `(options) => (incomingConfig) => Config`. Always spread the incoming config,
  preserve existing arrays (`[...(config.collections || []), ...]`), and always accept a
  `disabled` option that makes the plugin a strict no-op.
- **Server and client entry points are separate.** `.` is imported by `payload.config.ts`
  on the server. `./client` holds the `'use client'` components and carries the stylesheet
  import. Mixing them breaks the Next build.
- **Admin component paths use the package specifier**, not a local path:
  `'@tokiwi/payload-theme/client#Logo'`. This is what frees consumers from any required
  install location.
- **Payload is a peer dependency**, `payload@^3.90`, never a direct one, so consumers keep
  a single Payload instance. The floor is deliberate. Raising it is breaking for existing
  consumers, so it is not raised casually.
- `files` is restricted to what is published, and `publishConfig.access` is `public`
  (scoped packages are restricted by default and publishing fails without it).
- A consumer must run `bunx payload generate:importmap` after installing, updating or
  removing any package that ships admin components, and `generate:types` after any that
  adds fields. Document it in the package README. Skipping it fails silently.

## The blocks packages

`@tokiwi/payload-blocks-main` holds the blocks that belong in every project. Blocks that
are only useful in some of them go to a separate `@tokiwi/payload-blocks-<domain>`
package, which follows every rule below unchanged: same split, same template mechanism,
same CLI contract. The split is spelled out because this is where it matters most:

- It exports **field schemas and types only**. No React, no CSS, no `./client` entry. The
  admin side is what is identical across projects, the rendering is what diverges.
- Each block exposes a minimal fixed schema plus one escape hatch,
  `fields: (defaultFields) => Field[]`. No options object larger than the code it
  configures.
- Neutral front-end components live in `templates/`, shipped inside the tarball but absent
  from the `exports` map: they are data, not code.
- `bunx @tokiwi/payload-blocks-main add <block>` copies a template into the consumer. It
  never overwrites without `--force`, supports `--dry-run`, writes a provenance header
  (`// from @tokiwi/payload-blocks-main@x.y.z: <block>`), refuses a missing target and
  prints the fields the block expects. No interactive wizard, no config file, no framework
  detection. It writes into someone else's project: it is the most dangerous thing here.
- The showroom imports those same template files, so the showroom build type-checks them.
  A broken template cannot be published.
- Templates use **core Tailwind utilities only** (no custom theme keys, no arbitrary
  values, no plugins), so a project on another styling stack can replace them
  mechanically.
- A block enters the package only when its schema is identical in two projects. Compare
  field by field before writing it.

## Styling

Payload ships its admin CSS inside `@layer payload-default`. Our rules are deliberately
**unlayered** so they win without `!important`, whatever the injection order. Keep them
that way.

Per-site values are CSS custom properties injected at runtime from plugin options. They
cannot live in SCSS variables, which compile once at publish time and stop being
configurable by the consumer.

Global admin CSS is injected through `admin.components.providers`, which wraps the whole
panel on every route. Do not rely on `Logo` or `Icon` for it.

## Verification

**CI is the firewall.** Every job below is required on a pull request, and `main` is
protected so a red pull request cannot merge:

- typecheck and lint
- **type tests** (tstyche). For a schema-only package the exported types are the product.
  `tsc` proves they compile, not that they are still the right types.
- build of the showroom (`app/`)
- integration and end-to-end suites, per package
- **pack and install**: `npm pack` each package, install the tarballs into
  `test/consumer/`, run `generate:importmap` there, build it. This is the only job that
  catches `files`, `exports` and `publishConfig.access`.
- the whole matrix against the peer floor and against Payload `latest`

Locally, lint-staged runs format and lint on staged files. That is the entire local
ceremony: this is a handful of plugins, not a framework.

A build proves a package compiles, not that it works. Every package carries integration
tests for the things wiring gets wrong: transformer idempotence, `disabled: true` as a
strict no-op, option validation, existing arrays preserved.

## Releasing

Changesets. A pull request touching a package carries a changeset. Merging to `main` opens
a release pull request, and merging that one publishes. Never publish by hand, never bump a
version in a `package.json`.

## Language

Code, comments, documentation, commit messages and changelogs are in English.

Comments earn their place: they explain a non-obvious decision, never what the line
already says.

No writing tics, in prose, comments, commits or changesets:

- no em or en dash as punctuation, and no semicolon outside code
- no filler openers or closers, no inflated vocabulary (robust, seamless, comprehensive,
  leverage, crucial, powerful)
- no "not just X, but Y", no padded rule-of-three lists, no hedging ("it's worth noting
  that")
- no bold scattered through a paragraph, no closing recap

Commit messages are Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`,
`test:`, `build:`, `ci:`, `chore:`), followed by a short, changelog-style description in
the imperative:

```
feat: add disabled option to the theme plugin
fix: resolve admin components through the package specifier
```

Never:

- an emoji, anywhere in a message
- a mention of an AI tool, a co-author trailer for one, or any "generated with" line
- a paragraph where a line does, or a body restating the diff

Changeset summaries follow the same style: they become the published changelog.
