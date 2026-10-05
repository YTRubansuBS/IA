import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const PASSWORD = "Weapons RNG";

function localAssistant(prompt: string, pageTitle: string, pageContent: string) {
  const text = prompt.toLowerCase();

  if (text.includes("tâche") || text.includes("task")) {
    return "Voici une mini-liste de tâches utiles :\n\n1. Définir l’objectif exact.\n2. Écrire les étapes principales.\n3. Préparer un premier test.\n4. Vérifier les erreurs.\n5. Noter ce qui reste à améliorer.";
  }

  if (text.includes("structure") || text.includes("organise")) {
    return (
      "Je te conseille cette structure :\n\n# " +
      (pageTitle || "Nouvelle page") +
      "\n\n## Objectif\nCe que cette page doit permettre de comprendre.\n\n## Fonctionnement\nLes étapes, règles ou décisions importantes.\n\n## À faire\nLes éléments qui restent à réaliser.\n\n## Notes\nQuestions, idées et décisions de l’équipe."
    );
  }

  if (text.includes("roadmap") || text.includes("plan")) {
    return "Plan proposé :\n\n## Étape 1 — Base\nMettre en place la fonctionnalité principale et vérifier qu’elle fonctionne.\n\n## Étape 2 — Interface\nRendre l’utilisation simple et claire.\n\n## Étape 3 — Tests\nTester les cas normaux et les erreurs.\n\n## Étape 4 — Finitions\nCorriger, nettoyer et préparer la prochaine version.";
  }

  if (text.includes("améliore") || text.includes("réécris")) {
    return pageContent
      ? "Voici une direction d’amélioration :\n\n- Commencer par un objectif clair.\n- Regrouper les informations par thèmes.\n- Mettre les décisions importantes en premier.\n- Finir par une section « À faire ».\n\nLe texte actuel peut être conservé puis réorganisé avec cette structure."
      : "Commence par une phrase d’objectif, puis ajoute 3 sections : fonctionnement, décisions et prochaines étapes.";
  }

  return "Je peux t’aider à construire cette page. Essaie une demande comme « crée une roadmap », « organise cette page », « transforme cette idée en plan » ou « donne-moi les prochaines tâches ».";
}

export async function POST(request: Request) {
  if (request.headers.get("x-workspace-password") !== PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  const pageTitle = typeof body?.pageTitle === "string" ? body.pageTitle.slice(0, 120) : "";
  const pageContent = typeof body?.pageContent === "string" ? body.pageContent.slice(0, 12000) : "";

  if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      reply: localAssistant(prompt, pageTitle, pageContent),
      source: "local",
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction:
          "Tu es l’assistant d’un espace de travail collaboratif. Aide à créer et organiser des pages de projet. Réponds en français, sois concret, structuré et directement utilisable. Ne prétends pas avoir modifié une page : tu proposes du contenu.",
        maxOutputTokens: 800,
      },
    });

    return NextResponse.json({
      reply: response.text || localAssistant(prompt, pageTitle, pageContent),
      source: "gemini",
    });
  } catch {
    return NextResponse.json({
      reply: localAssistant(prompt, pageTitle, pageContent),
      source: "local-fallback",
    });
  }
}
