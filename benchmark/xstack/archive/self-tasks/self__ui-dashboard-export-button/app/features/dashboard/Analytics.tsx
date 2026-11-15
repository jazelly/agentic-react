import { Card } from '../../components/Card'
import { Button } from '../../components/Button'

export function Analytics() {
  return (
    <Card title='Traffic sources' action={<Button variant='ghost' size='sm'>Refresh</Button>}>
      <ol style={{ margin: 0 }}>
        <li>Direct - 48%</li>
        <li>Search - 32%</li>
        <li>Social - 20%</li>
      </ol>
    </Card>
  )
}
