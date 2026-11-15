"use client";

// The last-resort boundary: it only fires if the ROOT LAYOUT ITSELF throws
// (error.tsx can't catch that — a layout wraps its nearest error.tsx, not the
// other way around). Because it replaces the root layout, Next requires it to
// render its own <html>/<body>; globals.css's CSS-variable tokens may not be
// reliably mounted at that point, so this uses plain inline styles rather than
// the app's usual Tailwind token classes — the one file in the app allowed to,
// since there is no layout left under it to inherit from.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7f6f3", color: "#1a1a1a" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "6rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "1rem", fontWeight: 500 }}>Something went wrong.</p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#666" }}>
            {error.message || "The app failed to load."}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1rem",
              borderRadius: 9999,
              border: "1px solid #ddd",
              background: "transparent",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
