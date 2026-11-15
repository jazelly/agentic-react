import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'
import UserStats from '@ui/UserStats'

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ')

test('page renders heading and stats from the initial users', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: /User\s+Management/ })).toBeTruthy()
  const t = text(document.body)
  expect(t).not.toMatch(/Stats will go here/)
  expect(t).toMatch(/(?<!in)active[^\d]*2/i)
  expect(t).toMatch(/inactive[^\d]*1/i)
  expect(t).toMatch(/6[67](\.\d+)?\s*%/)
})

test('stats stay in sync when the users prop changes (no stale derived state)', () => {
  const { rerender, container } = render(<UserStats users={[{ id: 1, name: 'A', isActive: true }, { id: 2, name: 'B', isActive: false }]} />)
  expect(text(container)).toMatch(/50(\.0+)?\s*%/)
  rerender(<UserStats users={[1, 2, 3, 4].map((id) => ({ id, name: String(id), isActive: true }))} />)
  const t = text(container)
  expect(t).toMatch(/(?<!in)active[^\d]*4/i)
  expect(t).toMatch(/inactive[^\d]*0/i)
  expect(t).toMatch(/100(\.0+)?\s*%/)
})
