import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f9fafb' }}>
      <Sidebar />
      <div style={{ flex: 1 }}>
        <TopNav />
        <main style={{ padding: 24 }}>{children}</main>
      </div>
    </div>
  )
}
