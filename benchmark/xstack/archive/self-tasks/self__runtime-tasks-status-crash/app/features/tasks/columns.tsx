import type { ReactNode } from 'react'
import { priorities, statuses, type Task } from './data'

export interface Column {
  id: string
  header: string
  cell: (task: Task) => ReactNode
}

export const columns: Column[] = [
  { id: 'id', header: 'Task', cell: (task) => task.id },
  {
    id: 'title',
    header: 'Title',
    cell: (task) => (
      <span>
        <span style={{ border: '1px solid #ccc', borderRadius: 4, padding: '0 4px', marginRight: 6, fontSize: 12 }}>{task.label}</span>
        {task.title}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (task) => {
      const status = statuses.find((s) => s.value === task.status) as (typeof statuses)[number]
      return (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <span aria-hidden="true">{status.icon}</span>
          <span>{status.label}</span>
        </span>
      )
    },
  },
  {
    id: 'priority',
    header: 'Priority',
    cell: (task) => {
      const priority = priorities.find((p) => p.value === task.priority)
      if (!priority) return null
      return (
        <span>
          <span aria-hidden="true">{priority.icon}</span> {priority.label}
        </span>
      )
    },
  },
]
