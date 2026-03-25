// Root landing page. Later we'll add month navigation and CSAT section.

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        color: 'white'
      }}
    >
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>SME Digest</h1>
      <p style={{ maxWidth: 600, textAlign: 'center', opacity: 0.9 }}>
        Public landing for monthly team digests. Navigation by months, team filters, lifestyle and work
        highlights will appear here once backend data is connected.
      </p>
    </main>
  );
}

