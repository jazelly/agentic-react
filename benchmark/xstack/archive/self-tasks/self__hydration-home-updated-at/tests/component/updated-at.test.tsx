import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'

test('home still shows the heading, boards and an updated time', async () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Boards' })).toBeTruthy()
  expect(screen.getAllByRole('listitem').length).toBe(4)
  expect((await screen.findByText(/updated \d{2}:\d{2}/)).textContent).toMatch(/updated \d{2}:\d{2}/)
})
