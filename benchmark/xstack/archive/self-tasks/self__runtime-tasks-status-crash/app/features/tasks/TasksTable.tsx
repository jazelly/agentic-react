import { columns } from './columns'
import type { Task } from './data'

export function TasksTable({ data }: { data: Task[] }) {
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>{columns.map((c) => <th key={c.id} style={{ textAlign: 'left', padding: 6 }}>{c.header}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((task) => (
          <tr key={task.id} data-task-id={task.id}>
            {columns.map((c) => (
              <td key={c.id} data-col={c.id} style={{ padding: 6, borderTop: '1px solid #eee' }}>{c.cell(task)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
