import "server-only";

// Til modeli. Asosiy provayder (Claude tahlillari) LLM_PROVIDER bilan tanlanadi:
//   deepseek  — DEEPSEEK_API_KEY (platform.deepseek.com), model standart: deepseek-chat
//   anthropic — ANTHROPIC_API_KEY (console.anthropic.com), model standart: claude-haiku-5-5
//   gemini    — GEMINI_API_KEY (aistudio.google.com, bepul tarifi bor), model standart: gemini-2.5-flash
//   mock      — sinov uchun, tashqi so'rov yubormaydi
// LLM_MODEL bilan modelni almashtirish mumkin.
// Sayt operatori (chat) alohida va faqat DeepSeek'da: DEEPSEEK_API_KEY, OPERATOR_MODEL. Claude operatorlik qilmaydi.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export class LlmNotConfigured extends Error {}

export type Provider = "mock" | "deepseek" | "anthropic" | "gemini";

// Kaliti qo'yilgan bo'lsa provayder nomini qaytaradi, aks holda null.
function usable(name: string): Provider | null {
  const p = name.toLowerCase();
  if (p === "mock") return p;
  if (p === "deepseek" && process.env.DEEPSEEK_API_KEY) return p;
  if (p === "anthropic" && process.env.ANTHROPIC_API_KEY) return p;
  if (p === "gemini" && process.env.GEMINI_API_KEY) return p;
  return null;
}

export function provider() {
  return usable(process.env.LLM_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.DEEPSEEK_API_KEY ? "deepseek" : process.env.GEMINI_API_KEY ? "gemini" : ""));
}

// Operator chati uchun provayder: faqat DeepSeek (lokal sinovda LLM_PROVIDER=mock).
export function operatorProvider() {
  return process.env.LLM_PROVIDER === "mock" ? usable("mock") : usable("deepseek");
}

// opts.json: javob shu JSON sxemaga mos bo'lsin (Anthropic'da qat'iy, boshqalarda JSON rejimi).
// opts.model: shu chaqiruv uchun model (masalan AI treyder uchun alohida), opts.maxTokens: javob chegarasi.
// opts.provider: asosiysidan boshqa provayder (operator uchun). LLM_MODEL faqat asosiy provayderga tegishli.
export type CompleteOpts = { json?: Record<string, unknown>; model?: string; maxTokens?: number; provider?: Provider | null };

export async function complete(system: string, messages: ChatMessage[], opts: CompleteOpts = {}): Promise<string> {
  const main = provider();
  const p = opts.provider ?? main;
  if (!p) throw new LlmNotConfigured("AI operator hali ulanmagan");
  const envModel = p === main ? process.env.LLM_MODEL : undefined;

  if (p === "mock") {
    const last = messages[messages.length - 1]?.content ?? "";
    const analysis = opts.json && "analysis" in ((opts.json.properties as object) ?? {}) ? mockAnalysis(last) : undefined;
    if (opts.json && "verdict" in ((opts.json.properties as object) ?? {})) return JSON.stringify({ verdict: "tasdiq", confidence: 60, note: "Sinov javobi: H1 tuzilmasi signal yo'nalishini qo'llaydi.", analysis });
    if (opts.json) return JSON.stringify({ action: "WAIT", sl: 0, tp1: 0, tp2: 0, confidence: 40, reason: "Sinov javobi: aniq ustunlik yo'q.", analysis });
    return `Sinov javobi: "${last.slice(0, 80)}" savolingizni oldim.`;
  }

  if (p === "deepseek") {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: opts.model ?? envModel ?? "deepseek-chat",
        messages: [{ role: "system", content: system }, ...messages],
        max_tokens: opts.maxTokens ?? 1200,
        temperature: 0.4,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return String(data.choices?.[0]?.message?.content ?? "").trim();
  }

  if (p === "gemini") {
    const model = opts.model ?? envModel ?? "gemini-2.5-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: opts.maxTokens ?? 1200, temperature: 0.4, ...(opts.json ? { responseMimeType: "application/json" } : {}) },
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
      model: opts.model ?? envModel ?? "claude-haiku-5-5",
      system,
      messages,
      max_tokens: opts.maxTokens ?? 1200,
      ...(opts.json ? { output_config: { format: { type: "json_schema", schema: opts.json } } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("Anthropic: model javob berishdan bosh tortdi");
  return (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("").trim();
}

// Sinov (mock) uchun joriy narx atrofida namunaviy tahlil.
function mockAnalysis(input: string) {
  const p = Number(input.match(/"joriy_narx":([\d.]+)/)?.[1] ?? 0);
  const at = (k: number) => Math.round(p * (1 + k / 1000) * 100) / 100;
  return {
    strategy: "Sinov: trend davomi, H1 pullback tugashidan kirish.",
    trends: { D1: "up", H4: "up", H1: "up", M15: "flat" },
    levels: [
      { price: at(4), kind: "resistance", note: "Oldingi cho'qqi" },
      { price: at(-3), kind: "support", note: "H1 tubi" },
      { price: at(6), kind: "liquidity", note: "Cho'qqi ustidagi stoplar" },
    ],
    zones: [{ from: at(-6), to: at(-4), kind: "demand", note: "H4 talab zonasi" }],
    reasons: ["D1 va H4 trendi yuqoriga", "Narx EMA50 dan qaytdi"],
    risks: ["Yaqin qarshilik"],
    invalidation: at(-7),
    scenario: "Sinov ssenariysi.",
  };
}
