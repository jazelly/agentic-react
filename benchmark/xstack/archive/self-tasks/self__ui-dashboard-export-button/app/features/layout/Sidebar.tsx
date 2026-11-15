const items = ['Dashboard', 'Tasks', 'Apps', 'Chats', 'Users', 'Settings', 'Help Center']

export function Sidebar() {
  return (
    <aside aria-label='Sidebar' style={{ width: 220, borderRight: '1px solid #e5e7eb', padding: 16, background: 'white' }}>
      <div style={{ fontWeight: 700, marginBottom: 16 }}>Shadcn Admin</div>
      <nav>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((item) => (
            <li key={item} style={{ padding: '6px 8px', borderRadius: 6, background: item === 'Dashboard' ? '#f3f4f6' : undefined }}>
              <a href='#' style={{ color: 'inherit', textDecoration: 'none' }}>{item}</a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
