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

function extractSources(output: unknown): Source[] {
  if (!Array.isArray(output)) return [];

  const found = new Map<string, Source>();

  for (const item of output) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    if (record.type !== "web_search_call") continue;

    const action = record.action;
    if (!action || typeof action !== "object") continue;

    const sources = (action as Record<string, unknown>).sources;
    if (!Array.isArray(sources)) continue;

    for (const source of sources) {
      if (!source || typeof source !== "object") continue;
      const value = source as Record<string, unknown>;
      const url = typeof value.url === "string" ? value.url : "";
      if (!url) continue;

      found.set(url, {
        title:
          typeof value.title === "string" && value.title.trim()
            ? value.title.trim()
            : url,
        url,
      });
    }
  }

  return [...found.values()];
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY n’est pas configurée. Ajoute ta clé OpenAI dans les variables d’environnement.",
        },
        { status: 500 },
      );
    }

    const body = (await request.json()) as { messages?: ChatMessage[] };
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Envoie au moins un message." },
        { status: 400 },
      );
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
        role: message.role,
        content: message.content.trim().slice(0, MAX_MESSAGE_LENGTH),
      }));

    if (safeMessages.length === 0) {
      return NextResponse.json(
        { error: "Le message est vide." },
        { status: 400 },
      );
    }

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-6-astra",
        instructions: [
          "Tu es une IA utile, claire et honnête.",
          "Pour chaque message utilisateur, effectue obligatoirement une recherche web avant de répondre.",
          "Utilise les informations trouvées sur le web pour répondre, surtout pour les sujets récents ou susceptibles d’avoir changé.",
          "Ne présente pas une information incertaine comme un fait.",
          "Réponds dans la langue utilisée par l’utilisateur.",
          "Quand la recherche apporte des sources pertinentes, mentionne clairement les sources dans ta réponse.",
        ].join(" "),
        tools: [
          {
            type: "web_search",
            search_context_size: "medium",
            external_web_access: true,
          },
        ],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        store: false,
        input: safeMessages,
      }),
    });

    const data = (await upstream.json()) as {
      output_text?: string;
      output?: unknown;
      error?: { message?: string };
    };

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error:
            data.error?.message ||
            "L’API OpenAI a refusé la requête. Vérifie ta clé et les limites de ton compte.",
        },
        { status: upstream.status },
      );
    }

    return NextResponse.json({
      answer:
        data.output_text?.trim() ||
        "Je n’ai pas pu générer de réponse à partir des résultats web.",
      sources: extractSources(data.output),
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return NextResponse.json(
      { error: "Erreur serveur. Réessaie dans quelques secondes." },
      { status: 500 },
    );
  }
}
