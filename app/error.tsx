"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page">
      <section className="panel settings-form">
        <h1>Service temporarily unavailable</h1>
        <p>
          The workspace could not load. Check that the API and database are
          running, then retry.
        </p>
        <button className="primary" onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
