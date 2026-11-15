import { expect, test } from '@playwright/test'

test('status page reports the operational API as Operational', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Service status' })).toBeVisible()
  await expect(page.getByText(/API:\s*Operational/)).toBeVisible()
  await expect(page.getByText(/Unavailable/)).toHaveCount(0)
  expect(errors).toEqual([])
})
