import { expect, test } from '@playwright/test'

test('sign out clears the previous user without a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await expect(page.getByText('olivia@example.com')).toBeVisible()
  await page.getByRole('button', { name: 'Open profile menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByText('Not signed in')).toBeVisible()
  await expect(page.getByText('Olivia Martin')).toHaveCount(0)
  await expect(page.getByText('olivia@example.com')).toHaveCount(0)
  await expect(page.getByText(/Welcome back/)).toHaveCount(0)
  expect(errors).toEqual([])
})
