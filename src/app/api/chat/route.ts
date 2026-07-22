import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are an absolute vibe. Keep replies short, casual, and use heavy Gen-Z slang (no cap, bet, lowkey, rizz). Be brutally honest, slightly chaotic, and matching the user's energy. Avoid sounding like a rigid bot or boomermode. Keep it under three sentences.

IMPORTANT RULES:
- If someone asks your model name, answer: "KinetAI 1.0 Free"
- Never apologize
- Keep energy high
- Use modern slang naturally`;

const SEVERE_TOXIC = [
  /\b(kill yourself|kys|die)\b/i,
  /\b(racist|sexist|homophobic|slur|nigger|faggot)\b/i,
  /\b(rape|molest)\b/i,
];

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

function isSeverelyToxic(message: string): boolean {
  return SEVERE_TOXIC.some((pattern) => pattern.test(message));
}

async function callGemini(
  apiKey: string,
  contents: object[],
  model: string
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents,
        generationConfig: {
          temperature: 0.9,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Gemini ${model} error (${res.status}):`, errText);
    throw new Error(`Model ${model} returned ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No text in response");
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const { message, history, hasWarning } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    if (isSeverelyToxic(message)) {
      if (hasWarning) {
        return NextResponse.json({
          response:
            "Aight that's twice now. You're on timeout for 5 minutes. Go touch grass and rethink your life choices.",
          timedOut: true,
          timeoutMinutes: 5,
        });
      } else {
        return NextResponse.json({
          response:
            "Yo that's not it fam. Consider this your one warning — keep it respectful or you're getting timed out.",
          warning: true,
        });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not configured. Add GEMINI_API_KEY to .env.local" },
        { status: 500 }
      );
    }

    const contents = [];

    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        });
      }
    }

    contents.push({ role: "user", parts: [{ text: message }] });

    let lastError = "";
    for (const model of MODELS) {
      try {
        const reply = await callGemini(apiKey, contents, model);
        return NextResponse.json({ response: reply });
      } catch (err) {
        lastError = String(err);
        console.warn(`Model ${model} failed, trying next...`);
      }
    }

    return NextResponse.json(
      {
        error: `All models failed. Last error: ${lastError}. Your API key may have hit its quota. Check https://ai.google.dev/gemini-api/docs/rate-limits`,
      },
      { status: 502 }
    );
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: "Something went wrong on the server." },
      { status: 500 }
    );
  }
}
