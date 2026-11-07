"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Stack City route error", error);
  }, [error]);

  return (
    <main className="release-error-shell">
      <section role="alert">
        <span className="eyebrow">Recovery mode</span>
        <h1>The city hit an unexpected fault.</h1>
        <p>
          Your local save should still be available. Retry the game first; if the fault returns,
          report it through the beta feedback form without including personal information.
        </p>
        <div>
          <button type="button" onClick={reset}>Retry Stack City</button>
          <a href="https://github.com/chadkraus87/stack-city/issues/new?template=beta-feedback.yml">Report beta feedback</a>
        </div>
      </section>
    </main>
  );
}
