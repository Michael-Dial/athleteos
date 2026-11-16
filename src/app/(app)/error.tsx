"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card stack" role="alert" style={{ maxWidth: 560 }}>
      <h2>This page couldn&apos;t load</h2>
      <p className="small ink2">Something failed while building it. Your data is safe; try again, and if it keeps happening check the app logs{error.digest ? ` for reference ${error.digest}` : ""}.</p>
      <div className="row"><button className="btn primary" onClick={reset}>Try again</button></div>
    </div>
  );
}
