import { mkdir, writeFile } from "node:fs/promises";

const route = `import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { pickActions, type Action } from "./actions";

export const runtime = "nodejs";

type GameState = { health: number; sanity: number; hunger: number; thirst: number; floor: number; turn: number; inventory: string[] };
type GeneratedGame = { title?: string; scene?: string; state?: Partial<GameState>; gameOver?: boolean; deathReason?: string };
const DEFAULT_STATE: GameState = { health: 100, sanity: 100, hunger: 100, thirst: 100, floor: 0, turn: 0, inventory: ["Téléphone (12%)"] };

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeState(raw: Partial<GameState> | undefined, previous: GameState): GameState {
  const next = raw ?? {};
  return {
    health: clamp(next.health, 0, 100, previous.health),
    sanity: clamp(next.sanity, 0, 100, previous.sanity),
    hunger: clamp(next.hunger, 0, 100, previous.hunger),
    thirst: clamp(next.thirst, 0, 100, previous.thirst),
    floor: clamp(next.floor, 0, 999999, previous.floor),
    turn: clamp(next.turn, 0, 999999, previous.turn + 1),
    inventory: Array.isArray(next.inventory) ? next.inventory.filter((x): x is string => typeof x === "string").slice(0, 20) : previous.inventory,
  };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY n’est pas configurée." }, { status: 500 });
    const body = (await request.json()) as { action?: string | null; state?: Partial<GameState>; history?: string[] };
    const previous = normalizeState(body.state, DEFAULT_STATE);
    const action = typeof body.action === "string" ? body.action.trim() : null;
    const history = Array.isArray(body.history) ? body.history.filter((x): x is string => typeof x === "string").slice(-8) : [];
    const selectedActions: Action[] = pickActions(previous.turn);
    const ai = new GoogleGenAI({ apiKey });
    const prompt = [
      "Crée la prochaine scène d'un jeu de survie narratif fictif dans les Backrooms.",
      "Le jeu est sans fin et doit pouvoir continuer pendant énormément de tours.",
      "Le joueur choisit une action parmi les quatre choix fournis, puis tu racontes les conséquences.",
      "Écris en français naturel, immersif et très varié, avec plusieurs paragraphes et beaucoup de détails sensoriels.",
      "Ne recycle pas mot pour mot les phrases ou événements de l’historique. Ne révèle jamais que tu es une IA.",
      "Le ton est mystérieux, oppressant et aventureux, sans détails graphiques.",
      "Les conséquences peuvent être positives, neutres ou négatives. Ajoute parfois des événements rares et inattendus.",
      "Retourne UNIQUEMENT un objet JSON valide avec exactement : title, scene, state, gameOver, deathReason.",
      "Ne crée jamais de nouveaux choix. state contient health, sanity, hunger, thirst, floor, turn et inventory.",
      "Si une statistique atteint 0, gameOver doit être true. Ne fais pas mourir le joueur juste pour une action normale.",
      "La scène doit généralement faire au moins 160 mots.",
      "CHOIX DISPONIBLES :", JSON.stringify(selectedActions),
      "ÉTAT ACTUEL :", JSON.stringify(previous),
      "ACTION DU JOUEUR :", action ?? "Début de la partie : le joueur vient d’arriver dans les Backrooms.",
      "MÉMOIRE RÉCENTE :", history.join("\\n\\n"),
    ].join("\\n");
    const response = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || "gemini-3.8-flash", contents: prompt, config: { systemInstruction: "Tu es le moteur narratif d’un jeu vidéo de survie fictif. Respecte strictement le JSON demandé et maintiens une continuité cohérente.", responseMimeType: "application/json" } });
    let generated: GeneratedGame;
    try { generated = JSON.parse(response.text ?? "") as GeneratedGame; } catch { return NextResponse.json({ error: "Le moteur narratif a renvoyé un format inattendu. Relance la scène." }, { status: 502 }); }
    if (!generated.scene || typeof generated.scene !== "string") return NextResponse.json({ error: "La scène générée est incomplète. Relance la scène." }, { status: 502 });
    const state = normalizeState(generated.state, previous);
    const gameOver = Boolean(generated.gameOver) || state.health <= 0 || state.sanity <= 0 || state.hunger <= 0 || state.thirst <= 0;
    return NextResponse.json({ title: typeof generated.title === "string" && generated.title.trim() ? generated.title.trim() : "UN COULOIR DE PLUS", scene: generated.scene.trim(), actions: selectedActions, state, gameOver, deathReason: gameOver && typeof generated.deathReason === "string" ? generated.deathReason.trim() : undefined });
  } catch (error) {
    console.error("Backrooms game error:", error);
    return NextResponse.json({ error: "Impossible de générer la scène. Vérifie ta clé Gemini et réessaie." }, { status: 500 });
  }
}
`;

await mkdir("app/api/game", { recursive: true });
await writeFile("app/api/game/route.ts", route, "utf8");
console.log("Backrooms route repaired before build.");
