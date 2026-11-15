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
