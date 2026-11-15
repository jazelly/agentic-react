import { expect, test } from '@playwright/test'

const HYDRATION = /hydrat|did not match|server rendered|#418|#419|#423|#425/i

test('home hydrates without a mismatch and still shows the time', async ({ page }) => {
  const problems: string[] = []
  page.on('pageerror', (e) => { if (HYDRATION.test(String(e))) problems.push(String(e)) })
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && HYDRATION.test(m.text())) problems.push(m.text()) })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Boards' })).toBeVisible()
  await expect(page.getByTestId('updated-at')).toHaveText(/updated \d{2}:\d{2}/, { timeout: 5000 })
  await expect(page.getByRole('listitem')).toHaveCount(4)
  await page.waitForTimeout(1000)
  expect(problems).toEqual([])
})
