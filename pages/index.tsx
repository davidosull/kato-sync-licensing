// This is a placeholder page for Next.js
// The actual functionality is in the /api directory
export default function Home() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>KatoSync Licensing Server</h1>
      <p>API endpoints are available at /api/*</p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        <li>/api/activate</li>
        <li>/api/validate</li>
        <li>/api/deactivate</li>
        <li>/api/update-check</li>
        <li>/api/webhooks/lemon-squeezy</li>
      </ul>
    </div>
  );
}
