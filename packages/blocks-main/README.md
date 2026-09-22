# @tokiwi/payload-blocks-main

The [Payload CMS 3](https://payloadcms.com) blocks that belong in every project, as field
schemas. It ships no React and no CSS: the admin side is what our projects have in common,
the rendering is what diverges.

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
references them by slug rather than repeating the definition:

```ts
{ name: 'layout', type: 'blocks', blocks: [], blockReferences: ['imageCarousel'] }
```

A `blocks` field accepts `blockReferences` **or** `blocks`, never both — hence the empty
array.

Then regenerate the types, or the new `blockType` is missing from `payload-types.ts`:

```bash
bunx payload generate:types
```

No package here ships admin components, so `generate:importmap` is not needed.

`disabled: true` makes the plugin return the config untouched.

## Extend a block

Every block ships a minimal fixed schema and one escape hatch. `fields` receives the
default fields and returns the schema you want:

```ts
imageCarousel({
  fields: (defaultFields) => [{ name: 'heading', type: 'text' }, ...defaultFields],
})
```

## Copy a front-end component

The package carries [Mantine](https://mantine.dev) components. They are copied into your
project, not imported, so you own them from the moment they land — on another stack, keep
the schemas and write your own:

```bash
bunx @tokiwi/payload-blocks-main add imageCarousel --dir src/blocks
```

Mantine is an optional peer dependency, installed only if you copy a template:

```bash
bun add @mantine/core @mantine/hooks @mantine/carousel embla-carousel embla-carousel-react
```

It refuses a directory that does not exist, refuses to overwrite without `--force`,
supports `--dry-run`, writes a provenance header, and prints the fields the component
reads.

## Blocks

`imageCarousel` — an array of slides, each holding one required upload from the `media`
collection. Its template also renders a `heading`, if you add one through `fields`.
