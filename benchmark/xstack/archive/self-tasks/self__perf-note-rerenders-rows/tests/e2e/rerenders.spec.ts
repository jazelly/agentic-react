import { expect, test } from '@playwright/test'

test('typing a note does not re-render the 200 contact rows (production build)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('option')).toHaveCount(200)
  await page.waitForTimeout(300)
  const count = () => page.evaluate(() => (window as unknown as { __renderCounts?: Record<string, number> }).__renderCounts?.ContactRow ?? 0)
  const before = await count()
  expect(before).toBeGreaterThan(0)
  await page.getByRole('textbox', { name: 'Quick note' }).pressSequentially('hello')
  await expect(page.getByText('5 chars')).toBeVisible()
  expect((await count()) - before).toBe(0)
  await page.getByRole('textbox', { name: 'Search contacts' }).fill('ava')
  await expect(page.getByRole('option')).toHaveCount(10)
  await page.getByRole('option').first().click()
  await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
})
