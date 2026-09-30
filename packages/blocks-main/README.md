# @tokiwi/payload-blocks-main

The [Payload CMS 3](https://payloadcms.com) blocks that belong in every project, as field
schemas. The package ships no React and no CSS: the admin side is what our projects have in
common, the rendering is what diverges.

```bash
bun add @tokiwi/payload-blocks-main
```

## Register the blocks

```ts
import { imageCarousel, tokiwiBlocksMain } from '@tokiwi/payload-blocks-main'

export default buildConfig({
  plugins: [tokiwiBlocksMain({ blocks: [imageCarousel()] })],
})
```

The plugin puts the blocks in `config.blocks`, Payload's root registry, so a collection
references them by slug instead of repeating the definition:

```ts
{ name: 'layout', type: 'blocks', blockReferences: ['imageCarousel'], blocks: [] }
```

A `blocks` field takes `blockReferences` or `blocks`, never both, which is why the array is
empty.

Then regenerate the types, or the new `blockType` is missing from `payload-types.ts`:

```bash
bunx payload generate:types
```

Nothing here ships admin components, so `generate:importmap` is not needed.

`disabled: true` returns the config untouched.

## Extend a block

Every block ships a minimal fixed schema and one escape hatch. `fields` receives the
default fields and returns the schema you want:

```ts
imageCarousel({
  fields: (defaultFields) => [{ name: 'heading', type: 'text' }, ...defaultFields],
})
```

It is also how you point a block at an upload collection under another slug: rebuild the
field the way your project spells it.

## Copy a front-end component

The package carries [Mantine](https://mantine.dev) components under `templates/`. They are
copied into your project rather than imported, so you own the file from the moment it
lands. On another stack, keep the schemas and write your own.

```bash
bunx @tokiwi/payload-blocks-main add imageCarousel --dir src/blocks
```

It refuses a directory that does not exist, refuses to overwrite without `--force`,
supports `--dry-run`, writes a provenance header, and prints the fields the component
reads.

Mantine is an optional peer dependency, installed only if you copy a template:

```bash
bun add @mantine/core @mantine/hooks @mantine/carousel embla-carousel embla-carousel-react
```

The copied component expects `@mantine/core/styles.css` and `@mantine/carousel/styles.css`
to be imported by the application.

## Blocks

`imageCarousel`: `slides`, a required array of at least one slide, each holding one
required `image` upload from the `media` collection. The template renders a `heading` too,
if you add one through `fields`.
