const service = {
  name: 'API',
  operational: true,
}

export default function StatusPage() {
  return (
    <main>
      <h1>Service status</h1>
      <p>
        {service.name}: {service.operational ? 'Operational' : 'Unavailable'}
      </p>
    </main>
  )
}
