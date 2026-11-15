import { expect, test } from '@playwright/test'

test('dashboard and /reports/acme equivalent still work on the production server', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Project dashboard' })).toBeVisible()
  await expect(page.getByText(/Three projects are on track/)).toBeVisible()
  await page.getByRole('button', { name: 'Report: acme' }).click()
  await expect(page.getByRole('heading', { name: 'Project reports' })).toBeVisible()
  await expect(page.getByText('Project: acme')).toBeVisible()
  await expect(page.getByText(/Three projects are on track/)).toBeVisible()
  expect(errors).toEqual([])
})
