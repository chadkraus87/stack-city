"use client";

import Link from "next/link";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="release-error-shell">
          <section role="alert">
            <p>STACK CITY // RECOVERY MODE</p>
            <h1>The interface could not start.</h1>
            <p>Your local browser data has not been intentionally cleared.</p>
            <div>
              <button type="button" onClick={reset}>Try again</button>
              <Link href="/">Reload the game</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
