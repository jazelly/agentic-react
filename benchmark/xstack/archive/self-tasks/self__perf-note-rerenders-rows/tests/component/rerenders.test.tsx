import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'

const rows = () => window.__renderCounts?.ContactRow ?? 0

test('typing a note does not re-render contact rows; search and selection still work', () => {
  render(<App />)
  expect(screen.getAllByRole('option').length).toBe(200)
  const before = rows()
  expect(before).toBeGreaterThan(0)
  const note = screen.getByRole('textbox', { name: 'Quick note' })
  for (const v of ['h', 'he', 'hel', 'hell', 'hello']) fireEvent.change(note, { target: { value: v } })
  expect(screen.getByText('5 chars')).toBeTruthy()
  expect(rows() - before).toBe(0)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search contacts' }), { target: { value: 'ava' } })
  const opts = screen.getAllByRole('option')
  expect(opts.length).toBe(10)
  fireEvent.click(opts[0])
  expect(opts[0].getAttribute('aria-selected')).toBe('true')
  expect((screen.getByRole('textbox', { name: 'Quick note' }) as HTMLInputElement).value).toBe('hello')
})
