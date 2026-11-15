import { AppShell } from './features/layout/AppShell'
import { Dashboard } from './features/dashboard/Dashboard'

export default function App() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  )
}
