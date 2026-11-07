import Link from "next/link";

export default function NotFound() {
  return (
    <main className="release-error-shell">
      <section>
        <span className="eyebrow">404 / Route not found</span>
        <h1>This service is not on the map.</h1>
        <p>The requested page does not exist. Return to the city and keep the request path healthy.</p>
        <div><Link href="/">Return to Stack City</Link></div>
      </section>
    </main>
  );
}
