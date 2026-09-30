import type { Block, Config, Field, Plugin } from 'payload'

import { imageCarousel, tokiwiBlocksMain } from '@tokiwi/payload-blocks-main'
import type { BlockOptions, BlocksMainPluginConfig } from '@tokiwi/payload-blocks-main'
import { describe, expect, test } from 'tstyche'

// The exported types are this package's product: it ships no runtime behaviour a
// consumer calls beyond building these objects.

describe('imageCarousel', () => {
  test('takes no argument, and returns a Block', () => {
    expect(imageCarousel()).type.toBe<Block>()
    expect(imageCarousel({})).type.toBe<Block>()
  })

  test('takes the escape hatch, and nothing else', () => {
    expect(imageCarousel).type.toBeCallableWith({ fields: (defaults: Field[]) => defaults })
    expect(imageCarousel).type.not.toBeCallableWith({ fields: [] })
    expect(imageCarousel).type.not.toBeCallableWith({ slug: 'custom' })
    expect(imageCarousel).type.not.toBeCallableWith({ relationTo: 'uploads' })
  })

  test('BlockOptions leaves the escape hatch optional', () => {
    expect<BlockOptions>().type.toBeAssignableWith({})
  })
})

describe('tokiwiBlocksMain', () => {
  test('returns a config transformer Payload accepts as a plugin', () => {
    expect(tokiwiBlocksMain({ blocks: [imageCarousel()] })).type.toBeAssignableTo<Plugin>()
    expect(tokiwiBlocksMain({ blocks: [imageCarousel()] })({} as Config)).type.toBe<Config>()
  })

  test('needs blocks, and accepts disabled', () => {
    expect(tokiwiBlocksMain).type.toBeCallableWith({ blocks: [imageCarousel()], disabled: true })
    expect(tokiwiBlocksMain).type.not.toBeCallableWith({})
    expect(tokiwiBlocksMain).type.not.toBeCallableWith({ disabled: true })
    expect(tokiwiBlocksMain).type.not.toBeCallableWith({ blocks: imageCarousel() })
  })

  test('BlocksMainPluginConfig makes only disabled optional', () => {
    expect<BlocksMainPluginConfig>().type.not.toBeAssignableWith({})
    expect<BlocksMainPluginConfig>().type.toBeAssignableWith({ blocks: [imageCarousel()] })
  })
})
