import { NextResponse } from "next/server";

type PageItem = { id: string; title: string; content: string; updatedAt: number; updatedBy: string };
type Task = { id: string; title: string; done: boolean; updatedAt: number; updatedBy: string };
type WorkspaceState = { pages: PageItem[]; tasks: Task[]; updatedAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __projectWorkspaceState: WorkspaceState | undefined;
}

const PASSWORD = "Weapons RNG";

function getState(): WorkspaceState {
  if (!globalThis.__projectWorkspaceState) {
    const now = Date.now();
    globalThis.__projectWorkspaceState = {
      pages: [
        {
          id: "overview",
          title: "Bienvenue",
          content: "# Centre de projet\n\nBienvenue dans votre espace de travail partagé.\n\n## À faire\n- Organiser les prochaines étapes\n- Écrire les idées importantes\n- Répartir les tâches entre les membres\n\n## Notes\nCette page est commune à tous les utilisateurs connectés.",
          updatedAt: now,
          updatedBy: "Workspace",
        },
        {
          id: "roadmap",
          title: "Roadmap",
          content: "# Roadmap\n\n## Maintenant\nConstruire les fonctionnalités essentielles.\n\n## Ensuite\nAméliorer l’interface et tester.\n\n## Plus tard\nAjouter les idées validées par l’équipe.",
          updatedAt: now,
          updatedBy: "Workspace",
        },
        {
          id: "ideas",
          title: "Idées",
          content: "# Boîte à idées\n\nÉcrivez ici les concepts, mécaniques, visuels et améliorations à tester.\n\n> Astuce : utilisez l’assistant IA à droite pour transformer une idée courte en page complète.",
          updatedAt: now,
          updatedBy: "Workspace",
        },
      ],
      tasks: [
        { id: "t1", title: "Définir la prochaine grosse fonctionnalité", done: false, updatedAt: now, updatedBy: "Workspace" },
        { id: "t2", title: "Créer une page de documentation", done: false, updatedAt: now, updatedBy: "Workspace" },
        { id: "t3", title: "Tester l’expérience sur mobile", done: false, updatedAt: now, updatedBy: "Workspace" },
      ],
      updatedAt: now,
    };
  }
  return globalThis.__projectWorkspaceState;
}

function authorized(request: Request) {
  return request.headers.get("x-workspace-password") === PASSWORD;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getState(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const state = getState();
  const updatedBy =
    typeof body.updatedBy === "string" && body.updatedBy.trim()
      ? body.updatedBy.trim().slice(0, 40)
      : "Membre";
  const now = Date.now();

  if (body.action === "createPage") {
    const id = "page-" + now + "-" + Math.random().toString(36).slice(2, 7);
    state.pages.unshift({
      id,
      title: "Nouvelle page",
      content: "# Nouvelle page\n\nCommencez à écrire ici…",
      updatedAt: now,
      updatedBy,
    });
  }

  if (body.action === "updatePage") {
    const page = state.pages.find((item) => item.id === body.id);
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    if (typeof body.title === "string") {
      page.title = body.title.trim().slice(0, 120) || "Page sans titre";
    }
    if (typeof body.content === "string") page.content = body.content.slice(0, 50000);
    page.updatedAt = now;
    page.updatedBy = updatedBy;
  }

  if (body.action === "deletePage") {
    if (state.pages.length <= 1) return NextResponse.json({ error: "Keep at least one page" }, { status: 400 });
    state.pages = state.pages.filter((item) => item.id !== body.id);
  }

  if (body.action === "createTask") {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    if (!title) return NextResponse.json({ error: "Task title required" }, { status: 400 });
    state.tasks.unshift({
      id: "task-" + now + "-" + Math.random().toString(36).slice(2, 7),
      title,
      done: false,
      updatedAt: now,
      updatedBy,
    });
  }

  if (body.action === "toggleTask") {
    const task = state.tasks.find((item) => item.id === body.id);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    task.done = !task.done;
    task.updatedAt = now;
    task.updatedBy = updatedBy;
  }

  state.updatedAt = now;
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
