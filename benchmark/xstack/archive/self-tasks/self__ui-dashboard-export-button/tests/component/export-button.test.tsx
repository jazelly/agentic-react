import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'

test('dashboard header has an outline "Export report" button and no Download button', () => {
  render(<App />)
  const btn = screen.getByRole('button', { name: 'Export report' })
  expect(btn.getAttribute('data-variant')).toBe('outline')
  expect(screen.queryByRole('button', { name: /download/i })).toBeNull()
  const heading = screen.getByRole('heading', { level: 1, name: 'Dashboard' })
  expect(heading.parentElement?.contains(btn)).toBe(true)
})

test('other buttons are unchanged', () => {
  render(<App />)
  const others = screen.getAllByRole('button').filter((b) => b.textContent !== 'Export report')
  expect(others.map((b) => `${b.textContent}|${b.getAttribute('data-variant')}`)).toEqual([
    '◐|ghost', 'Sign out|outline', 'View details|ghost', 'View all|outline',
  ])
})
