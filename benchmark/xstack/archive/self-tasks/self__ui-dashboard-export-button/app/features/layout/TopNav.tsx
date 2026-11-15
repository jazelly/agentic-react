import { Button } from '../../components/Button'

const links = ['Overview', 'Customers', 'Products', 'Settings']

export function TopNav() {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid #e5e7eb', background: 'white' }}>
      <nav style={{ display: 'flex', gap: 16 }}>
        {links.map((l) => (
          <a key={l} href='#' style={{ color: l === 'Overview' ? '#111827' : '#6b7280', textDecoration: 'none' }}>{l}</a>
        ))}
      </nav>
      <div style={{ display: 'flex', gap: 8 }}>
        <input aria-label='Search' placeholder='Search' style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }} />
        <Button variant='ghost' size='icon' aria-label='Toggle theme'>◐</Button>
        <Button variant='outline' size='sm'>Sign out</Button>
      </div>
    </header>
  )
}
