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

    
const ACTION_POOL: Action[] = [{"id":"1","label":"Suivre le couloir éclairé","description":"Avancer lentement vers les néons qui semblent moins instables."},{"id":"2","label":"Prendre le couloir sombre","description":"S’éloigner de la lumière et avancer là où le bruit semble venir."},{"id":"3","label":"Longer le mur gauche","description":"Garder la main contre le mur pour ne pas perdre ses repères."},{"id":"4","label":"Longer le mur droit","description":"Suivre le mur opposé et mémoriser chaque angle."},{"id":"5","label":"Compter les portes","description":"Avancer en comptant les portes pour vérifier si le couloir boucle."},{"id":"6","label":"Observer le plafond","description":"Chercher des fissures, des trappes ou une différence dans les plafonds."},{"id":"7","label":"Écouter les néons","description":"Rester immobile quelques secondes pour distinguer un autre bruit."},{"id":"8","label":"Courir jusqu’au prochain angle","description":"Prendre de la distance rapidement avant de reprendre son souffle."},{"id":"9","label":"Marcher très lentement","description":"Réduire le bruit de ses pas et rester attentif."},{"id":"10","label":"Retourner sur ses pas","description":"Revenir vers le dernier croisement pour vérifier un détail oublié."},{"id":"11","label":"Tester une poignée","description":"Essayer doucement d’ouvrir une porte proche."},{"id":"12","label":"Regarder sous une porte","description":"Chercher une lumière ou un mouvement de l’autre côté."},{"id":"13","label":"Frapper trois fois","description":"Attendre une éventuelle réponse avant d’entrer."},{"id":"14","label":"Ouvrir une porte entrouverte","description":"Pousser lentement la porte et observer l’intérieur."},{"id":"15","label":"Bloquer une porte","description":"Placer un objet devant une porte pour créer un repère."},{"id":"16","label":"Noter un symbole au mur","description":"Laisser une petite marque pour reconnaître le passage."},{"id":"17","label":"Suivre une flaque","description":"Regarder d’où vient l’humidité et où elle mène."},{"id":"18","label":"Inspecter une moquette différente","description":"Examiner une zone où le sol ne ressemble plus au reste."},{"id":"19","label":"Toucher le mur","description":"Vérifier si une partie du mur semble creuse ou anormalement chaude."},{"id":"20","label":"Examiner une ampoule","description":"Observer une ampoule qui clignote de façon inhabituelle."},{"id":"21","label":"Se cacher derrière un meuble","description":"Rester silencieux et attendre que les bruits s’éloignent."},{"id":"22","label":"Éteindre son téléphone","description":"Économiser la batterie et continuer dans le silence."},{"id":"23","label":"Utiliser la lampe du téléphone","description":"Éclairer un passage trop sombre pour y voir correctement."},{"id":"24","label":"Prendre une photo du couloir","description":"Capturer le décor pour comparer les photos plus tard."},{"id":"25","label":"Enregistrer les sons","description":"Lancer un enregistrement pour vérifier les bruits entendus."},{"id":"26","label":"Regarder l’heure","description":"Comparer l’heure avec ses précédentes observations."},{"id":"27","label":"Vérifier la batterie","description":"Calculer combien de temps le téléphone peut encore aider."},{"id":"28","label":"Chercher de l’eau","description":"Fouiller les coins susceptibles de contenir une bouteille."},{"id":"29","label":"Chercher de la nourriture","description":"Inspecter les placards, bureaux ou petites pièces."},{"id":"30","label":"Fouiller un bureau","description":"Ouvrir les tiroirs à la recherche d’objets utiles."},{"id":"31","label":"Fouiller un casier","description":"Inspecter un vieux casier métallique."},{"id":"32","label":"Regarder derrière les tableaux","description":"Vérifier si un passage ou un objet est caché derrière."},{"id":"33","label":"Soulever un morceau de moquette","description":"Chercher une trappe ou un défaut dans le sol."},{"id":"34","label":"Examiner une grille","description":"Vérifier si une grille d’aération peut mener quelque part."},{"id":"35","label":"Suivre le courant d’air","description":"Marcher vers l’endroit où l’air semble circuler."},{"id":"36","label":"Chercher une température différente","description":"Repérer une pièce légèrement plus froide ou plus chaude."},{"id":"37","label":"S’asseoir quelques secondes","description":"Récupérer son calme avant de reprendre l’exploration."},{"id":"38","label":"Faire quelques étirements","description":"Réduire la fatigue avant une longue marche."},{"id":"39","label":"Boire une réserve","description":"Consommer une boisson trouvée pour récupérer un peu."},{"id":"40","label":"Manger une petite réserve","description":"Garder une partie de la nourriture pour plus tard."},{"id":"41","label":"Partager sa nourriture avec quelqu’un","description":"Prendre le risque de faire confiance à une silhouette."},{"id":"42","label":"Appeler dans le couloir","description":"Lancer un appel pour savoir si quelqu’un est proche."},{"id":"43","label":"Suivre une voix","description":"Avancer vers une voix lointaine sans savoir qui parle."},{"id":"44","label":"Éviter la voix","description":"Changer de direction pour rester seul."},{"id":"45","label":"Suivre des traces au sol","description":"Observer de petites traces et voir où elles mènent."},{"id":"46","label":"Comparer deux chemins","description":"Étudier les deux directions avant de choisir."},{"id":"47","label":"Choisir l’escalier","description":"Descendre l’escalier vers un niveau inconnu."},{"id":"48","label":"Remonter l’escalier","description":"Monter pour chercher un autre environnement."},{"id":"49","label":"Attendre devant l’ascenseur","description":"Observer les portes et écouter derrière."},{"id":"50","label":"Appuyer sur un bouton","description":"Tester si l’ascenseur fonctionne encore."},{"id":"51","label":"Entrer dans l’ascenseur","description":"Monter ou descendre sans savoir quel étage attend."},{"id":"52","label":"Chercher une trappe","description":"Examiner le plafond d’une petite pièce."},{"id":"53","label":"Passer sous une barrière","description":"Se glisser dans une zone normalement inaccessible."},{"id":"54","label":"Enjamber un obstacle","description":"Continuer malgré un passage encombré."},{"id":"55","label":"Ramper dans un passage étroit","description":"Explorer un tunnel que personne n’a l’air d’utiliser."},{"id":"56","label":"Rebrousser chemin au passage étroit","description":"Refuser de s’engager dans un espace trop confiné."},{"id":"57","label":"Tester le sol","description":"Avancer en vérifiant chaque dalle devant soi."},{"id":"58","label":"Sauter par-dessus une zone humide","description":"Éviter le sol détrempé."},{"id":"59","label":"Traverser la zone humide","description":"Avancer directement malgré le sol glissant."},{"id":"60","label":"Suivre les néons jaunes","description":"Choisir la direction où la lumière paraît régulière."},{"id":"61","label":"Suivre les néons blancs","description":"Changer de zone pour une lumière plus froide."},{"id":"62","label":"Chercher un bruit de ventilation","description":"Suivre le bourdonnement d’une machine."},{"id":"63","label":"Chercher une machine","description":"Explorer une pièce qui semble abriter un générateur."},{"id":"64","label":"Observer une horloge","description":"Vérifier si son fonctionnement paraît normal."},{"id":"65","label":"Suivre les tuyaux","description":"Repérer la direction d’un réseau de conduites."},{"id":"66","label":"Examiner une caméra","description":"Vérifier si une caméra semble encore fonctionner."},{"id":"67","label":"Faire un signe à une caméra","description":"Tester si quelque chose réagit à sa présence."},{"id":"68","label":"Écrire un message sur le mur","description":"Laisser une information pour un éventuel autre survivant."},{"id":"69","label":"Chercher un autre message","description":"Suivre les inscriptions laissées par quelqu’un d’autre."},{"id":"70","label":"Effacer une marque","description":"Retirer un repère qui pourrait attirer l’attention."},{"id":"71","label":"Créer un faux chemin","description":"Poser volontairement un objet dans une autre direction."},{"id":"72","label":"Cacher un objet","description":"Déposer une réserve à un endroit reconnaissable."},{"id":"73","label":"Changer de chaussures","description":"Utiliser une paire trouvée si elle paraît plus adaptée."},{"id":"74","label":"Examiner ses vêtements","description":"Vérifier s’ils ont changé depuis son arrivée."},{"id":"75","label":"Regarder son reflet","description":"Observer un miroir pour détecter quelque chose d’étrange."},{"id":"76","label":"Éviter les miroirs","description":"Choisir de ne pas regarder les surfaces réfléchissantes."},{"id":"77","label":"Entrer dans une pièce vide","description":"Explorer une salle sans meuble ni bruit."},{"id":"78","label":"Entrer dans une salle meublée","description":"Fouiller une pièce qui semble avoir été utilisée."},{"id":"79","label":"Fermer une porte derrière soi","description":"Limiter les bruits venant du couloir."},{"id":"80","label":"Laisser la porte ouverte","description":"Garder une sortie visible pour pouvoir revenir."},{"id":"81","label":"Attendre que les néons s’arrêtent","description":"Profiter d’un instant de noir complet pour écouter."},{"id":"82","label":"Avancer pendant le clignotement","description":"Profiter des changements de lumière pour progresser."},{"id":"83","label":"Suivre une odeur de propre","description":"Chercher l’origine d’une odeur inhabituelle."},{"id":"84","label":"Suivre une odeur humide","description":"Explorer un secteur qui semble proche d’une fuite."},{"id":"85","label":"Chercher une fenêtre","description":"Vérifier si une ouverture donne réellement sur l’extérieur."},{"id":"86","label":"Toucher une fenêtre","description":"Observer si le verre est froid ou anormalement chaud."},{"id":"87","label":"Chercher une sortie de secours","description":"Inspecter les murs pour un panneau ou une porte."},{"id":"88","label":"Suivre un panneau","description":"Prendre au sérieux une flèche qui semble indiquer une direction."},{"id":"89","label":"Ignorer un panneau","description":"Considérer le panneau comme un piège et continuer ailleurs."},{"id":"90","label":"Retourner dans une zone connue","description":"Revenir dans un endroit où les repères sont plus fiables."},{"id":"91","label":"Choisir une direction au hasard","description":"Prendre un chemin sans chercher de logique."},{"id":"92","label":"Faire pile ou face","description":"Laisser le hasard décider entre deux couloirs."},{"id":"93","label":"Marquer chaque virage","description":"Créer un système de repères pour éviter une boucle."},{"id":"94","label":"Tester si le couloir boucle","description":"Repasser volontairement par les mêmes endroits."},{"id":"95","label":"Chercher une zone calme","description":"Trouver un endroit pour souffler et observer."},{"id":"96","label":"Chercher une zone bruyante","description":"Explorer un secteur où quelque chose semble fonctionner."},{"id":"97","label":"Suivre une lumière rouge","description":"Se diriger vers une faible lumière colorée."},{"id":"98","label":"Suivre une lumière bleue","description":"Explorer un passage éclairé d’une couleur inhabituelle."},{"id":"99","label":"Attendre derrière un angle","description":"Observer le passage avant de décider."},{"id":"100","label":"Avancer malgré la peur","description":"Continuer tout droit sans se laisser distraire par les bruits."}];

function pickActions(turn: number): Action[] {
  const count = ACTION_POOL.length;
  const start = (turn * 17) % count;
  const result: Action[] = [];

  for (let offset = 0; result.length < 4 && offset < count * 2; offset += 1) {
    const index = (start + offset * 23 + turn * 7) % count;
    const action = ACTION_POOL[index];
    if (!result.some((item) => item.id === action.id)) {
      result.push(action);
    }
  }

  return result;
}

    const variationKey = Math.random().toString(36).slice(2, 10);
    const ai = new GoogleGenAI({ apiKey });

    const selectedActions = pickActions(previous.turn);\n\n    const prompt = [
      "Crée la prochaine scène d'un jeu de survie narratif fictif dans les Backrooms.",
      "Le jeu est sans fin : il doit pouvoir continuer pendant énormément de tours.",
      "Le joueur choisit une action parmi les quatre choix fournis ci-dessous, puis tu racontes les conséquences.",
      "Écris en français naturel, immersif et très varié.",
      "Fais une scène riche avec plusieurs paragraphes et beaucoup de phrases concrètes : sons, lumières, odeurs, architecture, sensation de distance, indices, objets et changements subtils.",
      "Ne recycle pas mot pour mot les phrases, titres, événements ou actions présents dans l'historique fourni.",
      "Ne révèle jamais que tu es une IA et ne parle jamais de génération, de prompt ou de modèle.",
      "Le ton doit être mystérieux, oppressant et aventureux, sans détails graphiques.",
      "Les actions doivent avoir de vraies conséquences sur la santé, la lucidité, la faim, la soif, l'étage et l'inventaire.",
      "Une action peut être bénéfique, neutre ou risquée. Il ne faut pas toujours punir le joueur.",
      "Ajoute parfois des événements rares : raccourci, anomalie du décor, faux espoir, objet utile, zone calme, bruit lointain, changement de niveau ou rencontre ambiguë.",
      "Les sorties ne sont jamais garanties. Le jeu peut durer très longtemps.",
      "Retourne UNIQUEMENT un objet JSON valide avec exactement ces champs : title, scene, actions, state, gameOver, deathReason.",\n      "Recopie exactement les quatre actions fournies. Ne les reformule pas et n’en invente aucune.",
      "actions doit contenir exactement 4 choix, chacun avec id, label et description.",
      "state doit contenir health, sanity, hunger, thirst, floor, turn et inventory.",
      "Si une statistique tombe à 0 ou moins, gameOver doit être true.",
      "Ne fais pas mourir le joueur juste parce qu'il choisit une action normale ; la partie doit pouvoir durer.",
      "Chaque nouvelle scène doit généralement faire au moins 160 mots.",
      "Clé de variété interne : " + variationKey,
      "",
      "CHOIX DISPONIBLES POUR CE TOUR :",\n      JSON.stringify(selectedActions),\n      "",\n      "ÉTAT ACTUEL :",
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
    const actions = selectedActions;\n\n    /* Les actions sont préparées dans le code pour garantir 100 choix distincts. */\n    const generatedActions = Array.isArray(generated.actions)
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
