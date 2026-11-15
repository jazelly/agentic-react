import { formatTime } from '../../lib/time'

export function UpdatedAt() {
  const now = new Date()
  return <small data-testid="updated-at" style={{ color: '#666' }}>updated {formatTime(now)}</small>
}
