import { useEffect, useState } from 'react'
import { formatTime } from '../../lib/time'

export function UpdatedAt() {
  // the time is only known on the client; render it after hydration so server and client markup match
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(new Date()), [])
  return <small data-testid="updated-at" style={{ color: '#666' }}>updated {now ? formatTime(now) : '…'}</small>
}
