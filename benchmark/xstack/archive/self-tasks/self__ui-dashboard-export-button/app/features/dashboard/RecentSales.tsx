import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { sales } from './data'

export function RecentSales() {
  return (
    <Card title='Recent Sales' action={<Button variant='outline' size='sm'>View all</Button>}>
      <p style={{ marginTop: 0, fontSize: 13, color: '#6b7280' }}>You made 265 sales this month.</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {sales.map((s) => (
          <li key={s.email} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span>
              <strong style={{ display: 'block', fontSize: 14 }}>{s.name}</strong>
              <small style={{ color: '#6b7280' }}>{s.email}</small>
            </span>
            <span style={{ fontWeight: 600 }}>{s.amount}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
