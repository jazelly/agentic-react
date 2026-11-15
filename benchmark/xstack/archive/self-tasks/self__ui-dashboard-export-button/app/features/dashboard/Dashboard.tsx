import { Button } from '../../components/Button'
import { Tabs } from '../../components/Tabs'
import { Analytics } from './Analytics'
import { Overview } from './Overview'
import { RecentSales } from './RecentSales'
import { StatCards } from './StatCards'

export function Dashboard() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Dashboard</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button>Download</Button>
        </div>
      </div>
      <Tabs
        defaultValue='overview'
        tabs={[
          {
            value: 'overview',
            label: 'Overview',
            content: (
              <div style={{ display: 'grid', gap: 16 }}>
                <StatCards />
                <div style={{ display: 'grid', gridTemplateColumns: '4fr 3fr', gap: 16 }}>
                  <Overview />
                  <RecentSales />
                </div>
              </div>
            ),
          },
          { value: 'analytics', label: 'Analytics', content: <Analytics /> },
          { value: 'reports', label: 'Reports', disabled: true, content: null },
          { value: 'notifications', label: 'Notifications', disabled: true, content: null },
        ]}
      />
    </>
  )
}
