import { tasks } from './data'
import { TasksTable } from './TasksTable'

export function TasksPage() {
  return (
    <section>
      <h1>Tasks</h1>
      <p>Here&apos;s a list of your tasks for this month!</p>
      <TasksTable data={tasks} />
    </section>
  )
}
