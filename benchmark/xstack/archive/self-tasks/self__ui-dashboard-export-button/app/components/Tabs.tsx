import { useState, type ReactNode } from 'react'

export interface TabDef {
  value: string
  label: string
  disabled?: boolean
  content: ReactNode
}

export function Tabs({ tabs, defaultValue }: { tabs: TabDef[]; defaultValue: string }) {
  const [active, setActive] = useState(defaultValue)
  const current = tabs.find((t) => t.value === active) ?? tabs[0]
  return (
    <div>
      <div role='tablist' style={{ display: 'flex', gap: 4, background: '#f3f4f6', padding: 4, borderRadius: 8, width: 'fit-content' }}>
        {tabs.map((t) => (
          <button
            key={t.value}
            role='tab'
            aria-selected={t.value === active}
            disabled={t.disabled}
            onClick={() => setActive(t.value)}
            style={{ border: 0, borderRadius: 6, padding: '4px 12px', background: t.value === active ? 'white' : 'transparent' }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role='tabpanel' style={{ marginTop: 16 }}>
        {current.content}
      </div>
    </div>
  )
}
