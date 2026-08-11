import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Production-preview smoke: login, deep link, one create round-trip per entity, axe on
 * the main screens. Credentials match the seeded demo users.
 */

async function signIn(page: Page): Promise<void> {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible()

  // Demo buttons fill both fields; avoids fighting vee-validate / composed inputs.
  await page.getByRole('button', { name: /admin@ticketing\.test/i }).click()
  await page.getByRole('button', { name: /^sign in$/i }).click()

  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({
    timeout: 15_000,
  })
}

async function openNav(page: Page, name: RegExp): Promise<void> {
  await page
    .getByRole('navigation', { name: /primary/i })
    .getByRole('link', { name })
    .click()
}

test.describe('smoke', () => {
  test('signs in and reaches events via in-app navigation', async ({ page }) => {
    await signIn(page)
    await openNav(page, /^events$/i)
    await expect(page).toHaveURL(/\/events/)
    await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /new event/i })).toBeVisible()
  })

  test('creates a category end to end', async ({ page }) => {
    await signIn(page)
    await openNav(page, /^categories$/i)
    await expect(page.getByRole('heading', { name: 'Categories', exact: true })).toBeVisible()

    await page.getByRole('button', { name: /new category/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel(/name/i).fill(`E2E Category ${Date.now()}`)
    await dialog.getByRole('button', { name: /create category/i }).click()
    await expect(page.getByText(/category created/i)).toBeVisible()
  })

  test('creates an event end to end', async ({ page }) => {
    await signIn(page)
    await openNav(page, /^events$/i)
    await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible()

    await page.getByRole('button', { name: /new event/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel(/name/i).fill(`E2E Event ${Date.now()}`)
    await dialog.getByLabel(/country/i).click()
    await page.getByRole('listbox').getByRole('option').first().click()
    await dialog.getByLabel(/venue/i).fill('E2E Arena')
    await dialog.getByRole('button', { name: /create event/i }).click()
    await expect(page.getByText(/event created/i)).toBeVisible()
  })

  test('creates a ticket end to end', async ({ page }) => {
    await signIn(page)
    await openNav(page, /^tickets$/i)
    await expect(page.getByRole('heading', { name: 'Tickets', exact: true })).toBeVisible()

    await page.getByRole('button', { name: /new ticket/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel(/name/i).fill(`E2E Ticket ${Date.now()}`)

    await dialog.getByLabel(/^event/i).click()
    await page.getByRole('listbox').getByRole('option').first().click()
    await dialog.getByLabel(/^category/i).click()
    await page.getByRole('listbox').getByRole('option').first().click()

    await dialog.getByLabel(/price/i).fill('12.50')
    await dialog.getByLabel(/quantity/i).fill('10')
    await dialog.getByRole('button', { name: /create ticket/i }).click()
    await expect(page.getByText(/ticket created/i)).toBeVisible()
  })
})

test.describe('accessibility', () => {
  test('login, dashboard and list pages have no serious axe violations', async ({ page }) => {
    await page.goto('/login')
    const loginResults = await new AxeBuilder({ page }).analyze()
    expect(
      loginResults.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toEqual([])

    await signIn(page)

    for (const path of ['/', '/events', '/categories', '/tickets'] as const) {
      await page.goto(path, { waitUntil: 'networkidle' })
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })
      const results = await new AxeBuilder({ page }).analyze()
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      )
      expect(serious, `axe serious/critical on ${path}: ${JSON.stringify(serious)}`).toEqual([])
    }
  })
})
