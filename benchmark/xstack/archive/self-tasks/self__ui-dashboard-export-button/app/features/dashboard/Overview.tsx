import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { monthly } from './data'

export function Overview() {
  const max = Math.max(...monthly.map(([, v]) => v))
  return (
    <Card title='Overview' action={<Button variant='ghost' size='sm'>View details</Button>}>
      <div aria-label='Monthly revenue chart' style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200 }}>
        {monthly.map(([m, v]) => (
          <div key={m} style={{ flex: 1, textAlign: 'center' }}>
            <div title={`${m}: ${v}`} style={{ height: (v / max) * 170, background: '#111827', borderRadius: 4 }} />
            <small style={{ color: '#6b7280' }}>{m}</small>
          </div>
        ))}
      </div>
    </Card>
  )
}
