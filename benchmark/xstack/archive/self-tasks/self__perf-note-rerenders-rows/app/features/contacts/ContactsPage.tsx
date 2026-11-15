import { useState } from 'react'
import { ContactRow } from './ContactRow'
import { contacts } from './data'

export function ContactsPage() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [note, setNote] = useState('')

  const visible = contacts
    .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    .map((c) => ({ ...c }))

  return (
    <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Contacts</h1>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <input aria-label="Search contacts" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <input aria-label="Quick note" placeholder="Jot something down…" value={note} onChange={(e) => setNote(e.target.value)} />
        <span>{note.length} chars</span>
      </div>
      <ul role="listbox" aria-label="Contacts" style={{ listStyle: 'none', padding: 0, maxHeight: 400, overflow: 'auto' }}>
        {visible.map((c) => (
          <ContactRow key={c.id} contact={c} selected={c.id === selectedId} onSelect={(id) => setSelectedId(id)} />
        ))}
      </ul>
    </main>
  )
}
