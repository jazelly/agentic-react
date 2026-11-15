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
