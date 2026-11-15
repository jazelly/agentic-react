import { Card } from '../../components/Card'
import { stats } from './data'

export function StatCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      {stats.map((s) => (
        <Card key={s.title} title={s.title}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{s.value}</div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{s.delta}</p>
        </Card>
      ))}
    </div>
  )
}
