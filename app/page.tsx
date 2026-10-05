"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const ACCOUNTS_KEY = "script-ai-accounts-v3";
const APP_QUOTA_KEY = "script-ai-app-quota-v1";
const APP_DAILY_QUOTA = 25;
const SESSION_KEY = "script-ai-session-v3";
const DRAFT_KEY = "script-ai-draft-v3:";
const CHATS_KEY = "script-ai-chats-v3:";

type Account = { username: string; passwordHash: string; createdAt: number };
type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
};
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  code?: string;
  explanation?: string;
  time: number;
};

const starter = [
  'local Players = game:GetService("Players")',
  "",
  "Players.PlayerAdded:Connect(function(player)",
  '    print("Bienvenue " .. player.Name)',
  "end)",
].join("\n");

async function hash(value: string) {
  const data = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getChats(user: string): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY + user);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChats(user: string, chats: Chat[]) {
  localStorage.setItem(CHATS_KEY + user, JSON.stringify(chats.slice(0, 30)));
}

function getDailyQuotaUsed() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(APP_QUOTA_KEY);
    const value = raw ? JSON.parse(raw) : null;
    if (value?.date !== today) {
      localStorage.setItem(APP_QUOTA_KEY, JSON.stringify({ date: today, used: 0 }));
      return 0;
    }
    return typeof value?.used === "number" ? Math.max(0, value.used) : 0;
  } catch {
    return 0;
  }
}

function setDailyQuotaUsed(used: number) {
  const date = new Date().toISOString().slice(0, 10);
  localStorage.setItem(APP_QUOTA_KEY, JSON.stringify({ date, used }));
}

export default function Home() {
  const [ready, setReady] = useState(false);

  const [authMode, setAuthMode] = useState<"login" | "create">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [quotaUsed, setQuotaUsed] = useState(0);
  const [latestTokens, setLatestTokens] = useState<number | null>(null);
  const [accountTotal, setAccountTotal] = useState(0);
  const [currentUser, setCurrentUser] = useState("");

  const [script, setScript] = useState(starter);
  const [prompt, setPrompt] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [chats, activeChatId]
  );

  const messageCount = activeChat?.messages.length ?? 0;

  useEffect(() => {
    const list = getAccounts();
    const session = localStorage.getItem(SESSION_KEY) || "";
    setAccountTotal(list.length);

    if (session && list.some((account) => account.username === session)) {
      setUsername(session);
    }

    setQuotaUsed(getDailyQuotaUsed());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(DRAFT_KEY + currentUser, JSON.stringify({ script }));
    saveChats(currentUser, chats);
  }, [currentUser, script, chats]);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const startChat = () => {
    const chat: Chat = {
      id: crypto.randomUUID(),
      title: "Nouvelle conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };

    const next = [chat, ...chats];
    setChats(next);
    setActiveChatId(chat.id);
    setPrompt("");
    flash("Nouveau chat.");
  };

  const updateActiveChat = (updater: (chat: Chat) => Chat) => {
    setChats((current) =>
      current.map((chat) => (chat.id === activeChatId ? updater(chat) : chat))
    );
  };

  const verifyAccess = async () => {
    setAuthError("");

    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: accessPassword }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setAuthError(data?.error || "Code d'accès incorrect.");
        return false;
      }

      setAccessPassword("");
      return true;
    } catch {
      setAuthError("Impossible de vérifier le code d'accès.");
      return false;
    }
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");

    if (!(await verifyAccess())) return;

    const found = getAccounts().find(
      (account) => account.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!found) {
      setAuthError("Ce compte n’existe pas sur cet appareil.");
      return;
    }

    if ((await hash(password)) !== found.passwordHash) {
      setAuthError("Mot de passe incorrect.");
      return;
    }

    localStorage.setItem(SESSION_KEY, found.username);
    setCurrentUser(found.username);

    const savedChats = getChats(found.username);
    setChats(savedChats);
    setActiveChatId(savedChats[0]?.id || "");

    try {
      const raw = localStorage.getItem(DRAFT_KEY + found.username);
      const draft = raw ? JSON.parse(raw) : null;
      setScript(draft?.script || starter);
    } catch {
      setScript(starter);
    }

    setPassword("");
  };

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");

    if (!(await verifyAccess())) return;

    const name = username.trim();
    if (name.length < 3) {
      setAuthError("Le pseudo doit contenir au moins 3 caractères.");
      return;
    }
    if (password.length < 4) {
      setAuthError("Le mot de passe doit contenir au moins 4 caractères.");
      return;
    }
    if (password !== password2) {
      setAuthError("Les mots de passe ne correspondent pas.");
      return;
    }

    const existing = getAccounts();
    if (existing.some((account) => account.username.toLowerCase() === name.toLowerCase())) {
      setAuthError("Ce pseudo existe déjà sur cet appareil.");
      return;
    }

    const next = existing.concat({
      username: name,
      passwordHash: await hash(password),
      createdAt: Date.now(),
    });

    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
    localStorage.setItem(SESSION_KEY, name);

    setAccountTotal(next.length);
    setCurrentUser(name);
    setChats([]);
    setActiveChatId("");
    setScript(starter);
    setPrompt("");
    setPassword("");
    setPassword2("");
  };

  const logout = () => {
    void fetch("/api/access", { method: "DELETE" });
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser("");
    setChats([]);
    setActiveChatId("");
  };

  const deleteAccount = () => {
    if (!currentUser) return;

    const remaining = getAccounts().filter(
      (account) => account.username !== currentUser
    );

    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(remaining));
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(DRAFT_KEY + currentUser);
    localStorage.removeItem(CHATS_KEY + currentUser);
    void fetch("/api/access", { method: "DELETE" });

    setAccountTotal(remaining.length);
    setCurrentUser("");
    setChats([]);
    setActiveChatId("");
  };

  const sendPrompt = async () => {
    const cleanPrompt = prompt.trim();

    if (!cleanPrompt) {
      flash("Écris une demande.");
      return;
    }

    if (!script.trim()) {
      flash("Ajoute ton script avant de demander une modification.");
      setCodeOpen(true);
      return;
    }

    const used = getDailyQuotaUsed();
    if (used >= APP_DAILY_QUOTA) {
      setQuotaUsed(used);
      flash("Quota de protection atteint pour aujourd'hui.");
      return;
    }

    const nextQuota = used + 1;
    setDailyQuotaUsed(nextQuota);
    setQuotaUsed(nextQuota);

    if (!activeChatId) {
      const chat: Chat = {
        id: crypto.randomUUID(),
        title: cleanPrompt.slice(0, 42),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      };
      setChats([chat, ...chats]);
      setActiveChatId(chat.id);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanPrompt,
      time: Date.now(),
    };

    const targetChat = activeChat ?? {
      id: activeChatId,
      title: cleanPrompt.slice(0, 42),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };

    const withUser = {
      ...targetChat,
      title:
        targetChat.title === "Nouvelle conversation"
          ? cleanPrompt.slice(0, 42)
          : targetChat.title,
      updatedAt: Date.now(),
      messages: targetChat.messages.concat(userMessage),
    };

    setChats((current) => {
      const exists = current.some((chat) => chat.id === withUser.id);
      return exists
        ? current.map((chat) => (chat.id === withUser.id ? withUser : chat))
        : [withUser, ...current];
    });

    setPrompt("");
    setBusy(true);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: cleanPrompt,
          source: script,
          scriptName: "Script Luau",
        }),
      });

      const data = await response.json();

      if (typeof data?.usage?.totalTokens === "number") {
        setLatestTokens(data.usage.totalTokens);
      }

      if (!response.ok) {
        const errorText = [data.error, data.detail]
          .filter(Boolean)
          .join(" — ");

        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorText || "Gemini a renvoyé une erreur.",
          time: Date.now(),
        };

        setChats((current) =>
          current.map((chat) =>
            chat.id === withUser.id
              ? { ...withUser, updatedAt: Date.now(), messages: withUser.messages.concat(errorMessage) }
              : chat
          )
        );

        return;
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Voici la version modifiée de ton script.",
        code: typeof data.code === "string" ? data.code : "",
        explanation:
          typeof data.explanation === "string"
            ? data.explanation
            : "Modification générée par Gemini.",
        time: Date.now(),
      };

      setChats((current) =>
        current.map((chat) =>
          chat.id === withUser.id
            ? {
                ...withUser,
                updatedAt: Date.now(),
                messages: withUser.messages.concat(assistantMessage),
              }
            : chat
        )
      );

      flash("Gemini a répondu.");
    } catch (error) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          error instanceof Error ? error.message : "Erreur de connexion à Gemini.",
        time: Date.now(),
      };

      setChats((current) =>
        current.map((chat) =>
          chat.id === withUser.id
            ? { ...withUser, updatedAt: Date.now(), messages: withUser.messages.concat(errorMessage) }
            : chat
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const applyCode = (code?: string) => {
    if (!code) return;
    setScript(code);
    setCodeOpen(true);
    flash("Le code de Gemini est maintenant dans ton script.");
  };

  const copyCode = async (code?: string) => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    flash("Code copié.");
  };

  if (!ready) {
    return <main className="boot"><div>✦</div></main>;
  }

  if (!currentUser) {
    return (
      <main className="authScreen">
        <div className="authGlow glowOne" />
        <div className="authGlow glowTwo" />

        <section className="authLayout">
          <div className="authIntro">
            <div className="brandIcon">✦</div>
            <div className="eyebrow">SCRIPT AI</div>
            <h1>Ton assistant<br /><span>pour coder.</span></h1>
            <p>
              Une interface inspirée de ChatGPT, conçue pour travailler avec tes
              scripts Luau : tu donnes le code et tu expliques ce que tu veux changer.
            </p>

            <div className="introStats">
              <span><b>01</b> Analyse</span>
              <span><b>02</b> Modification</span>
              <span><b>03</b> Code complet</span>
            </div>
          </div>

          <section className="authCard">
            <div className="accessBanner">
              <div><strong>Accès privé</strong><span>Entre le code requis à chaque connexion ou création.</span></div>
              <b>Fourchette</b>
            </div>

            <div className="tabs">
              <button className={authMode === "login" ? "tab active" : "tab"} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Connexion</button>
              <button className={authMode === "create" ? "tab active" : "tab"} onClick={() => { setAuthMode("create"); setAuthError(""); }}>Créer un compte</button>
            </div>

            <div className="authCopy">
              <span>{authMode === "login" ? "BON RETOUR" : "NOUVEAU COMPTE"}</span>
              <h2>{authMode === "login" ? "Ouvre ton espace." : "Crée ton espace local."}</h2>
              <p>Ton compte, ton brouillon et ton historique restent dans ce navigateur.</p>
            </div>

            <form className="authForm" onSubmit={authMode === "login" ? login : createAccount}>
              <label>Code d’accès<input type="password" value={accessPassword} onChange={(e) => setAccessPassword(e.target.value)} placeholder="Code d’accès" autoComplete="off" autoFocus /></label>
              <label>Pseudo<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ex. Ruben" autoComplete="username" /></label>
              <label>Mot de passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={authMode === "login" ? "current-password" : "new-password"} /></label>
              {authMode === "create" && <label>Confirmer<input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••" autoComplete="new-password" /></label>}
              <button className="authSubmit" type="submit">{authMode === "login" ? "Continuer →" : "Créer mon compte →"}</button>
            </form>

            {authError && <div className="authError">{authError}</div>}
            <div className="localInfo"><span>●</span>{accountTotal} compte{accountTotal > 1 ? "s" : ""} local{accountTotal > 1 ? "aux" : ""}</div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="chatApp">
      <aside className="sidebar">
        <div className="sideTop">
          <div className="sideBrand"><div className="miniLogo">✦</div><strong>Script AI</strong></div>
          <button className="newChat" onClick={startChat}><span>＋</span> Nouveau chat</button>
        </div>

        <div className="sideSectionLabel">Conversations</div>
        <div className="chatList">
          {chats.length === 0 ? (
            <div className="noChats">Aucune conversation</div>
          ) : chats.map((chat) => (
            <button
              key={chat.id}
              className={chat.id === activeChatId ? "chatItem active" : "chatItem"}
              onClick={() => setActiveChatId(chat.id)}
            >
              <span>◌</span>
              <span>{chat.title}</span>
            </button>
          ))}
        </div>

        <div className="sideBottom">
          <div className="sideProfile">
            <div className="avatar">{currentUser[0]?.toUpperCase()}</div>
            <div><strong>{currentUser}</strong><span>Compte local</span></div>
          </div>
          <button onClick={logout}>↪ Déconnexion</button>
        </div>
      </aside>

      <section className="chatMain">
        <header className="chatHeader">
          <div className="modelName">
            <div className="modelDot">✦</div>
            <div><strong>Script AI</strong><span>Assistant Luau</span></div>
          </div>
          <div className="headerRight">
            <div className="quotaPill"><i /> Quota app&nbsp;: <b>{Math.max(0, APP_DAILY_QUOTA - quotaUsed)}</b>/{APP_DAILY_QUOTA}</div>
            <div className="headerPill"><i /> Gemini{latestTokens !== null ? " · " + latestTokens.toLocaleString("fr-FR") + " tok." : ""}</div>
          </div>
        </header>

        <div className="messages">
          {!activeChat || activeChat.messages.length === 0 ? (
            <div className="welcome">
              <div className="welcomeIcon">✦</div>
              <h1>Comment puis-je t’aider ?</h1>
              <p>Donne-moi ton script et explique ce que tu veux modifier.</p>

              <div className="suggestions">
                <button onClick={() => { setCodeOpen(true); setPrompt("Corrige les erreurs de ce script sans supprimer ses fonctionnalités."); }}>
                  <strong>Corriger un script</strong><span>Détecter et réparer les erreurs Luau.</span>
                </button>
                <button onClick={() => { setCodeOpen(true); setPrompt("Ajoute la fonctionnalité que je vais décrire en gardant le reste du script."); }}>
                  <strong>Ajouter une fonction</strong><span>Faire évoluer ton code existant.</span>
                </button>
                <button onClick={() => { setCodeOpen(true); setPrompt("Optimise ce script sans changer son comportement."); }}>
                  <strong>Optimiser</strong><span>Améliorer la structure du code.</span>
                </button>
                <button onClick={() => { setCodeOpen(true); setPrompt("Explique ce script puis propose une version plus propre."); }}>
                  <strong>Comprendre le code</strong><span>Analyser puis proposer une meilleure version.</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="conversation">
              {activeChat.messages.map((message) => (
                <article key={message.id} className={message.role === "user" ? "message user" : "message assistant"}>
                  <div className="messageAvatar">{message.role === "user" ? currentUser[0]?.toUpperCase() : "✦"}</div>
                  <div className="messageBody">
                    <div className="messageName">{message.role === "user" ? currentUser : "Script AI"}</div>
                    <div className="messageText">{message.content}</div>

                    {message.code && (
                      <div className="codeResponse">
                        <div className="codeResponseHead"><span>Luau</span><button onClick={() => copyCode(message.code)}>Copier</button></div>
                        <pre>{message.code}</pre>
                        <div className="codeResponseActions">
                          <button onClick={() => applyCode(message.code)}>✓ Utiliser ce code</button>
                        </div>
                        {message.explanation && <div className="summary"><span>Résumé</span><p>{message.explanation}</p></div>}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {busy && (
                <article className="message assistant">
                  <div className="messageAvatar">✦</div>
                  <div className="messageBody">
                    <div className="messageName">Script AI</div>
                    <div className="typing"><span /><span /><span /></div>
                  </div>
                </article>
              )}
            </div>
          )}
        </div>

        <div className="composerArea">
          {codeOpen && (
            <div className="scriptDrawer">
              <div className="drawerHead">
                <div><strong>Script actuel</strong><span>{Math.max(1, script.split("\n").length)} lignes · Luau</span></div>
                <button onClick={() => setCodeOpen(false)}>Fermer</button>
              </div>
              <textarea className="scriptInput" value={script} onChange={(e) => setScript(e.target.value)} spellCheck={false} />
            </div>
          )}

          <div className="composer">
            <button className="attach" onClick={() => setCodeOpen(!codeOpen)} title="Afficher le script">＋</button>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!busy) sendPrompt();
                }
              }}
              placeholder={codeOpen ? "Décris la modification à faire…" : "Message à Script AI…"}
              rows={1}
            />
            <button className="send" onClick={sendPrompt} disabled={busy || !prompt.trim()}>↑</button>
          </div>

          <div className="composerHint">Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne</div>
        </div>

        <footer className="chatFooter">
          <span>Script AI peut faire des erreurs. Vérifie toujours le code avant de l’utiliser.</span>
          <span>{messageCount} message{messageCount > 1 ? "s" : ""}</span>
        </footer>

        {notice && <div className="toast">{notice}</div>}
      </section>

      <button className="deleteAccount" onClick={deleteAccount}>Supprimer le compte local</button>
    </main>
  );
}
