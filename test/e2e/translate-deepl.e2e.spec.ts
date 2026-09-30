import { expect, test } from '@playwright/test'

import { SEED_USER } from '../app/src/seed'

test.describe('translate with deepl', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin')
    await page.fill('#field-email', SEED_USER.email)
    await page.fill('#field-password', SEED_USER.password)
    await page.click('form button[type="submit"]')
    await page.waitForURL('**/admin')
  })

  test('translates a document from the edit view, formatting and technical fields intact', async ({
    page,
  }) => {
    await page.goto('/admin/collections/pages?locale=fr')
    await page.getByRole('link', { name: 'Bonjour le monde' }).click()

    await page.locator('.doc-controls__popup button').click()

    // The popup is portalled away from its trigger, so a selector that leans on an
    // ancestor matches nothing and the item silently falls to the end of the list.
    const order = await page
      .locator('#action-translate-locale')
      .evaluate((el) => getComputedStyle(el).order)
    expect(order).toBe('2')

    await page.locator('#action-translate-locale').click()

    await page.locator('#field-targetLocale').click()
    await page.getByRole('option', { name: 'en' }).click()
    await page.getByRole('button', { name: 'Translate' }).click()

    // The component redirects to the target locale once the endpoint answers.
    // A regex, not a glob: Playwright compiles `**/` to "anything, then a slash",
    // and the locale arrives on the query string.
    await page.waitForURL(/\?locale=en$/)

    await expect(page.locator('#field-title')).toHaveValue(/^EN: /)
    // The bold run came back attached to its own word, which is what the tag
    // protocol is for: three runs in, three runs out, each prefixed. The lexical
    // field carries no `field-<name>` id, only a `data-field-path`.
    await expect(page.locator('[data-field-path="body"]')).toContainText('EN: bayésiennes')
    // `url` is in the default skip list and is not localized, so it never moved.
    await expect(page.locator('#field-url')).toHaveValue('https://example.test/bonjour')
  })

  test('translates a list selection and streams its progress to the drawer', async ({ page }) => {
    await page.goto('/admin/collections/pages?locale=fr')

    await page.locator('#select-all').check()
    // The list menu is a "More options" dots popup, not a labelled "Actions" button.
    await page.getByRole('button', { name: 'More options' }).click()
    await page.locator('#action-translate-locale-list').click()

    await page.locator('#field-targetLocale').click()
    await page.getByRole('option', { name: 'de' }).click()
    await page.getByRole('button', { name: 'Translate' }).click()

    // The `done` line closed the drawer, which is the only signal that the whole
    // ndjson stream was read rather than the first line only.
    await expect(page.locator('.deepl-translate')).toBeHidden({ timeout: 30_000 })
    await expect(page.locator('.payload-toast-item')).toContainText('1/1')
  })
})
