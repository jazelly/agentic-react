import { useEffect, useState } from 'react'
import { fetchOpeningHours, type Hours } from '../lib/api'

export function OpeningHours() {
  const [hours, setHours] = useState<Hours[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchOpeningHours().then((h) => { if (alive) setHours(h) })
    return () => { alive = false }
  }, [])
  const rows = hours ?? Array.from({ length: 7 }, (_, i) => ({ day: `day-${i}`, open: '' }))
  return (
    <section>
      <h2>Opening hours</h2>
      <ul aria-label="Opening hours" style={{ padding: 0, listStyle: 'none' }}>
        {rows.map((h) => <li key={h.day} style={{ lineHeight: '24px', height: 24 }}>{hours ? `${h.day}: ${h.open}` : '\u00a0'}</li>)}
      </ul>
    </section>
  )
}
