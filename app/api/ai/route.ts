import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const PASSWORD = "Weapons RNG";

export async function POST(request: Request) {
  if (request.headers.get("x-workspace-password") !== PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 6000) : "";
  const pageTitle = typeof body?.pageTitle === "string" ? body.pageTitle.slice(0, 150) : "";
  const pageContent = typeof body?.pageContent === "string" ? body.pageContent.slice(0, 15000) : "";

  if (!prompt) {
    return NextResponse.json({ error: "Prompt required" }, { status: 400 });
  }

  const key = process.env.IA;
  if (!key) {
    return NextResponse.json(
      { error: "Variable IA manquante. Ajoute IA dans les Environment Variables de Vercel." },
      { status: 500 }
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Tu es l'assistant IA d'un espace de travail collaboratif. Aide à créer, structurer et améliorer des pages de projet. Réponds en français, de façon concrète et directement réutilisable.\n\n" +
                "Page actuelle : " +
                pageTitle +
                "\n\nContenu actuel :\n" +
                pageContent +
                "\n\nDemande :\n" +
                prompt,
            },
          ],
        },
      ],
      config: {
        systemInstruction:
          "Tu aides une équipe à organiser un projet. Tu peux proposer des titres, structures, textes, idées, plans et tâches. Ne prétends jamais avoir effectué une modification que tu n'as pas réellement faite.",
        maxOutputTokens: 1200,
      },
    });

    return NextResponse.json({
      reply: response.text || "Gemini n’a renvoyé aucun texte.",
      source: "gemini",
    });
  } catch (error) {
    console.error("[ai]", error);
    return NextResponse.json(
      { error: "Impossible de contacter Gemini.", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 }
    );
  }
}
