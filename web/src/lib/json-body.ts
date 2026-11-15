// A route that reads fields off its body needs a JSON object. `null`, arrays
// and scalars parse fine but throw on the first property read, which surfaced
// as a 500 instead of the route's own 400.
//
// No route here needs more than a few KB of JSON (the largest legitimate body
// is a cover-letter brief's free-text answers). Without a cap, req.json()
// buffers an arbitrarily large body into memory before this function ever
// sees it, and for /api/run specifically an oversized `input`/`brief` also
// multiplies real LLM spend once it's spliced into a prompt — so the limit is
// enforced by reading the stream ourselves, capped, rather than trusting
// req.json() to do it.
const MAX_BODY_BYTES = 256 * 1024; // 256KB

async function readBoundedText(req: Request): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return req.text().catch(() => null); // no stream (e.g. a test Request built from a string) — body is already in memory
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

export async function readJsonObject<T extends object = Record<string, unknown>>(req: Request): Promise<T | null> {
  const text = await readBoundedText(req);
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
}
