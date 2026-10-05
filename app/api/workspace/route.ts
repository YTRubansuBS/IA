import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PageItem = { id: string; title: string; content: string; updatedAt: number; updatedBy: string };
type Task = { id: string; title: string; done: boolean; updatedAt: number; updatedBy: string };
type WorkspaceState = { pages: PageItem[]; tasks: Task[]; updatedAt: number };

const PASSWORD = "Weapons RNG";

function getSupabase() {
  const url = process.env.URL;
  const key = process.env.KEY;
  if (!url || !key) {
    throw new Error("Missing URL or KEY environment variables");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function dbError(error: unknown) {
  console.error("[workspace]", error);
  return NextResponse.json(
    { error: "Database error", detail: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

async function readState(): Promise<WorkspaceState> {
  const supabase = getSupabase();

  const [{ data: pages, error: pageError }, { data: tasks, error: taskError }] = await Promise.all([
    supabase
      .from("workspace_pages")
      .select("id,title,content,updated_at,updated_by")
      .order("updated_at", { ascending: false }),
    supabase
      .from("workspace_tasks")
      .select("id,title,done,updated_at,updated_by")
      .order("created_at", { ascending: false }),
  ]);

  if (pageError) throw pageError;
  if (taskError) throw taskError;

  return {
    pages: (pages ?? []).map((page) => ({
      id: page.id,
      title: page.title,
      content: page.content,
      updatedAt: Number(page.updated_at),
      updatedBy: page.updated_by,
    })),
    tasks: (tasks ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      done: task.done,
      updatedAt: Number(task.updated_at),
      updatedBy: task.updated_by,
    })),
    updatedAt: Date.now(),
  };
}

async function seedIfEmpty() {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("workspace_pages")
    .select("id", { count: "exact", head: true });

  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const now = Date.now();
  const pages = [
    {
      id: "overview",
      title: "Bienvenue",
      content: "# Centre de projet\n\nBienvenue dans votre espace de travail partagé.\n\n## À faire\n- Organiser les prochaines étapes\n- Écrire les idées importantes\n- Répartir les tâches entre les membres\n\n## Notes\nCette page est commune à tous les utilisateurs connectés.",
      updated_at: now,
      updated_by: "Workspace",
    },
    {
      id: "roadmap",
      title: "Roadmap",
      content: "# Roadmap\n\n## Maintenant\nConstruire les fonctionnalités essentielles.\n\n## Ensuite\nAméliorer l’interface et tester.\n\n## Plus tard\nAjouter les idées validées par l’équipe.",
      updated_at: now,
      updated_by: "Workspace",
    },
    {
      id: "ideas",
      title: "Idées",
      content: "# Boîte à idées\n\nÉcrivez ici les concepts, mécaniques, visuels et améliorations à tester.\n\n> Astuce : utilisez l’assistant IA à droite pour transformer une idée courte en page complète.",
      updated_at: now,
      updated_by: "Workspace",
    },
  ];

  const tasks = [
    { id: "t1", title: "Définir la prochaine grosse fonctionnalité", done: false, updated_at: now, updated_by: "Workspace" },
    { id: "t2", title: "Créer une page de documentation", done: false, updated_at: now, updated_by: "Workspace" },
    { id: "t3", title: "Tester l’expérience sur mobile", done: false, updated_at: now, updated_by: "Workspace" },
  ];

  const [pageInsert, taskInsert] = await Promise.all([
    supabase.from("workspace_pages").insert(pages),
    supabase.from("workspace_tasks").insert(tasks),
  ]);

  if (pageInsert.error) throw pageInsert.error;
  if (taskInsert.error) throw taskInsert.error;
}

export async function GET(request: Request) {
  if (request.headers.get("x-workspace-password") !== PASSWORD) return unauthorized();

  try {
    await seedIfEmpty();
    const state = await readState();
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dbError(error);
  }
}

export async function POST(request: Request) {
  if (request.headers.get("x-workspace-password") !== PASSWORD) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const supabase = getSupabase();
    const updatedBy =
      typeof body.updatedBy === "string" && body.updatedBy.trim()
        ? body.updatedBy.trim().slice(0, 40)
        : "Membre";
    const now = Date.now();

    if (body.action === "createPage") {
      const id = "page-" + now + "-" + Math.random().toString(36).slice(2, 8);
      const { error } = await supabase.from("workspace_pages").insert({
        id,
        title: "Nouvelle page",
        content: "# Nouvelle page\n\nCommencez à écrire ici…",
        updated_at: now,
        updated_by: updatedBy,
      });
      if (error) throw error;
    }

    if (body.action === "updatePage") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return NextResponse.json({ error: "Page id required" }, { status: 400 });

      const patch: Record<string, string | number> = {
        updated_at: now,
        updated_by: updatedBy,
      };

      if (typeof body.title === "string") {
        patch.title = body.title.trim().slice(0, 120) || "Page sans titre";
      }
      if (typeof body.content === "string") {
        patch.content = body.content.slice(0, 50000);
      }

      const { error } = await supabase.from("workspace_pages").update(patch).eq("id", id);
      if (error) throw error;
    }

    if (body.action === "deletePage") {
      const { count, error: countError } = await supabase
        .from("workspace_pages")
        .select("id", { count: "exact", head: true });
      if (countError) throw countError;
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: "Keep at least one page" }, { status: 400 });
      }

      const { error } = await supabase
        .from("workspace_pages")
        .delete()
        .eq("id", body.id);
      if (error) throw error;
    }

    if (body.action === "createTask") {
      const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
      if (!title) return NextResponse.json({ error: "Task title required" }, { status: 400 });

      const { error } = await supabase.from("workspace_tasks").insert({
        id: "task-" + now + "-" + Math.random().toString(36).slice(2, 8),
        title,
        done: false,
        updated_at: now,
        updated_by: updatedBy,
      });
      if (error) throw error;
    }

    if (body.action === "toggleTask") {
      const id = typeof body.id === "string" ? body.id : "";
      const { data: task, error: readError } = await supabase
        .from("workspace_tasks")
        .select("done")
        .eq("id", id)
        .maybeSingle();
      if (readError) throw readError;
      if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

      const { error } = await supabase
        .from("workspace_tasks")
        .update({
          done: !task.done,
          updated_at: now,
          updated_by: updatedBy,
        })
        .eq("id", id);
      if (error) throw error;
    }

    await seedIfEmpty();
    return NextResponse.json(await readState(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dbError(error);
  }
}
