import { expect, test } from '@playwright/test'

test('user stats render on the production server', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /User\s+Management/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'User Statistics' })).toBeVisible()
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  expect(body).not.toMatch(/Stats will go here/)
  expect(body).toMatch(/(?<!in)active[^\d]*2/i)
  expect(body).toMatch(/inactive[^\d]*1/i)
  expect(body).toMatch(/6[67](\.\d+)?\s*%/)
  expect(errors).toEqual([])
})
