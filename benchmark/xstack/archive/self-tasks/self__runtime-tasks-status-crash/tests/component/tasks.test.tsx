import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'

const statusCell = (id: string) => document.querySelector(`tr[data-task-id="${id}"] td[data-col="status"]`)

test('tasks page renders statuses and tolerates unknown ones', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
  expect(screen.queryByText('Something went wrong')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Tasks' })).toBeTruthy()
  expect(document.querySelectorAll('tbody tr').length).toBe(8)
  expect(statusCell('TASK-8782')?.textContent).toMatch(/In Progress/)
  expect(statusCell('TASK-1280')?.textContent).toMatch(/Done/)
  expect(statusCell('TASK-8686')?.textContent).toMatch(/Canceled/)
  expect((statusCell('TASK-7262')?.textContent ?? 'x').trim()).toBe('')
})
