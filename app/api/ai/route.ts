import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

type EditResult = {
  code: string;
  explanation: string;
};

function parseResult(raw: string): EditResult {
  const value = raw.trim();

  try {
    const parsed = JSON.parse(value) as Partial<EditResult>;
    if (typeof parsed.code === "string" && parsed.code.trim()) {
      return {
        code: parsed.code,
        explanation:
          typeof parsed.explanation === "string"
            ? parsed.explanation
            : "Code modifié.",
      };
    }
  } catch {}

  return { code: value, explanation: "Code modifié." };
}

function getExactError(error: unknown): { message: string; status: number; type: string } {
  const value = error as {
    message?: unknown;
    status?: unknown;
    statusCode?: unknown;
    name?: unknown;
    error?: { message?: unknown; status?: unknown; code?: unknown };
  };

  const nested = value?.error;
  const message =
    typeof nested?.message === "string"
      ? nested.message
      : typeof value?.message === "string"
        ? value.message
        : String(error);

  const rawStatus = nested?.status ?? value?.status ?? value?.statusCode;
  const status = typeof rawStatus === "number" && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 502;
  const type = typeof value?.name === "string" ? value.name : "GeminiAPIError";

  return { message, status, type };
}

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  if (!/(^|;\s*)script_ai_access=1(?:;|$)/.test(cookie)) {
    return NextResponse.json(
      { error: "Accès refusé : entre le code Fourchette avant d'utiliser l'API.", errorType: "AccessRequired" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 8000) : "";
  const source = typeof body?.source === "string" ? body.source.slice(0, 100000) : "";
  const scriptName = typeof body?.scriptName === "string" ? body.scriptName.slice(0, 200) : "Script Luau";

  if (!prompt) {
    return NextResponse.json({ error: "Décris la modification à faire." }, { status: 400 });
  }

  if (!source.trim()) {
    return NextResponse.json({ error: "Colle un script avant de lancer la modification." }, { status: 400 });
  }

  const key = process.env.IA;
  if (!key) {
    return NextResponse.json(
      { error: "La variable IA est absente des Environment Variables.", errorType: "ConfigurationError" },
      { status: 500 }
    );
  }

  try {
    const client = new GoogleGenAI({ apiKey: key });
    const response = await client.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        "Tu es un expert en Luau.",
        "L'utilisateur donne un script existant et demande une modification.",
        "Analyse le code existant puis applique uniquement la modification demandée.",
        "Conserve les fonctions qui ne sont pas concernées.",
        "Corrige les erreurs nécessaires pour que le nouveau code soit cohérent.",
        "Réponds UNIQUEMENT avec un objet JSON contenant code et explanation.",
        "code doit contenir le fichier Luau COMPLET après modification.",
        "Ne mets pas de markdown dans code.",
        "",
        "Nom du script : " + scriptName,
        "",
        "CODE ACTUEL :",
        source,
        "",
        "DEMANDE :",
        prompt,
      ].join("\n"),
      config: {
        systemInstruction: "Tu produis du code Luau complet, cohérent et directement copiable.",
        maxOutputTokens: 16000,
        temperature: 0.15,
      },
    });

    const result = parseResult(response.text || "");
    if (!result.code.trim()) {
      return NextResponse.json({ error: "Aucun code n'a été généré.", errorType: "EmptyResponse" }, { status: 502 });
    }

    const usage = response.usageMetadata;

    return NextResponse.json({
      ...result,
      usage: {
        promptTokens: usage?.promptTokenCount ?? null,
        outputTokens: usage?.candidatesTokenCount ?? null,
        totalTokens: usage?.totalTokenCount ?? null,
      },
    });
  } catch (error) {
    console.error("[code-ai] Gemini error:", error);
    const exact = getExactError(error);

    return NextResponse.json(
      {
        error: exact.message,
        errorType: exact.type,
        errorStatus: exact.status,
        hint: "Regarde le message exact ci-dessus : il indique notamment si la clé est invalide, expirée, limitée ou si le modèle est indisponible.",
      },
      { status: exact.status }
    );
  }
}
