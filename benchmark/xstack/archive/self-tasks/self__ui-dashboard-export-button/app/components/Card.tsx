import type { ReactNode } from 'react'

export function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: 'white' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  )
}
