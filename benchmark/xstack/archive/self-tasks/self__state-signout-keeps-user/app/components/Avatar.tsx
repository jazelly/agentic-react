export function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span aria-hidden="true" style={{ display: 'inline-grid', placeItems: 'center', width: 32, height: 32, borderRadius: 16, background: '#e5e7eb', fontSize: 12 }}>
      {initials}
    </span>
  )
}
