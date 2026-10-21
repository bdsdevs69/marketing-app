// The owner's own LLM (Ollama on the office Mac mini, reached through the
// cover generator's /api/llm proxy) — any OpenAI-compatible chat endpoint.
// Optional: when it isn't configured or doesn't answer, callers fall back
// to rules, so an audit never fails because the mini is asleep.
//
//   AUDIT_LLM_URL    e.g. https://covers.digitalnetworkingbranding.com/api/llm
//   AUDIT_LLM_TOKEN  bearer token the proxy expects
//   AUDIT_LLM_MODEL  optional; the proxy uses the mini's model when unset

export const llmConfigured = () => Boolean(process.env.AUDIT_LLM_URL);

// Ask for a JSON object; returns null on any failure or timeout.
export async function askLlmJson<T>(system: string, user: string, timeoutMs = 25000): Promise<T | null> {
  const url = process.env.AUDIT_LLM_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.AUDIT_LLM_TOKEN ? { authorization: `Bearer ${process.env.AUDIT_LLM_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        ...(process.env.AUDIT_LLM_MODEL ? { model: process.env.AUDIT_LLM_MODEL } : {}),
        temperature: 0.2,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? data?.content ?? '';
    // Models sometimes wrap JSON in prose or code fences; take the object.
    const match = content.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as T) : null;
  } catch {
    return null;
  }
}
