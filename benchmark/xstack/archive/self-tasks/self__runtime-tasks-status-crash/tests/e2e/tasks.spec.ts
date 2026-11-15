import { expect, test } from '@playwright/test'

test('opening Tasks no longer crashes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await page.getByRole('button', { name: 'Tasks' }).click()
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
  await expect(page.locator('tbody tr')).toHaveCount(8)
  await expect(page.locator('tr[data-task-id="TASK-8782"] td[data-col="status"]')).toContainText('In Progress')
  await expect(page.locator('tr[data-task-id="TASK-7262"] td[data-col="status"]')).toHaveText('')
  expect(errors).toEqual([])
})
