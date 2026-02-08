/**
 * LLM abstraction — Ollama support for local models.
 * Add Anthropic/OpenAI later via LLM_PROVIDER env.
 */
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ temperature?: number }} options
 * @returns {Promise<string>} Assistant reply text
 */
export async function complete(messages, options = {}) {
  const body = {
    model: OLLAMA_MODEL,
    messages,
    stream: false,
  };
  if (options.temperature != null) body.temperature = options.temperature;

  let res;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Ollama unreachable at ${OLLAMA_BASE}: ${err.cause?.message ?? err.message}`);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.message?.content ?? "";
}
