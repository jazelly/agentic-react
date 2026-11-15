import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'

test('renders Operational for an operational service', () => {
  render(<App />)
  expect(screen.getByText(/API:\s*Operational/)).toBeTruthy()
  expect(screen.queryByText(/Unavailable/)).toBeNull()
})
