import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 12000;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Source = {
  title: string;
  url: string;
};

function extractSources(response: any): Source[] {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const found = new Map<string, Source>();

  for (const chunk of chunks) {
    const web = chunk?.web;
    if (!web?.uri) continue;

    found.set(web.uri, {
      title: typeof web.title === "string" && web.title.trim() ? web.title.trim() : web.uri,
      url: web.uri,
    });
  }

  return [...found.values()];
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY n’est pas configurée. Ajoute ta clé Gemini dans les variables d’environnement.",
        },
        { status: 500 },
      );
    }

    const body = (await request.json()) as { messages?: ChatMessage[] };
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return NextResponse.json({ error: "Envoie au moins un message." }, { status: 400 });
    }

    const safeMessages = messages
      .slice(-MAX_MESSAGES)
      .filter(
        (message): message is ChatMessage =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim().length > 0,
      )
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content.trim().slice(0, MAX_MESSAGE_LENGTH) }],
      }));

    if (safeMessages.length === 0) {
      return NextResponse.json({ error: "Le message est vide." }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      contents: safeMessages,
      config: {
        systemInstruction:
          "Tu es une IA utile, claire et honnête. Utilise Google Search pour rechercher sur Internet avant de répondre lorsque des informations récentes, vérifiables ou externes sont nécessaires. Donne une réponse directement utile, dans la langue de l’utilisateur. Ne présente pas une information incertaine comme un fait. Utilise les résultats de recherche pour améliorer la précision et cite les sources pertinentes.",
        tools: [{ googleSearch: {} }],
      },
    });

    return NextResponse.json({
      answer: response.text?.trim() || "Je n’ai pas réussi à générer une réponse.",
      sources: extractSources(response),
    });
  } catch (error) {
    console.error("Gemini chat error:", error);

    return NextResponse.json(
      { error: "Erreur serveur. Vérifie ta clé Gemini et réessaie." },
      { status: 500 },
    );
  }
}
