import { Header } from './features/layout/Header'
import { Sidebar } from './features/layout/Sidebar'
import { useAuth } from './stores/auth-store'

export default function App() {
  const user = useAuth((s) => s.user)
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <Sidebar />
      <div style={{ flex: 1 }}>
        <Header />
        <main style={{ padding: 16 }}>
          <h1>Dashboard</h1>
          <p>{user ? `Welcome back, ${user.name.split(' ')[0]}!` : 'You are signed out.'}</p>
        </main>
      </div>
    </div>
  )
}
