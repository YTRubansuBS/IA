"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type PageItem = {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  updatedBy: string;
};

type Task = {
  id: string;
  title: string;
  done: boolean;
  updatedAt: number;
  updatedBy: string;
};

type WorkspaceState = {
  pages: PageItem[];
  tasks: Task[];
  updatedAt: number;
};

const PASSWORD = "Weapons RNG";
const PASSWORD_HEADER = "x-workspace-password";

const fallbackPages: PageItem[] = [
  {
    id: "overview",
    title: "Bienvenue",
    content:
      "# Centre de projet\n\nBienvenue dans votre espace de travail partagé.\n\n## À faire\n- Organiser les prochaines étapes\n- Écrire les idées importantes\n- Répartir les tâches entre les membres\n\n## Notes\nCette page est commune à tous les utilisateurs connectés.",
    updatedAt: Date.now(),
    updatedBy: "Workspace",
  },
  {
    id: "roadmap",
    title: "Roadmap",
    content:
      "# Roadmap\n\n## Maintenant\nConstruire les fonctionnalités essentielles.\n\n## Ensuite\nAméliorer l’interface et tester.\n\n## Plus tard\nAjouter les idées validées par l’équipe.",
    updatedAt: Date.now(),
    updatedBy: "Workspace",
  },
  {
    id: "ideas",
    title: "Idées",
    content:
      "# Boîte à idées\n\nÉcrivez ici les concepts, mécaniques, visuels et améliorations à tester.\n\n> Astuce : utilisez l’assistant IA à droite pour transformer une idée courte en page complète.",
    updatedAt: Date.now(),
    updatedBy: "Workspace",
  },
];

const fallbackTasks: Task[] = [
  { id: "t1", title: "Définir la prochaine grosse fonctionnalité", done: false, updatedAt: Date.now(), updatedBy: "Workspace" },
  { id: "t2", title: "Créer une page de documentation", done: false, updatedAt: Date.now(), updatedBy: "Workspace" },
  { id: "t3", title: "Tester l’expérience sur mobile", done: false, updatedAt: Date.now(), updatedBy: "Workspace" },
];

function hydrateLocal(): WorkspaceState {
  if (typeof window === "undefined") {
    return { pages: fallbackPages, tasks: fallbackTasks, updatedAt: Date.now() };
  }
  try {
    const raw = localStorage.getItem("project-workspace-cache");
    if (raw) return JSON.parse(raw) as WorkspaceState;
  } catch {}
  return { pages: fallbackPages, tasks: fallbackTasks, updatedAt: Date.now() };
}

export default function Home() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<WorkspaceState>(hydrateLocal);
  const [selectedId, setSelectedId] = useState("overview");
  const [taskText, setTaskText] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState(
    "Je peux transformer une idée en page, proposer une structure, améliorer un texte ou trouver des tâches."
  );
  const [aiBusy, setAiBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedPage = useMemo(
    () => state.pages.find((page) => page.id === selectedId) ?? state.pages[0],
    [state.pages, selectedId]
  );

  const sync = useCallback(async () => {
    if (!unlocked) return;
    try {
      const response = await fetch("/api/workspace", {
        headers: { [PASSWORD_HEADER]: PASSWORD },
        cache: "no-store",
      });
      if (!response.ok) return;
      const next = (await response.json()) as WorkspaceState;
      setState(next);
      localStorage.setItem("project-workspace-cache", JSON.stringify(next));
      if (!next.pages.some((page) => page.id === selectedId) && next.pages[0]) {
        setSelectedId(next.pages[0].id);
      }
    } catch {}
  }, [selectedId, unlocked]);

  useEffect(() => {
    if (localStorage.getItem("project-workspace-unlocked") === "1") setUnlocked(true);
    const savedName = localStorage.getItem("project-workspace-name");
    if (savedName) setName(savedName);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    sync();
    const timer = setInterval(sync, 2500);
    return () => clearInterval(timer);
  }, [sync, unlocked]);

  const updatePage = useCallback(
    (content: string, pageId = selectedPage?.id) => {
      if (!pageId) return;
      setState((current) => ({
        ...current,
        pages: current.pages.map((page) =>
          page.id === pageId
            ? { ...page, content, updatedAt: Date.now(), updatedBy: name || "Membre" }
            : page
        ),
        updatedAt: Date.now(),
      }));

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await fetch("/api/workspace", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [PASSWORD_HEADER]: PASSWORD,
          },
          body: JSON.stringify({
            action: "updatePage",
            id: pageId,
            content,
            updatedBy: name || "Membre",
          }),
        });
        setNotice("Enregistré et partagé");
        setTimeout(() => setNotice(""), 1500);
      }, 600);
    },
    [name, selectedPage?.id]
  );

  const renamePage = async (title: string, pageId = selectedPage?.id) => {
    if (!pageId) return;
    const nextTitle = title.trim() || "Page sans titre";
    setState((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        page.id === pageId
          ? { ...page, title: nextTitle, updatedAt: Date.now(), updatedBy: name || "Membre" }
          : page
      ),
    }));
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json", [PASSWORD_HEADER]: PASSWORD },
      body: JSON.stringify({
        action: "updatePage",
        id: pageId,
        title: nextTitle,
        updatedBy: name || "Membre",
      }),
    });
  };

  const createPage = async () => {
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json", [PASSWORD_HEADER]: PASSWORD },
      body: JSON.stringify({ action: "createPage", updatedBy: name || "Membre" }),
    });
    if (!response.ok) return;
    const next = (await response.json()) as WorkspaceState;
    setState(next);
    const created = next.pages[0];
    if (created) setSelectedId(created.id);
  };

  const createPageWithAI = async () => {
    setAiBusy(true);
    try {
      const createResponse = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json", [PASSWORD_HEADER]: PASSWORD },
        body: JSON.stringify({ action: "createPage", updatedBy: name || "Membre" }),
      });
      if (!createResponse.ok) return;
      const createdState = (await createResponse.json()) as WorkspaceState;
      const created = createdState.pages[0];
      if (!created) return;
      setState(createdState);
      setSelectedId(created.id);

      const aiResponse = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", [PASSWORD_HEADER]: PASSWORD },
        body: JSON.stringify({
          prompt: "Crée une page de travail complète et très claire avec un titre, un objectif, une structure, une section À faire et une section Notes. Le contenu doit être directement copiable.",
          pageTitle: created.title,
          pageContent: "",
        }),
      });
      const data = await aiResponse.json();
      if (typeof data.reply !== "string") return;

      const generated = "# " + created.title + "\n\n" + data.reply;
      await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json", [PASSWORD_HEADER]: PASSWORD },
        body: JSON.stringify({
          action: "updatePage",
          id: created.id,
          content: generated,
          updatedBy: name || "Membre",
        }),
      });
      setState({
        ...createdState,
        pages: createdState.pages.map((item) =>
          item.id === created.id
            ? { ...item, content: generated, updatedAt: Date.now(), updatedBy: name || "Membre" }
            : item
        ),
      });
      setAiReply("Page créée avec l’aide de l’IA.");
    } finally {
      setAiBusy(false);
    }
  };

  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    const title = taskText.trim();
    if (!title) return;
    setTaskText("");
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json", [PASSWORD_HEADER]: PASSWORD },
      body: JSON.stringify({ action: "createTask", title, updatedBy: name || "Membre" }),
    });
    if (response.ok) setState((await response.json()) as WorkspaceState);
  };

  const toggleTask = async (id: string) => {
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json", [PASSWORD_HEADER]: PASSWORD },
      body: JSON.stringify({ action: "toggleTask", id, updatedBy: name || "Membre" }),
    });
    if (response.ok) setState((await response.json()) as WorkspaceState);
  };

  const askAI = async (promptOverride?: string) => {
    const prompt = (promptOverride ?? aiPrompt).trim();
    if (!prompt) return;
    setAiBusy(true);
    setAiPrompt("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", [PASSWORD_HEADER]: PASSWORD },
        body: JSON.stringify({
          prompt,
          pageTitle: selectedPage?.title ?? "",
          pageContent: selectedPage?.content ?? "",
        }),
      });
      const data = await response.json();
      setAiReply(data.reply || "Je n’ai pas réussi à générer une réponse.");
    } catch {
      setAiReply("L’assistant n’est pas disponible pour le moment.");
    } finally {
      setAiBusy(false);
    }
  };

  const login = (event: FormEvent) => {
    event.preventDefault();
    if (password !== PASSWORD) {
      setNotice("Mot de passe incorrect");
      setTimeout(() => setNotice(""), 1800);
      return;
    }
    const cleanName = name.trim() || "Membre";
    setName(cleanName);
    localStorage.setItem("project-workspace-unlocked", "1");
    localStorage.setItem("project-workspace-name", cleanName);
    setUnlocked(true);
  };

  if (!unlocked) {
    return (
      <main className="loginShell">
        <div className="loginGlow" />
        <section className="loginCard">
          <div className="brandMark">◈</div>
          <span className="kicker">ESPACE PARTAGÉ</span>
          <h1>Project Desk</h1>
          <p>Un Word/Notion simple pour construire votre projet ensemble.</p>
          <form onSubmit={login} className="loginForm">
            <label>
              Votre pseudo
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex. Alex"
                autoFocus
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mot de passe"
              />
            </label>
            <button className="primaryButton" type="submit">
              Entrer dans l’espace
            </button>
          </form>
          <div className="loginHint">Le contenu des pages et les tâches sont communs à l’équipe.</div>
          {notice && <div className="toast">{notice}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="workspaceBrand">
          <div className="brandMark small">◈</div>
          <div>
            <strong>Project Desk</strong>
            <span>espace équipe</span>
          </div>
        </div>

        <div className="sidebarSection">
          <div className="sidebarHeading">
            <span>Pages</span>
            <div className="headingActions">
              <button onClick={createPageWithAI} aria-label="Créer une page avec l’IA">✦</button>
              <button onClick={createPage} aria-label="Nouvelle page">＋</button>
            </div>
          </div>
          <div className="pageList">
            {state.pages.map((page) => (
              <button
                key={page.id}
                className={page.id === selectedPage?.id ? "pageItem active" : "pageItem"}
                onClick={() => setSelectedId(page.id)}
              >
                <span className="pageIcon">▤</span>
                <span>{page.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebarSection tasksSection">
          <div className="sidebarHeading">
            <span>Tâches</span>
            <span className="count">{state.tasks.filter((task) => !task.done).length}</span>
          </div>
          <form onSubmit={createTask} className="taskForm">
            <input
              value={taskText}
              onChange={(event) => setTaskText(event.target.value)}
              placeholder="Ajouter une tâche..."
            />
            <button type="submit">＋</button>
          </form>
          <div className="taskList">
            {state.tasks.map((task) => (
              <button
                key={task.id}
                className={task.done ? "task done" : "task"}
                onClick={() => toggleTask(task.id)}
              >
                <span className="checkbox">{task.done ? "✓" : ""}</span>
                <span>{task.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebarFooter">
          <div className="presence"><span /> {name || "Membre"} connecté</div>
          <span>Partagé · synchro automatique</span>
        </div>
      </aside>

      <section className="editorArea">
        <header className="topbar">
          <div>
            <span className="crumb">WORKSPACE / PAGES</span>
            <div className="titleRow">
              <span className="pageDocIcon">▤</span>
              <input
                className="titleInput"
                value={selectedPage?.title ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setState((current) => ({
                    ...current,
                    pages: current.pages.map((item) =>
                      item.id === selectedPage?.id ? { ...item, title: value } : item
                    ),
                  }));
                }}
                onBlur={(event) => renamePage(event.target.value)}
              />
            </div>
          </div>
          <div className="topActions">
            <span className="syncBadge"><span /> Partagé en direct</span>
            <button
              className="ghostButton"
              onClick={() => askAI("Propose 5 prochaines tâches utiles pour ce projet.")}
            >
              ✨ Idées IA
            </button>
          </div>
        </header>

        <div className="editorWrap">
          <div className="paper">
            <div className="paperMeta">
              Mis à jour par {selectedPage?.updatedBy ?? "Membre"} ·{" "}
              {selectedPage
                ? new Date(selectedPage.updatedAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </div>
            <textarea
              className="documentEditor"
              value={selectedPage?.content ?? ""}
              onChange={(event) => updatePage(event.target.value)}
              spellCheck
              aria-label="Contenu de la page"
            />
          </div>
        </div>

        <footer className="editorFooter">
          <span>Document partagé · sauvegarde automatique</span>
          {notice && <span className="saveNotice">● {notice}</span>}
        </footer>
      </section>

      <aside className="aiPanel">
        <div className="aiHeader">
          <div className="aiOrb">✦</div>
          <div>
            <strong>Assistant IA</strong>
            <span>Aide à la création</span>
          </div>
        </div>
        <div className="aiQuick">
          <button onClick={() => askAI("Transforme cette page en une structure claire avec des titres et des sous-parties.")}>
            Structurer la page
          </button>
          <button onClick={() => askAI("Donne-moi 10 idées concrètes à ajouter à cette page.")}>
            Donner des idées
          </button>
          <button onClick={() => askAI("Trouve les prochaines tâches à créer à partir de cette page.")}>
            Créer des tâches
          </button>
          <button onClick={createPageWithAI}>Créer une page avec l’IA</button>
        </div>
        <div className="aiReply">{aiBusy ? "L’assistant réfléchit…" : aiReply}</div>
        <form
          className="aiInput"
          onSubmit={(event) => {
            event.preventDefault();
            askAI();
          }}
        >
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="Ex. Fais-moi une page de roadmap propre..."
          />
          <button type="submit" disabled={aiBusy || !aiPrompt.trim()}>
            Envoyer ↗
          </button>
        </form>
        <div className="aiFoot">
          L’IA peut rédiger, reformuler, organiser et proposer des actions.
        </div>
      </aside>
    </main>
  );
}
