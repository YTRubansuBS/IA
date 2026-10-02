import { NextResponse } from "next/server";
import { pickActions, type Action } from "./actions";

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

const DEFAULT_STATE: GameState = {
  health: 100,
  sanity: 100,
  hunger: 100,
  thirst: 100,
  floor: 0,
  turn: 0,
  inventory: ["Téléphone (12%)"],
};

const TITLES = [
  "LE COULOIR QUI N'EN FINIT PAS",
  "BRUIT DANS LA MOQUETTE",
  "LES NÉONS VIBRENT ENCORE",
  "UNE PORTE DE TROP",
  "LE SILENCE APRÈS LE BOURDONNEMENT",
  "QUELQUE CHOSE A BOUGÉ",
  "LE PLAN DU NIVEAU N'EXISTE PAS",
  "LUMIÈRE AU BOUT DU COULOIR",
  "LA PIÈCE QUI N'ÉTAIT PAS LÀ",
  "UN CHOIX PARMI CENT",
  "LE CARREFOUR JAUNE",
  "L'ODEUR DE PLUIE",
];

const OPENINGS = [
  "Tu avances depuis si longtemps que tes pas commencent à avoir leur propre rythme. Pourtant, lorsque tu regardes derrière toi, le couloir paraît exactement comme il était quelques minutes plus tôt.",
  "Le bourdonnement des néons remplit tout l'espace. Il est si régulier que tu finis par l'oublier. Puis une ampoule s'éteint, juste assez longtemps pour que tu remarques qu'il n'y a plus aucun autre bruit.",
  "La moquette absorbe presque entièrement le son de tes chaussures. Chaque mur porte la même couleur jaunâtre, mais quelque chose dans les motifs irréguliers te donne l'impression d'être observé.",
  "Tu débouches dans une partie du niveau que tu ne reconnais pas. Les murs sont toujours jaunes, les plafonds toujours trop bas, mais l'air a changé. Il semble plus froid, et tu entends une vibration lointaine derrière un mur.",
  "Une sensation étrange te traverse : tu connais ce couloir. Tu ne te souviens pourtant pas l'avoir déjà vu. Une porte au bout semble attendre que tu t'approches.",
  "Tu t'arrêtes. Pendant quelques secondes, rien ne se passe. Puis trois gouttes tombent quelque part dans l'obscurité. Tu regardes autour de toi sans trouver d'eau.",
  "Le téléphone indique toujours la même heure depuis un moment. Tu ne sais plus si l'horloge avance ou si c'est toi qui tournes en rond.",
  "Un courant d'air passe sur ton visage. C'est la première vraie variation d'air depuis ton arrivée. Il vient d'une direction impossible à voir depuis ta position.",
];

const DETAILS_A = [
  "Le papier peint est couvert de petites irrégularités presque invisibles.",
  "Une rangée de néons clignote selon un rythme différent des autres.",
  "Le sol semble légèrement incliné, mais seulement sur quelques mètres.",
  "Une porte est plus haute que toutes les autres.",
  "Un tapis de moquette paraît presque neuf au milieu des zones usées.",
  "Une conduite métallique longe le plafond puis disparaît brusquement dans le mur.",
  "Une odeur de poussière humide flotte près d'un angle.",
  "Le bruit de ventilation semble venir de plusieurs directions à la fois.",
  "Une petite trace sombre traverse la moquette puis s'arrête net.",
  "Le plafond porte une marque rectangulaire comme si un panneau avait été retiré.",
];

const DETAILS_B = [
  "Tu entends quelque chose qui ressemble à un chariot roulant, puis plus rien.",
  "Le prochain néon produit un grésillement beaucoup plus aigu que les autres.",
  "Au loin, une porte claque. Tu ne vois pourtant personne.",
  "Un son grave résonne dans les murs et disparaît aussi vite qu'il est venu.",
  "Tu crois entendre ton propre prénom, très loin devant toi.",
  "Un cliquetis métallique se répète trois fois derrière toi.",
  "Le silence devient tellement lourd que le moindre mouvement paraît énorme.",
  "Une vibration traverse le sol sous tes chaussures.",
  "Un courant d'air apporte une odeur de béton froid.",
  "Pendant un instant, tous les sons semblent venir du même endroit.",
];

const CONSEQUENCES = [
  "Tu prends ton temps et tu gagnes surtout des informations. La zone reste étrangement calme.",
  "Le choix te fait gagner du terrain, mais la marche te fatigue davantage que prévu.",
  "Tu découvres un petit détour qui te permet d'éviter une partie du niveau.",
  "Rien ne se passe immédiatement. Pourtant, tu remarques un détail important qui pourra peut-être te servir plus tard.",
  "L'endroit réagit d'une façon que tu n'avais pas anticipée. Tu n'as pas de blessure grave, mais tu comprends que le niveau n'est pas aussi prévisible qu'il en a l'air.",
  "Tu trouves une petite réserve utilisable. Ce n'est pas grand-chose, mais dans cet endroit, même une petite ressource peut devenir précieuse.",
  "Le chemin semble plus simple pendant quelques minutes. Tu en profites pour mémoriser plusieurs repères.",
  "Tu perds un peu de temps, mais cette hésitation t'évite de t'engager immédiatement dans une mauvaise direction.",
];

const ENDINGS = [
  "Tu arrives finalement à un nouveau croisement. Quatre chemins s'offrent encore à toi.",
  "Après plusieurs mètres, le décor change subtilement. Une autre partie du niveau commence devant toi.",
  "Tu continues jusqu'à une zone où les murs prennent une teinte légèrement différente.",
  "Un panneau sans texte apparaît au bout d'un long couloir.",
  "Tu découvres une pièce inconnue avec une seule sortie. La lumière qui en sort n'est pas celle des néons.",
  "Le niveau semble avoir changé autour de toi. La prochaine décision devra être prise sans certitude.",
];

const ITEMS = [
  "Bouteille d'eau",
  "Barre énergétique",
  "Lampe de poche",
  "Pile",
  "Craie",
  "Petit miroir",
  "Clé rouillée",
  "Plan incomplet",
  "Radio presque vide",
  "Câble court",
  "Ruban adhésif",
  "Gourde",
];

function clamp(value: unknown, min: number, max: number, fallback: number) {
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
    turn: clamp(next.turn, 0, 999999, previous.turn),
    inventory: Array.isArray(next.inventory)
      ? next.inventory
          .filter((item): item is string => typeof item === "string")
          .slice(0, 20)
      : previous.inventory,
  };
}

function pick<T>(items: T[], seed: number) {
  return items[Math.abs(seed) % items.length];
}

function containsAny(text: string, words: string[]) {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function simulate(
  previous: GameState,
  action: Action | null,
): { state: GameState; consequence: string; discovery: string } {
  const turn = previous.turn;
  const seed = turn * 7919 + (action ? Number(action.id) * 104729 : 13);
  let health = previous.health;
  let sanity = previous.sanity;
  let hunger = previous.hunger;
  let thirst = previous.thirst;
  let floor = previous.floor;
  let inventory = [...previous.inventory];

  hunger -= turn % 3 === 0 ? 3 : 2;
  thirst -= turn % 4 === 0 ? 4 : 2;
  sanity -= turn % 6 === 0 ? 2 : 1;

  const label = action?.label ?? "";
  const careful = containsAny(label, [
    "lentement",
    "observer",
    "écouter",
    "attendre",
    "examiner",
    "comparer",
    "vérifier",
  ]);
  const risky = containsAny(label, [
    "courir",
    "sombre",
    "ramper",
    "traverser",
    "entrer",
    "suivre une voix",
    "pile ou face",
    "au hasard",
  ]);

  if (careful) sanity = Math.min(100, sanity + 2);

  if (risky) {
    health -= seed % 7 === 0 ? 9 : 0;
    sanity -= seed % 5 === 0 ? 5 : 0;
  }

  if (containsAny(label, ["boire", "réserve", "chercher de l’eau"])) {
    thirst = Math.min(100, thirst + 18);
  }

  if (containsAny(label, ["manger", "nourriture"])) {
    hunger = Math.min(100, hunger + 16);
  }

  if (containsAny(label, ["éteindre son téléphone"])) {
    inventory = inventory.map((item) =>
      item.startsWith("Téléphone")
        ? "Téléphone (économie de batterie)"
        : item,
    );
    sanity = Math.min(100, sanity + 1);
  }

  if (seed % 9 === 0 && inventory.length < 20) {
    const item = pick(ITEMS, seed + turn);
    if (!inventory.includes(item)) inventory.push(item);
  }

  if (seed % 13 === 0) {
    floor = Math.min(999999, floor + 1);
  } else if (seed % 37 === 0 && floor > 0) {
    floor -= 1;
  }

  const discovery =
    seed % 6 === 0
      ? "Tu remarques une petite ressource oubliée dans un coin du décor."
      : seed % 8 === 0
        ? "Tu découvres un nouveau repère qui n'était pas là auparavant."
        : seed % 11 === 0
          ? "Une anomalie discrète apparaît dans l'architecture, puis semble redevenir normale."
          : "";

  return {
    state: {
      health,
      sanity,
      hunger,
      thirst,
      floor,
      turn: previous.turn + 1,
      inventory,
    },
    consequence: pick(CONSEQUENCES, seed),
    discovery,
  };
}

function makeScene(
  state: GameState,
  action: Action | null,
  consequence: string,
  discovery: string,
) {
  const seed = state.turn * 1543 + state.floor * 31 + state.health;

  const paragraphOne = action
    ? "Tu décides de " +
      action.label.toLowerCase() +
      ". " +
      consequence
    : "Tu ouvres les yeux sur une moquette jaune qui semble s'étendre dans toutes les directions. " +
      consequence;

  const paragraphTwo =
    pick(OPENINGS, seed) +
    " " +
    pick(DETAILS_A, seed + 3) +
    " " +
    pick(DETAILS_B, seed + 7) +
    " " +
    pick(DETAILS_A, seed + 11);

  const paragraphThree =
    "Le niveau te laisse quelques secondes de répit. " +
    pick(DETAILS_B, seed + 17) +
    " " +
    (discovery || pick(CONSEQUENCES, seed + 23)) +
    " Tu gardes ton calme et tu mémorises ce que tu peux avant de continuer.";

  const paragraphFour =
    "Ta progression reste incertaine. " +
    pick(ENDINGS, seed + 29) +
    " " +
    pick(OPENINGS, seed + 31);

  return [paragraphOne, paragraphTwo, paragraphThree, paragraphFour].join(
    "\n\n",
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string | null;
      state?: Partial<GameState>;
    };

    const previous = normalizeState(body.state, DEFAULT_STATE);
    const selectedActions = pickActions(previous.turn);
    const action =
      typeof body.action === "string"
        ? selectedActions.find((item) => item.label === body.action) ?? null
        : null;

    const { state, consequence, discovery } = simulate(previous, action);
    const scene = makeScene(state, action, consequence, discovery);

    const gameOver =
      state.health <= 0 ||
      state.sanity <= 0 ||
      state.hunger <= 0 ||
      state.thirst <= 0;

    return NextResponse.json({
      title: pick(TITLES, state.turn + state.floor),
      scene,
      actions: pickActions(state.turn),
      state,
      gameOver,
      deathReason: gameOver
        ? "Tes ressources sont arrivées à zéro. Le niveau continue sans toi."
        : undefined,
    });
  } catch (error) {
    console.error("Backrooms game error:", error);
    return NextResponse.json(
      { error: "Impossible de charger la prochaine scène." },
      { status: 500 },
    );
  }
}
