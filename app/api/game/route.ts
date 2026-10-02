import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GameState = {
  health: number;
  sanity: number;
  hunger: number;
  thirst: number;
  floor: number;
  turn: number;
  inventory: string[];
};

type Action = {
  id: string;
  label: string;
  description: string;
};

type GeneratedGame = {
  title?: string;
  scene?: string;
  actions?: Action[];
  state?: Partial<GameState>;
  gameOver?: boolean;
  deathReason?: string;
};

const DEFAULT_STATE: GameState = {
  health: 100,
  sanity: 100,
  hunger: 100,
  thirst: 100,
  floor: 0,
  turn: 0,
  inventory: ["Téléphone (12%)"],
};

function clamp(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const number =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeState(
  raw: Partial<GameState> | undefined,
  previous: GameState,
): GameState {
  const next = raw ?? {};

  return {
    health: clamp(next.health, 0, 100, previous.health),
    sanity: clamp(next.sanity, 0, 100, previous.sanity),
    hunger: clamp(next.hunger, 0, 100, previous.hunger),
    thirst: clamp(next.thirst, 0, 100, previous.thirst),
    floor: clamp(next.floor, 0, 999999, previous.floor),
    turn: clamp(next.turn, 0, 999999, previous.turn + 1),
    inventory: Array.isArray(next.inventory)
      ? next.inventory
          .filter((item): item is string => typeof item === "string")
          .slice(0, 20)
      : previous.inventory,
  };
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

    const body = (await request.json()) as {
      action?: string | null;
      state?: Partial<GameState>;
      history?: string[];
    };

    const previous = normalizeState(body.state, DEFAULT_STATE);
    const action =
      typeof body.action === "string" ? body.action.trim() : null;
    const history = Array.isArray(body.history)
      ? body.history
          .filter((item): item is string => typeof item === "string")
          .slice(-8)
      : [];

    const variationKey = Math.random().toString(36).slice(2, 10);
    const ai = new GoogleGenAI({ apiKey });

    const prompt = [
      "Crée la prochaine scène d'un jeu de survie narratif fictif dans les Backrooms.",
      "Le jeu est sans fin : il doit pouvoir continuer pendant énormément de tours.",
      "Le joueur choisit une action, puis tu racontes les conséquences et proposes de nouvelles actions.",
      "Écris en français naturel, immersif et très varié.",
      "Fais une scène riche avec plusieurs paragraphes et beaucoup de phrases concrètes : sons, lumières, odeurs, architecture, sensation de distance, indices, objets et changements subtils.",
      "Ne recycle pas mot pour mot les phrases, titres, événements ou actions présents dans l'historique fourni.",
      "Ne révèle jamais que tu es une IA et ne parle jamais de génération, de prompt ou de modèle.",
      "Le ton doit être mystérieux, oppressant et aventureux, sans détails graphiques.",
      "Les actions doivent avoir de vraies conséquences sur la santé, la lucidité, la faim, la soif, l'étage et l'inventaire.",
      "Une action peut être bénéfique, neutre ou risquée. Il ne faut pas toujours punir le joueur.",
      "Ajoute parfois des événements rares : raccourci, anomalie du décor, faux espoir, objet utile, zone calme, bruit lointain, changement de niveau ou rencontre ambiguë.",
      "Les sorties ne sont jamais garanties. Le jeu peut durer très longtemps.",
      "Retourne UNIQUEMENT un objet JSON valide avec exactement ces champs : title, scene, actions, state, gameOver, deathReason.",
      "actions doit contenir exactement 4 choix, chacun avec id, label et description.",
      "state doit contenir health, sanity, hunger, thirst, floor, turn et inventory.",
      "Si une statistique tombe à 0 ou moins, gameOver doit être true.",
      "Ne fais pas mourir le joueur juste parce qu'il choisit une action normale ; la partie doit pouvoir durer.",
      "Chaque nouvelle scène doit généralement faire au moins 160 mots.",
      "Clé de variété interne : " + variationKey,
      "",
      "ÉTAT ACTUEL :",
      JSON.stringify(previous),
      "",
      "ACTION DU JOUEUR :",
      action ??
        "Début de la partie : le joueur vient d'arriver dans les Backrooms.",
      "",
      "MÉMOIRE RÉCENTE :",
      history.join("\n\n"),
    ].join("\n");

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction:
          "Tu es le moteur narratif d’un jeu vidéo de survie fictif. Tes réponses doivent respecter strictement le format JSON demandé et maintenir une continuité cohérente.",
        responseMimeType: "application/json",
      },
    });

    let generated: GeneratedGame;

    try {
      generated = JSON.parse(response.text ?? "") as GeneratedGame;
    } catch {
      return NextResponse.json(
        {
          error:
            "Le moteur narratif a renvoyé un format inattendu. Relance la scène.",
        },
        { status: 502 },
      );
    }

    const state = normalizeState(generated.state, previous);
    const actions = Array.isArray(generated.actions)
      ? generated.actions
          .filter(
            (item): item is Action =>
              !!item &&
              typeof item === "object" &&
              typeof item.id === "string" &&
              typeof item.label === "string" &&
              typeof item.description === "string",
          )
          .slice(0, 4)
      : [];

    if (!generated.scene || actions.length < 4) {
      return NextResponse.json(
        { error: "La scène générée est incomplète. Relance la scène." },
        { status: 502 },
      );
    }

    const isGameOver =
      Boolean(generated.gameOver) ||
      state.health <= 0 ||
      state.sanity <= 0 ||
      state.hunger <= 0 ||
      state.thirst <= 0;

    return NextResponse.json({
      title:
        typeof generated.title === "string" && generated.title.trim()
          ? generated.title.trim()
          : "UN COULOIR DE PLUS",
      scene: generated.scene.trim(),
      actions,
      state,
      gameOver: isGameOver,
      deathReason:
        isGameOver && typeof generated.deathReason === "string"
          ? generated.deathReason.trim()
          : undefined,
    });
  } catch (error) {
    console.error("Backrooms game error:", error);

    return NextResponse.json(
      {
        error:
          "Impossible de générer la scène. Vérifie ta clé Gemini et réessaie.",
      },
      { status: 500 },
    );
  }
}
