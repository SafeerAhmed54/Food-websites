export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Auto Daily Commit</h1>
      <p>Next.js application with automatic daily commits</p>
      
      <section style={{ marginTop: '2rem' }}>
        <h2>Monitoring API</h2>
        <p>The following API endpoints are available for monitoring and controlling the auto-commit service:</p>
        
        <ul style={{ lineHeight: '1.8' }}>
          <li>
            <strong>GET /api/auto-commit/status</strong> - Get service status
          </li>
          <li>
            <strong>GET /api/auto-commit/history?count=10</strong> - Get recent commit history
          </li>
          <li>
            <strong>POST /api/auto-commit/trigger</strong> - Manually trigger a commit
          </li>
          <li>
            <strong>GET /api/auto-commit</strong> - API documentation
          </li>
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Quick Links</h2>
        <ul style={{ lineHeight: '1.8' }}>
          <li>
            <a href="/api/auto-commit" style={{ color: '#0070f3' }}>
              API Documentation
            </a>
          </li>
          <li>
            <a href="/api/auto-commit/status" style={{ color: '#0070f3' }}>
              View Service Status
            </a>
          </li>
          <li>
            <a href="/api/auto-commit/history" style={{ color: '#0070f3' }}>
              View Commit History
            </a>
          </li>
        </ul>
      </section>

      <section style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Configuration</h3>
        <p>Configure the service using environment variables in <code>.env.local</code>:</p>
        <ul style={{ lineHeight: '1.8', fontSize: '0.9rem' }}>
          <li><code>AUTO_COMMIT_ENABLED</code> - Enable/disable the service</li>
          <li><code>AUTO_COMMIT_CONFIG_PATH</code> - Path to configuration file</li>
          <li><code>AUTO_COMMIT_REPO_PATH</code> - Repository path</li>
          <li><code>AUTO_COMMIT_LOG_PATH</code> - Log file path</li>
          <li><code>AUTO_COMMIT_LOG_LEVEL</code> - Log level (debug, info, error)</li>
        </ul>
        <p style={{ fontSize: '0.9rem', marginTop: '1rem' }}>
          See <code>.env.example</code> for more details.
        </p>
      </section>
    </main>
  )
}