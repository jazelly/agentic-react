import { lazy, Suspense, useState } from 'react'
import { SummaryCard } from './components/dashboard'
import { loadSummaryCard } from './components/dashboard/load-card'
import { dashboardRoute, reportsRoute } from './lib/routes'

const LazySummaryCard = lazy(loadSummaryCard)

function DashboardPage() {
  return (
    <main>
      <h1>{dashboardRoute.title}</h1>
      <SummaryCard />
    </main>
  )
}

function ReportsPage({ project }: { project: string }) {
  return (
    <main>
      <h1>{reportsRoute.title}</h1>
      <p>Project: {project}</p>
      <Suspense fallback={<p>Loading summary…</p>}>
        <LazySummaryCard />
      </Suspense>
    </main>
  )
}

export default function App() {
  const [view, setView] = useState<{ name: 'dashboard' } | { name: 'reports'; project: string }>({ name: 'dashboard' })
  const projects = reportsRoute.generateStaticParams?.() ?? []
  return (
    <div>
      <nav aria-label="Routes">
        <button type="button" onClick={() => setView({ name: 'dashboard' })}>Dashboard</button>
        {projects.map((params) => (
          <button key={params.project} type="button" onClick={() => setView({ name: 'reports', project: params.project })}>
            Report: {params.project}
          </button>
        ))}
      </nav>
      {view.name === 'dashboard' ? <DashboardPage /> : <ReportsPage project={view.project} />}
    </div>
  )
}
