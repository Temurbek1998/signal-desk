import "server-only";

// AI operator uchun til modeli. LLM_PROVIDER bilan tanlanadi:
//   deepseek  — DEEPSEEK_API_KEY (platform.deepseek.com), model standart: deepseek-chat
//   anthropic — ANTHROPIC_API_KEY (console.anthropic.com), model standart: claude-haiku-5-5
//   gemini    — GEMINI_API_KEY (aistudio.google.com, bepul tarifi bor), model standart: gemini-2.5-flash
//   mock      — sinov uchun, tashqi so'rov yubormaydi
// LLM_MODEL bilan modelni almashtirish mumkin.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export class LlmNotConfigured extends Error {}

export function provider() {
  const p = (process.env.LLM_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.DEEPSEEK_API_KEY ? "deepseek" : process.env.GEMINI_API_KEY ? "gemini" : "")).toLowerCase();
  if (p === "mock") return p;
  if (p === "deepseek" && process.env.DEEPSEEK_API_KEY) return p;
  if (p === "anthropic" && process.env.ANTHROPIC_API_KEY) return p;
  if (p === "gemini" && process.env.GEMINI_API_KEY) return p;
  return null;
}

export async function complete(system: string, messages: ChatMessage[]): Promise<string> {
  const p = provider();
  if (!p) throw new LlmNotConfigured("AI operator hali ulanmagan");

  if (p === "mock") {
    const last = messages[messages.length - 1]?.content ?? "";
    return `Sinov javobi: "${last.slice(0, 80)}" savolingizni oldim.`;
  }

  if (p === "deepseek") {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? "deepseek-chat",
        messages: [{ role: "system", content: system }, ...messages],
        max_tokens: 700,
        temperature: 0.4,
      }),
    });
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return String(data.choices?.[0]?.message?.content ?? "").trim();
  }

  if (p === "gemini") {
    const model = process.env.LLM_MODEL ?? "gemini-2.5-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 1200, temperature: 0.4 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("").trim();
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? "claude-haiku-5-5",
      system,
      messages,
      max_tokens: 1200,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("").trim();
}
