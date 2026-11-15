import { expect, test } from '@playwright/test'

test('Export report button replaces Download next to the Dashboard heading', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  const header = page.getByRole('heading', { level: 1, name: 'Dashboard' }).locator('..')
  const btn = header.getByRole('button', { name: 'Export report' })
  await expect(btn).toBeVisible()
  await expect(btn).toHaveAttribute('data-variant', 'outline')
  await expect(page.getByRole('button', { name: /download/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveAttribute('data-variant', 'outline')
  await expect(page.getByRole('button', { name: 'View all' })).toHaveAttribute('data-variant', 'outline')
  await expect(page.getByRole('button', { name: 'View details' })).toHaveAttribute('data-variant', 'ghost')
  expect(errors).toEqual([])
})
