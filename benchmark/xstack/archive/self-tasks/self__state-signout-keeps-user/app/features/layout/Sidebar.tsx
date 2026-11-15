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
