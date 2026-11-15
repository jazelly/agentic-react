import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'

test('signing out clears the user everywhere and the access token', () => {
  render(<App />)
  expect(screen.getAllByText('Olivia Martin').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Open profile menu' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
  expect(screen.queryByText('Olivia Martin')).toBeNull()
  expect(screen.queryByText('olivia@example.com')).toBeNull()
  expect(screen.queryByText(/Welcome back/)).toBeNull()
  expect(screen.getByText('Not signed in')).toBeTruthy()
  expect(document.cookie).not.toMatch(/tok_demo_123/)
})
