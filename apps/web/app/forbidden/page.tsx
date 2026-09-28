export default function ForbiddenPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="eyebrow">Access restricted</span>
        <h1>This workspace area is for owners and admins.</h1>
        <p>VenueLoom keeps bulk migration, OAuth credentials, provider connections, and protected sync resolution behind administrative access.</p>
        <a className="button secondary full" href="/">Return to VenueLoom</a>
      </section>
    </main>
  );
}
