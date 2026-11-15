import { ProfileDropdown } from './ProfileDropdown'

export function Header() {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid #eee' }}>
      <input type="search" placeholder="Search…" aria-label="Search" />
      <ProfileDropdown />
    </header>
  )
}
