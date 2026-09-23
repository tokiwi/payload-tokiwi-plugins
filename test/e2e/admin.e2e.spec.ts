import { expect, test } from '@playwright/test'

import { SEED_USER } from '../app/src/seed'

test.describe('admin panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin')
    // A freshly seeded database already has the user, so this is always a login,
    // never a first-user creation form.
    await page.fill('#field-email', SEED_USER.email)
    await page.fill('#field-password', SEED_USER.password)
    await page.click('form button[type="submit"]')
    await page.waitForURL('**/admin')
  })

  test('opens the pages collection', async ({ page }) => {
    await page.goto('/admin/collections/pages')

    await expect(page.locator('h1')).toContainText('Pages')
    await expect(page.locator('.collection-list')).toBeVisible()
  })

  test('opens a document and shows the locale selector', async ({ page }) => {
    await page.goto('/admin/collections/pages')
    // The seeded title, not row position, so this survives the list being
    // sorted or paginated differently.
    await page.getByRole('link', { name: 'Bonjour le monde' }).click()

    await expect(page.locator('.doc-controls')).toBeVisible()
    // `aria-label="Locale"` on the selector itself, not the `.localizer`
    // wrapper class, which is markup detail rather than accessibility contract.
    await expect(page.locator('[aria-label="Locale"]')).toBeVisible()
  })
})
