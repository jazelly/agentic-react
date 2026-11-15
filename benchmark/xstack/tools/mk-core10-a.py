# HISTORICAL (2026-11-13): task dirs under tasks/ are now the source of truth (some have been edited since).
# This script also emits the self__* tasks that were retired to archive/self-tasks/ - do not rerun it wholesale.
# Generates core10 tasks (part A): next-evals 024, next-evals 055 (equivalent variant), self state-signout, self runtime-tasks-crash
import json, os, textwrap
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tasks')
def W(task, rel, body):
    p = os.path.join(ROOT, task, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(textwrap.dedent(body).lstrip('\n'))
def J(task, obj): W(task, 'task.json', json.dumps(obj, indent=2) + '\n')

# ---------------- next-evals/agent-024 ----------------
T = 'next-evals__agent-024-avoid-redundant-usestate'
W(T, 'app/App.tsx', '''
import { useState } from 'react'
import UserStats from './UserStats'

export default function App() {
  const [users] = useState([
    { id: 1, name: 'John', isActive: true },
    { id: 2, name: 'Jane', isActive: false },
    { id: 3, name: 'Bob', isActive: true },
  ])

  // Good example: derived value calculated directly
  const totalUsers = users.length

  return (
    <div>
      <h1>User Management</h1>
      <p>Total Users: {totalUsers}</p>

      <div>
        {users.map((user) => (
          <div key={user.id}>
            {user.name} - {user.isActive ? 'Active' : 'Inactive'}
          </div>
        ))}
      </div>

      <UserStats users={users} />
    </div>
  )
}
''')
STUB = '''
interface User {
  id: number
  name: string
  isActive: boolean
}

interface UserStatsProps {
  users: User[]
}

export default function UserStats({ users }: UserStatsProps) {
  // TODO: Display statistics about the users:
  // - Active users count
  // - Inactive users count
  // - Percentage of active users
  // Follow the existing patterns in this codebase for derived values

  return (
    <div>
      <h2>User Statistics</h2>
      <p>Stats will go here</p>
    </div>
  )
}
'''
W(T, 'app/UserStats.tsx', STUB)
W(T, 'solution/UserStats.tsx', '''
interface User {
  id: number
  name: string
  isActive: boolean
}

interface UserStatsProps {
  users: User[]
}

export default function UserStats({ users }: UserStatsProps) {
  const activeCount = users.filter((user) => user.isActive).length
  const inactiveCount = users.length - activeCount
  const percentage = users.length === 0 ? 0 : Math.round((activeCount / users.length) * 100)

  return (
    <div>
      <h2>User Statistics</h2>
      <p>Active users: {activeCount}</p>
      <p>Inactive users: {inactiveCount}</p>
      <p>Active percentage: {percentage}%</p>
    </div>
  )
}
''')
W(T, 'tests/component/userstats.test.tsx', '''
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'
import UserStats from '@ui/UserStats'

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\\s+/g, ' ')

test('page renders heading and stats from the initial users', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: /User\\s+Management/ })).toBeTruthy()
  const t = text(document.body)
  expect(t).not.toMatch(/Stats will go here/)
  expect(t).toMatch(/(?<!in)active[^\\d]*2/i)
  expect(t).toMatch(/inactive[^\\d]*1/i)
  expect(t).toMatch(/6[67](\\.\\d+)?\\s*%/)
})

test('stats stay in sync when the users prop changes (no stale derived state)', () => {
  const { rerender, container } = render(<UserStats users={[{ id: 1, name: 'A', isActive: true }, { id: 2, name: 'B', isActive: false }]} />)
  expect(text(container)).toMatch(/50(\\.0+)?\\s*%/)
  rerender(<UserStats users={[1, 2, 3, 4].map((id) => ({ id, name: String(id), isActive: true }))} />)
  const t = text(container)
  expect(t).toMatch(/(?<!in)active[^\\d]*4/i)
  expect(t).toMatch(/inactive[^\\d]*0/i)
  expect(t).toMatch(/100(\\.0+)?\\s*%/)
})
''')
W(T, 'tests/e2e/userstats.spec.ts', '''
import { expect, test } from '@playwright/test'

test('user stats render on the production server', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /User\\s+Management/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'User Statistics' })).toBeVisible()
  const body = (await page.locator('body').innerText()).replace(/\\s+/g, ' ')
  expect(body).not.toMatch(/Stats will go here/)
  expect(body).toMatch(/(?<!in)active[^\\d]*2/i)
  expect(body).toMatch(/inactive[^\\d]*1/i)
  expect(body).toMatch(/6[67](\\.\\d+)?\\s*%/)
  expect(errors).toEqual([])
})
''')
J(T, {
  "id": "next-evals/agent-024-avoid-redundant-usestate", "suite": "next-evals", "category": "feature-write/derived-state", "tags": ["core10"],
  "source": {"repo": "https://github.com/vercel/next.js", "path": "evals/evals/agent-024-avoid-redundant-usestate", "ref": "canary", "license": "MIT"},
  "prompt": "Complete the UserStats component to display statistics about the users. Show the active users count, inactive users count, and percentage of active users. Follow the existing patterns in this codebase for handling derived values.",
  "app": "app", "solution": "solution", "deps": [],
  "verify": {
    "e2e": ["tests/e2e/userstats.spec.ts"], "component": ["tests/component/userstats.test.tsx"], "componentAliases": {"@ui": "src/ui"},
    "static": [
      {"file": "src/ui/UserStats.tsx", "pattern": "useEffect", "expect": False},
      {"file": "src/ui/UserStats.tsx", "pattern": "useState.*(active|count|percentage)|(active|count|percentage).*useState", "flags": "mi", "expect": False}
    ]
  },
  "stacks": {"default": "applicable"},
  "portingNotes": "Upstream app/page.tsx ('use client') -> src/ui/App.tsx, app/UserStats.tsx -> src/ui/UserStats.tsx, prompt unchanged. Upstream EVAL.ts is regex-only; we keep its two negative regexes (no useEffect / no useState for derived values) as static checks and add behavioral checks: correct numbers on the production server (E2E) and a re-render test that fails on stale useState-derived values (component). The heuristic 'has .filter/.length' regex is replaced by the behavioral checks. The oracle solution was written for this port (upstream ships none)."
})

# ---------------- next-evals/agent-055 (equivalent variant) ----------------
T = 'next-evals__agent-055-stale-build-error'
W(T, 'app/lib/dashboard-copy.ts', '''
export const dashboardCopy = {
  dashboardTitle: 'Project dashboard',
  reportsTitle: 'Project reports',
}
''')
RP_OK = '''
export function defineStaticParams<Key extends string>(
  key: Key,
  values: string[]
) {
  return () => values.map((value) => ({ [key]: value }))
}
'''
W(T, 'app/lib/route-params.ts', RP_OK.replace('return () =>', 'return (_route: string) =>'))
W(T, 'solution/lib/route-params.ts', RP_OK)
W(T, 'app/lib/routes.ts', '''
import { dashboardCopy } from './dashboard-copy'
import { defineStaticParams } from './route-params'

export type StaticParams = Array<Record<string, string>>

/** Route table shared by the in-app navigation (framework-free stand-in for file-system routes). */
export interface RouteDefinition {
  path: string
  title: string
  /** Same contract as Next.js generateStaticParams(): called with no arguments. */
  generateStaticParams?: () => StaticParams
}

export const dashboardRoute: RouteDefinition = {
  path: '/',
  title: dashboardCopy.dashboardTitle,
}

export const reportsRoute: RouteDefinition = {
  path: '/reports/:project',
  title: dashboardCopy.reportsTitle,
  generateStaticParams: defineStaticParams('project', ['acme']),
}
''')
W(T, 'app/components/dashboard/summary-card.tsx', '''
export function SummaryCard() {
  return (
    <section aria-labelledby="summary-heading">
      <h2 id="summary-heading">Summary</h2>
      <p>Three projects are on track and one needs attention.</p>
    </section>
  )
}
''')
W(T, 'app/components/dashboard/index.ts', "export { SummaryCard } from './summary-card'\n")
W(T, 'app/components/dashboard/load-card.ts', '''
export async function loadSummaryCard() {
  const { SummaryCard } = await import('./summary-card')
  return { default: SummaryCard }
}
''')
W(T, 'app/App.tsx', '''
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
''')
W(T, 'tests/component/routes.test.tsx', '''
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'
import { reportsRoute } from '@ui/lib/routes'

test('static params still produce the acme report', () => {
  expect(reportsRoute.generateStaticParams?.()).toEqual([{ project: 'acme' }])
})

test('dashboard and acme report keep their content', async () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Project dashboard' })).toBeTruthy()
  expect(screen.getByText(/Three projects are on track/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Report: acme' }))
  expect(screen.getByRole('heading', { name: 'Project reports' })).toBeTruthy()
  expect(await screen.findByText(/Three projects are on track/)).toBeTruthy()
})
''')
W(T, 'tests/e2e/routes.spec.ts', '''
import { expect, test } from '@playwright/test'

test('dashboard and /reports/acme equivalent still work on the production server', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Project dashboard' })).toBeVisible()
  await expect(page.getByText(/Three projects are on track/)).toBeVisible()
  await page.getByRole('button', { name: 'Report: acme' }).click()
  await expect(page.getByRole('heading', { name: 'Project reports' })).toBeVisible()
  await expect(page.getByText('Project: acme')).toBeVisible()
  await expect(page.getByText(/Three projects are on track/)).toBeVisible()
  expect(errors).toEqual([])
})
''')
J(T, {
  "id": "next-evals/agent-055-stale-build-error", "suite": "next-evals", "category": "build-type-error", "tags": ["core10"],
  "source": {"repo": "https://github.com/vercel/next.js", "path": "evals/evals/agent-055-stale-build-error", "ref": "canary", "license": "MIT",
             "upstreamPrompt": "The dashboard and `/reports/acme` are already running correctly in development, but the production build now fails from generated `.next/types` after recent work. Verify whether the project builds without cache issues, fix the failure, and confirm that the current development session still works when you are done."},
  "prompt": "The dashboard and the acme report view are already running correctly in development, but the type check (`pnpm typecheck`) and production build now fail after recent work. Verify whether the project type-checks and builds, fix the failure at its source, and confirm that the current development session still works when you are done. Don't remove routes or generateStaticParams, change the report project, hide the type error, or weaken type checking.",
  "app": "app", "solution": "solution", "deps": [],
  "verify": {
    "typecheck": True,
    "e2e": ["tests/e2e/routes.spec.ts"], "component": ["tests/component/routes.test.tsx"], "componentAliases": {"@ui": "src/ui"},
    "static": [
      {"file": "src/ui/lib/routes.ts", "pattern": "generateStaticParams:\\\\s*defineStaticParams\\\\('project',\\\\s*\\\\['acme'\\\\]\\\\)"},
      {"file": "src/ui/lib/routes.ts", "pattern": "generateStaticParams\\\\?:\\\\s*\\\\(\\\\)\\\\s*=>\\\\s*StaticParams"}
    ]
  },
  "stacks": {"default": "applicable"},
  "portingNotes": "Equivalent variant. Upstream: eval-setup changes a shared helper (lib/route-params.ts) to `(_route: string) =>` so Next's generated .next/types check of generateStaticParams fails far from the defect, tempting a cache reset. Port: the same helper and the same mutation, but the contract is a framework-free route table (src/ui/lib/routes.ts) typed like generateStaticParams, so on every stack the type error surfaces at the consumer, not at the helper. Hidden gate: a fixed strict tsc over src/ui (no @ts-ignore/@ts-expect-error/@ts-nocheck), plus E2E/component checks that both views keep their content, plus static checks that the route contract was not weakened. Dropped (transcript-judged, Next-only): 'did not delete .next', 'verified via the already-running dev server'. On Next stacks `next build` also type-checks, so the build itself fails initially, like upstream."
})

# ---------------- self/state-signout-keeps-user ----------------
T = 'self__state-signout-keeps-user'
STORE = '''
import { useSyncExternalStore } from 'react'

export interface AuthUser {
  name: string
  email: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string
}

const ACCESS_TOKEN = 'bench_access_token'

let state: AuthState = {
  user: { name: 'Olivia Martin', email: 'olivia@example.com' },
  accessToken: 'tok_demo_123',
}
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function writeCookie(value: string) {
  if (typeof document === 'undefined') return
  document.cookie = value ? `${ACCESS_TOKEN}=${value}; path=/` : `${ACCESS_TOKEN}=; path=/; max-age=0`
}

export const authStore = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  setUser(user: AuthUser | null) {
    state = { ...state, user }
    emit()
  },
  setAccessToken(accessToken: string) {
    writeCookie(accessToken)
    state = { ...state, accessToken }
    emit()
  },
  resetAccessToken() {
    writeCookie('')
    state = { ...state, accessToken: '' }
    emit()
  },
  reset() {
    writeCookie('')
    __RESET__
    emit()
  },
}

export function useAuth<T>(selector: (s: AuthState) => T): T {
  return useSyncExternalStore(
    authStore.subscribe,
    () => selector(state),
    () => selector(state),
  )
}
'''
W(T, 'app/stores/auth-store.ts', STORE.replace('__RESET__', "state = { ...state, accessToken: '' }"))
W(T, 'solution/stores/auth-store.ts', STORE.replace('__RESET__', "state = { ...state, user: null, accessToken: '' }"))
W(T, 'app/components/Avatar.tsx', '''
export function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span aria-hidden="true" style={{ display: 'inline-grid', placeItems: 'center', width: 32, height: 32, borderRadius: 16, background: '#e5e7eb', fontSize: 12 }}>
      {initials}
    </span>
  )
}
''')
W(T, 'app/features/layout/ProfileDropdown.tsx', '''
import { useState } from 'react'
import { authStore, useAuth } from '../../stores/auth-store'
import { Avatar } from '../../components/Avatar'

export function ProfileDropdown() {
  const user = useAuth((s) => s.user)
  const [open, setOpen] = useState(false)

  const handleSignOut = () => {
    authStore.reset()
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" aria-label="Open profile menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {user ? <Avatar name={user.name} /> : 'Account'}
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, background: 'white', border: '1px solid #ddd', padding: 8 }}>
          {user && (
            <div style={{ marginBottom: 8 }}>
              <p>{user.name}</p>
              <p>{user.email}</p>
            </div>
          )}
          <button type="button" role="menuitem">Profile</button>
          <button type="button" role="menuitem">Settings</button>
          <button type="button" role="menuitem" onClick={handleSignOut}>Sign out</button>
        </div>
      )}
    </div>
  )
}
''')
W(T, 'app/features/layout/NavUser.tsx', '''
import { useAuth } from '../../stores/auth-store'
import { Avatar } from '../../components/Avatar'

export function NavUser() {
  const user = useAuth((s) => s.user)
  if (!user) {
    return <div data-slot="nav-user">Not signed in</div>
  }
  return (
    <div data-slot="nav-user" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Avatar name={user.name} />
      <div>
        <div>{user.name}</div>
        <div style={{ fontSize: 12, color: '#666' }}>{user.email}</div>
      </div>
    </div>
  )
}
''')
W(T, 'app/features/layout/Sidebar.tsx', '''
import { NavUser } from './NavUser'

const links = ['Dashboard', 'Tasks', 'Apps', 'Chats', 'Users', 'Settings']

export function Sidebar() {
  return (
    <aside style={{ width: 220, borderRight: '1px solid #eee', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <strong>Shadcn Admin</strong>
      <nav aria-label="Main">
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {links.map((l) => (
            <li key={l}><a href="#" onClick={(e) => e.preventDefault()}>{l}</a></li>
          ))}
        </ul>
      </nav>
      <div style={{ marginTop: 'auto' }}>
        <NavUser />
      </div>
    </aside>
  )
}
''')
W(T, 'app/features/layout/Header.tsx', '''
import { ProfileDropdown } from './ProfileDropdown'

export function Header() {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid #eee' }}>
      <input type="search" placeholder="Search…" aria-label="Search" />
      <ProfileDropdown />
    </header>
  )
}
''')
W(T, 'app/App.tsx', '''
import { Header } from './features/layout/Header'
import { Sidebar } from './features/layout/Sidebar'
import { useAuth } from './stores/auth-store'

export default function App() {
  const user = useAuth((s) => s.user)
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <Sidebar />
      <div style={{ flex: 1 }}>
        <Header />
        <main style={{ padding: 16 }}>
          <h1>Dashboard</h1>
          <p>{user ? `Welcome back, ${user.name.split(' ')[0]}!` : 'You are signed out.'}</p>
        </main>
      </div>
    </div>
  )
}
''')
W(T, 'tests/component/signout.test.tsx', '''
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'

test('signing out clears the user everywhere and the access token', () => {
  render(<App />)
  expect(screen.getAllByText('Olivia Martin').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Open profile menu' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
  expect(screen.queryByText('Olivia Martin')).toBeNull()
  expect(screen.queryByText('olivia@example.com')).toBeNull()
  expect(screen.queryByText(/Welcome back/)).toBeNull()
  expect(screen.getByText('Not signed in')).toBeTruthy()
  expect(document.cookie).not.toMatch(/tok_demo_123/)
})
''')
W(T, 'tests/e2e/signout.spec.ts', '''
import { expect, test } from '@playwright/test'

test('sign out clears the previous user without a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await expect(page.getByText('olivia@example.com')).toBeVisible()
  await page.getByRole('button', { name: 'Open profile menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByText('Not signed in')).toBeVisible()
  await expect(page.getByText('Olivia Martin')).toHaveCount(0)
  await expect(page.getByText('olivia@example.com')).toHaveCount(0)
  await expect(page.getByText(/Welcome back/)).toHaveCount(0)
  expect(errors).toEqual([])
})
''')
J(T, {
  "id": "self/state-signout-keeps-user", "suite": "self", "category": "state-bug", "tags": ["core10"],
  "source": {"derivedFrom": "benchmark/tasks/vite-shadcn-admin/state-signout-keeps-user (satnaing/shadcn-admin, MIT)", "license": "MIT (fixture authored for this benchmark)"},
  "prompt": "After clicking \"Sign out\" in the profile dropdown, the app still shows the previous user's name/email (e.g. in the sidebar) until a full page reload. The access-token cookie is cleared correctly. Fix the sign-out state handling.",
  "app": "app", "solution": "solution", "deps": [],
  "verify": {"e2e": ["tests/e2e/signout.spec.ts"], "component": ["tests/component/signout.test.tsx"], "componentAliases": {"@ui": "src/ui"}},
  "stacks": {"default": "applicable"},
  "portingNotes": "shadcn-admin's zustand auth store becomes a dependency-free useSyncExternalStore store with the same shape (user, accessToken, setUser, setAccessToken, resetAccessToken, reset); the injected bug is the same (reset() clears the token but not the user). Layout split across Sidebar/NavUser/Header/ProfileDropdown so the agent must trace the stale value back to the store. Runs unchanged on all 8 stacks (SSR stacks render the signed-in user on the server; the store is module state)."
})

# ---------------- self/runtime-tasks-status-crash ----------------
T = 'self__runtime-tasks-status-crash'
W(T, 'app/features/tasks/data.ts', '''
export interface Option { value: string; label: string; icon: string }

export const statuses: Option[] = [
  { value: 'backlog', label: 'Backlog', icon: '◌' },
  { value: 'todo', label: 'Todo', icon: '○' },
  { value: 'in progress', label: 'In Progress', icon: '◔' },
  { value: 'done', label: 'Done', icon: '●' },
  { value: 'canceled', label: 'Canceled', icon: '⊘' },
]

export const priorities: Option[] = [
  { value: 'low', label: 'Low', icon: '↓' },
  { value: 'medium', label: 'Medium', icon: '→' },
  { value: 'high', label: 'High', icon: '↑' },
]

export interface Task { id: string; title: string; status: string; priority: string; label: string }

export const tasks: Task[] = [
  { id: 'TASK-8782', title: "You can't compress the program without quantifying the open-source SSD pixel!", status: 'in progress', priority: 'medium', label: 'documentation' },
  { id: 'TASK-7878', title: 'Try to calculate the EXE feed, maybe it will index the multi-byte pixel!', status: 'backlog', priority: 'medium', label: 'documentation' },
  { id: 'TASK-7839', title: 'We need to bypass the neural TCP card!', status: 'todo', priority: 'high', label: 'bug' },
  { id: 'TASK-5562', title: 'The SAS interface is down, bypass the open-source pixel so we can back up the PNG bandwidth!', status: 'backlog', priority: 'medium', label: 'feature' },
  { id: 'TASK-8686', title: "I'll parse the wireless SSL protocol, that should driver the API panel!", status: 'canceled', priority: 'medium', label: 'feature' },
  { id: 'TASK-1280', title: 'Use the digital TLS panel, then you can transmit the haptic system!', status: 'done', priority: 'high', label: 'bug' },
  { id: 'TASK-7262', title: 'The UTF8 application is down, parse the neural bandwidth so we can back up the PNG firewall!', status: 'archived', priority: 'high', label: 'feature' },
  { id: 'TASK-1138', title: "Generating the driver won't do anything, we need to quantify the 1080p SMTP bandwidth!", status: 'in progress', priority: 'medium', label: 'feature' },
]
''')
COLS = '''
import type { ReactNode } from 'react'
import { priorities, statuses, type Task } from './data'

export interface Column {
  id: string
  header: string
  cell: (task: Task) => ReactNode
}

export const columns: Column[] = [
  { id: 'id', header: 'Task', cell: (task) => task.id },
  {
    id: 'title',
    header: 'Title',
    cell: (task) => (
      <span>
        <span style={{ border: '1px solid #ccc', borderRadius: 4, padding: '0 4px', marginRight: 6, fontSize: 12 }}>{task.label}</span>
        {task.title}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (task) => {
      const status = statuses.find((s) => s.value === task.status)__BANG__
__GUARD__      return (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <span aria-hidden="true">{status.icon}</span>
          <span>{status.label}</span>
        </span>
      )
    },
  },
  {
    id: 'priority',
    header: 'Priority',
    cell: (task) => {
      const priority = priorities.find((p) => p.value === task.priority)
      if (!priority) return null
      return (
        <span>
          <span aria-hidden="true">{priority.icon}</span> {priority.label}
        </span>
      )
    },
  },
]
'''
W(T, 'app/features/tasks/columns.tsx', COLS.replace('__BANG__', ' as (typeof statuses)[number]').replace('__GUARD__', ''))
W(T, 'solution/features/tasks/columns.tsx', COLS.replace('__BANG__', '').replace('__GUARD__', '      if (!status) return null\n'))
W(T, 'app/features/tasks/TasksTable.tsx', '''
import { columns } from './columns'
import type { Task } from './data'

export function TasksTable({ data }: { data: Task[] }) {
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>{columns.map((c) => <th key={c.id} style={{ textAlign: 'left', padding: 6 }}>{c.header}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((task) => (
          <tr key={task.id} data-task-id={task.id}>
            {columns.map((c) => (
              <td key={c.id} data-col={c.id} style={{ padding: 6, borderTop: '1px solid #eee' }}>{c.cell(task)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
''')
W(T, 'app/features/tasks/TasksPage.tsx', '''
import { tasks } from './data'
import { TasksTable } from './TasksTable'

export function TasksPage() {
  return (
    <section>
      <h1>Tasks</h1>
      <p>Here&apos;s a list of your tasks for this month!</p>
      <TasksTable data={tasks} />
    </section>
  )
}
''')
W(T, 'app/components/ErrorBoundary.tsx', '''
import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div role="alert">
          <h2>Something went wrong</h2>
          <pre>{this.state.error.message}</pre>
        </div>
      )
    }
    return this.props.children
  }
}
''')
W(T, 'app/App.tsx', '''
import { useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TasksPage } from './features/tasks/TasksPage'

export default function App() {
  const [view, setView] = useState<'dashboard' | 'tasks'>('dashboard')
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <nav aria-label="Main" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setView('dashboard')}>Dashboard</button>
        <button type="button" onClick={() => setView('tasks')}>Tasks</button>
      </nav>
      <ErrorBoundary key={view}>
        {view === 'dashboard' ? (
          <section>
            <h1>Dashboard</h1>
            <p>Open the Tasks page from the navigation.</p>
          </section>
        ) : (
          <TasksPage />
        )}
      </ErrorBoundary>
    </div>
  )
}
''')
W(T, 'tests/component/tasks.test.tsx', '''
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@ui/App'

const statusCell = (id: string) => document.querySelector(`tr[data-task-id="${id}"] td[data-col="status"]`)

test('tasks page renders statuses and tolerates unknown ones', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
  expect(screen.queryByText('Something went wrong')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Tasks' })).toBeTruthy()
  expect(document.querySelectorAll('tbody tr').length).toBe(8)
  expect(statusCell('TASK-8782')?.textContent).toMatch(/In Progress/)
  expect(statusCell('TASK-1280')?.textContent).toMatch(/Done/)
  expect(statusCell('TASK-8686')?.textContent).toMatch(/Canceled/)
  expect((statusCell('TASK-7262')?.textContent ?? 'x').trim()).toBe('')
})
''')
W(T, 'tests/e2e/tasks.spec.ts', '''
import { expect, test } from '@playwright/test'

test('opening Tasks no longer crashes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await page.getByRole('button', { name: 'Tasks' }).click()
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
  await expect(page.locator('tbody tr')).toHaveCount(8)
  await expect(page.locator('tr[data-task-id="TASK-8782"] td[data-col="status"]')).toContainText('In Progress')
  await expect(page.locator('tr[data-task-id="TASK-7262"] td[data-col="status"]')).toHaveText('')
  expect(errors).toEqual([])
})
''')
J(T, {
  "id": "self/runtime-tasks-status-crash", "suite": "self", "category": "runtime-error", "tags": ["core10"],
  "source": {"derivedFrom": "benchmark/tasks/vite-shadcn-admin/runtime-tasks-status-crash (satnaing/shadcn-admin, MIT)", "license": "MIT (fixture authored for this benchmark)"},
  "prompt": "Opening the Tasks page crashes the app with `TypeError: Cannot read properties of undefined (reading 'icon')` and the error boundary is shown. Fix it so the Status column shows each task's status again; a task with an unknown status should render an empty cell instead of crashing.",
  "app": "app", "solution": "solution", "deps": [],
  "verify": {"e2e": ["tests/e2e/tasks.spec.ts"], "component": ["tests/component/tasks.test.tsx"], "componentAliases": {"@ui": "src/ui"}},
  "stacks": {"default": "applicable"},
  "portingNotes": "The /tasks route of shadcn-admin (TanStack Table) becomes a dependency-free table with the same column-definition pattern (data.ts / columns.tsx / TasksTable / TasksPage) and an error boundary; the Tasks view is opened from in-app navigation instead of a route so it works identically on SPA and SSR stacks. Same injected defect: an unchecked statuses.find() result (here a type assertion) dereferenced for .icon, with one task carrying an unknown status."
})
print('part A ok')
