import { useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TasksPage } from './features/tasks/TasksPage'

export default function App() {
  const [view, setView] = useState<'dashboard' | 'tasks'>('dashboard')
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <nav aria-label="Main" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setView('dashboard')}>Dashboard</button>
        <button type="button" onClick={() => setView('tasks')}>Tasks</button>
      </nav>
      <ErrorBoundary key={view}>
        {view === 'dashboard' ? (
          <section>
            <h1>Dashboard</h1>
            <p>Open the Tasks page from the navigation.</p>
          </section>
        ) : (
          <TasksPage />
        )}
      </ErrorBoundary>
    </div>
  )
}
