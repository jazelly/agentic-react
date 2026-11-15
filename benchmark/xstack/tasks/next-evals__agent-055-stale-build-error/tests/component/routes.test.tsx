import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'
import { reportsRoute } from '@ui/lib/routes'

test('static params still produce the acme report', () => {
  expect(reportsRoute.generateStaticParams?.()).toEqual([{ project: 'acme' }])
})

test('dashboard and acme report keep their content', async () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Project dashboard' })).toBeTruthy()
  expect(screen.getByText(/Three projects are on track/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Report: acme' }))
  expect(screen.getByRole('heading', { name: 'Project reports' })).toBeTruthy()
  expect(await screen.findByText(/Three projects are on track/)).toBeTruthy()
})
