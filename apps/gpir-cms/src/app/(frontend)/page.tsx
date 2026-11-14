export const dynamic = 'force-dynamic'

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui', margin: '4rem auto', maxWidth: 720, padding: '0 1rem' }}>
      <h1>GPIR Editorial CMS</h1>
      <p>This private service manages editorial records. Public GPIR routes remain on the existing reviewed publication path.</p>
      <p><a href="/admin">Open the Payload administration console</a></p>
    </main>
  )
}
