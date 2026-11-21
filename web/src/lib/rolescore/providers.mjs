// Three thin adapters, one per API shape. Each takes the user's OWN key
// (decrypted just-in-time by the caller, never persisted in memory beyond the
// request) and returns the raw text the model produced — JSON extraction and
// validation happens one layer up, in evaluate.mjs, since providers differ in
// how reliably they honor a "respond with only JSON" instruction.

const DEFAULT_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Covers OpenAI, OpenRouter, Together, Groq, DeepSeek, local servers (LM Studio/Ollama /v1) — anything OpenAI-compatible. */
async function callOpenAICompatible({ apiKey, baseUrl, model }, systemPrompt, userPrompt) {
  const base = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const res = await fetchWithTimeout(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(`Provider error (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Provider returned no content");
  return text;
}

async function callAnthropic({ apiKey, model }, systemPrompt, userPrompt) {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-5-5",
      max_tokens: 4096,
      system: `${systemPrompt}\n\nRespond with ONLY a single JSON object. No prose, no markdown code fences.`,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Provider error (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data.content?.map((b) => b.text).filter(Boolean).join("\n");
  if (!text) throw new Error("Provider returned no content");
  return text;
}

async function callGemini({ apiKey, model }, systemPrompt, userPrompt) {
  const m = model || "gemini-3.8-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    throw new Error(`Provider error (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n");
  if (!text) throw new Error("Provider returned no content");
  return text;
}

export const PROVIDERS = {
  "openai-compatible": { label: "OpenAI-compatible (OpenAI, OpenRouter, Groq, local…)", call: callOpenAICompatible },
  anthropic: { label: "Anthropic", call: callAnthropic },
  gemini: { label: "Google Gemini", call: callGemini },
};

export function isKnownProvider(provider) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, provider);
}
