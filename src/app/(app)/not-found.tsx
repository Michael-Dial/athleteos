import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card stack" style={{ maxWidth: 480 }}>
      <h2>Not found</h2>
      <p className="small ink2">That item doesn&apos;t exist or was deleted.</p>
      <Link className="btn" href="/">Go to today</Link>
    </div>
  );
}
