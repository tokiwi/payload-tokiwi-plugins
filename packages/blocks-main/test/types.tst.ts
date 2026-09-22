import { imageCarousel, tokiwiBlocksMain } from '@tokiwi/payload-blocks-main'
import type { Block, Field, Plugin } from 'payload'
import { expect, test } from 'tstyche'

test('imageCarousel is a Block factory', () => {
  expect(imageCarousel()).type.toBe<Block>()
  expect(imageCarousel).type.toBeCallableWith({ fields: (defaultFields: Field[]) => defaultFields })
})

test('fields is the only option a block takes', () => {
  expect(imageCarousel).type.not.toBeCallableWith({ slug: 'custom' })
  expect(imageCarousel).type.not.toBeCallableWith({ fields: [] })
})

test('tokiwiBlocksMain is a Payload plugin', () => {
  expect(tokiwiBlocksMain({ blocks: [imageCarousel()] })).type.toBeAssignableTo<Plugin>()
  expect(tokiwiBlocksMain).type.toBeCallableWith({ blocks: [imageCarousel()], disabled: true })
})

test('tokiwiBlocksMain needs blocks', () => {
  expect(tokiwiBlocksMain).type.not.toBeCallableWith({})
  expect(tokiwiBlocksMain).type.not.toBeCallableWith({ disabled: true })
})
