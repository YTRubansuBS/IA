"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const WORKSPACE_PASSWORD = "Weapons RNG";
const ACCOUNTS_KEY = "script-ai-accounts-v3";
const SESSION_KEY = "script-ai-session-v3";
const DRAFT_KEY = "script-ai-draft-v3:";
const HISTORY_KEY = "script-ai-history-v3:";

type Account = { username: string; passwordHash: string; createdAt: number };
type HistoryItem = { id: string; request: string; code: string; explanation: string; time: number };

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
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function accounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function historyOf(user: string): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY + user);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "create">("login");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [authError, setAuthError] = useState("");
  const [accountTotal, setAccountTotal] = useState(0);

  const [currentUser, setCurrentUser] = useState("");
  const [script, setScript] = useState(starter);
  const [request, setRequest] = useState("");
  const [result, setResult] = useState("");
  const [explanation, setExplanation] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const list = accounts();
    const session = localStorage.getItem(SESSION_KEY) || "";
    setAccountTotal(list.length);

    if (session && list.some((a) => a.username === session)) {
      setCurrentUser(session);
      setHistory(historyOf(session));

      try {
        const raw = localStorage.getItem(DRAFT_KEY + session);
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft.script) setScript(draft.script);
          if (draft.request) setRequest(draft.request);
        }
      } catch {}
    }

    setReady(true);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(DRAFT_KEY + currentUser, JSON.stringify({ script, request }));
  }, [currentUser, script, request]);

  const lines = useMemo(() => Math.max(1, script.split("\n").length), [script]);
  const resultLines = useMemo(() => (result ? Math.max(1, result.split("\n").length) : 0), [result]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");

    const found = accounts().find((a) => a.username.toLowerCase() === user.trim().toLowerCase());
    if (!found) return setAuthError("Ce compte n'existe pas sur cet appareil.");

    if ((await hash(pass)) !== found.passwordHash) {
      return setAuthError("Mot de passe incorrect.");
    }

    localStorage.setItem(SESSION_KEY, found.username);
    setCurrentUser(found.username);
    setHistory(historyOf(found.username));

    try {
      const raw = localStorage.getItem(DRAFT_KEY + found.username);
      const draft = raw ? JSON.parse(raw) : null;
      setScript(draft?.script || starter);
      setRequest(draft?.request || "");
    } catch {
      setScript(starter);
      setRequest("");
    }

    setPass("");
  };

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");

    const name = user.trim();
    if (name.length < 3) return setAuthError("Le pseudo doit avoir au moins 3 caractères.");
    if (pass.length < 4) return setAuthError("Le mot de passe doit avoir au moins 4 caractères.");
    if (pass !== pass2) return setAuthError("Les mots de passe ne correspondent pas.");

    const list = accounts();
    if (list.some((a) => a.username.toLowerCase() === name.toLowerCase())) {
      return setAuthError("Ce pseudo existe déjà sur cet appareil.");
    }

    const next = list.concat({
      username: name,
      passwordHash: await hash(pass),
      createdAt: Date.now(),
    });

    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
    localStorage.setItem(SESSION_KEY, name);
    setAccountTotal(next.length);
    setCurrentUser(name);
    setHistory([]);
    setScript(starter);
    setRequest("");
    setResult("");
    setExplanation("");
    setPass("");
    setPass2("");
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser("");
    setResult("");
    setExplanation("");
  };

  const deleteAccount = () => {
    if (!currentUser) return;
    const next = accounts().filter((a) => a.username !== currentUser);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(DRAFT_KEY + currentUser);
    localStorage.removeItem(HISTORY_KEY + currentUser);
    setAccountTotal(next.length);
    setCurrentUser("");
    setHistory([]);
    setResult("");
    setExplanation("");
  };

  const generate = async () => {
    if (!script.trim()) return flash("Colle un script.");
    if (!request.trim()) return flash("Décris la modification.");

    setBusy(true);
    setNotice("");

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-password": WORKSPACE_PASSWORD,
        },
        body: JSON.stringify({
          prompt: request,
          source: script,
          scriptName: "Script Luau",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error([data.error, data.detail].filter(Boolean).join(" — ") || "Erreur Gemini");
      }

      const code = typeof data.code === "string" ? data.code : "";
      const summary = typeof data.explanation === "string" ? data.explanation : "Modification générée.";

      setResult(code);
      setExplanation(summary);
      flash("Gemini a terminé.");

      if (currentUser && code) {
        const item: HistoryItem = {
          id: crypto.randomUUID(),
          request,
          code,
          explanation: summary,
          time: Date.now(),
        };
        const next = [item].concat(history).slice(0, 15);
        setHistory(next);
        localStorage.setItem(HISTORY_KEY + currentUser, JSON.stringify(next));
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : "Erreur inconnue.");
    } finally {
      setBusy(false);
    }
  };

  const useResult = () => {
    if (!result) return;
    setScript(result);
    setResult("");
    setExplanation("");
    flash("Code appliqué à l'éditeur.");
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    flash("Code copié.");
  };

  const restore = (item: HistoryItem) => {
    setResult(item.code);
    setExplanation(item.explanation);
    setRequest(item.request);
    flash("Génération restaurée.");
  };

  if (!ready) return <main className="boot"><div>✦</div></main>;

  if (!currentUser) {
    return (
      <main className="authScreen">
        <div className="glow one" /><div className="glow two" />
        <section className="authGrid">
          <div className="intro">
            <div className="brandIcon">✦</div>
            <div className="eyebrow">SCRIPT AI / LUau WORKSPACE</div>
            <h1>Écris moins.<br /><span>Construis plus.</span></h1>
            <p>
              Colle ton script, explique la modification en français naturel,
              puis laisse Gemini produire la version complète.
            </p>
            <div className="features">
              <div><b>01</b><strong>Comprend le code</strong><small>Analyse le script avant de le modifier.</small></div>
              <div><b>02</b><strong>Modifie précisément</strong><small>Garde les fonctionnalités non concernées.</small></div>
              <div><b>03</b><strong>Compte local</strong><small>Compte, brouillons et historique restent sur ton appareil.</small></div>
            </div>
          </div>

          <section className="authCard">
            <div className="tabs">
              <button className={authMode === "login" ? "tab active" : "tab"} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Connexion</button>
              <button className={authMode === "create" ? "tab active" : "tab"} onClick={() => { setAuthMode("create"); setAuthError(""); }}>Créer un compte</button>
            </div>
            <div className="authTitle">
              <span>{authMode === "login" ? "BIENVENUE" : "NOUVEAU COMPTE"}</span>
              <h2>{authMode === "login" ? "Continue ton projet." : "Crée ton profil local."}</h2>
              <p>Les comptes sont sauvegardés dans le stockage local de ce navigateur.</p>
            </div>
            <form onSubmit={authMode === "login" ? login : createAccount} className="authForm">
              <label>Pseudo<input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Ex. Ruben" autoComplete="username" autoFocus /></label>
              <label>Mot de passe<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" autoComplete={authMode === "login" ? "current-password" : "new-password"} /></label>
              {authMode === "create" && <label>Confirmation<input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="••••••••" autoComplete="new-password" /></label>}
              <button className="authSubmit" type="submit">{authMode === "login" ? "Ouvrir mon espace →" : "Créer mon compte →"}</button>
            </form>
            {authError && <div className="authError">⚠ {authError}</div>}
            <div className="localInfo"><span>●</span>{accountTotal} compte{accountTotal > 1 ? "s" : ""} local{accountTotal > 1 ? "aux" : ""} sur cet appareil</div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logoSmall">✦</div>
          <div><strong>Script AI</strong><span>LUau development workspace</span></div>
        </div>
        <div className="ready"><i /> Gemini prêt</div>
        <div className="profile">
          <div className="avatar">{currentUser[0]?.toUpperCase()}</div>
          <div><strong>{currentUser}</strong><span>compte local</span></div>
          <button onClick={logout}>Quitter</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">AI CODE WORKSHOP</span>
          <h1>Modifie ton script avec Gemini.</h1>
          <p>Colle · Décris · Génère · Choisis</p>
        </div>
        <button onClick={() => { setScript(starter); setRequest(""); setResult(""); setExplanation(""); flash("Nouveau brouillon."); }}>＋ Nouveau script</button>
      </section>

      <section className="workspace">
        <section className="panel">
          <div className="panelHead">
            <div><span>01</span><div><strong>Code actuel</strong><small>{lines} lignes · Luau</small></div></div>
            <em>SOURCE</em>
          </div>
          <textarea className="code" value={script} onChange={(e) => setScript(e.target.value)} spellCheck={false} placeholder="Colle ici ton Script, LocalScript ou ModuleScript..." />
        </section>

        <section className="center">
          <div className="connector"><span /> GEMINI <span /></div>
          <section className="panel prompt">
            <div className="panelHead compact"><div><span>02</span><div><strong>Ta demande</strong><small>Explique ce que l’IA doit faire.</small></div></div></div>
            <textarea className="promptBox" value={request} onChange={(e) => setRequest(e.target.value)} placeholder={"Ex :\nAjoute un système de sprint avec Shift.\nNe change rien d’autre."} />
            <button className="generate" onClick={generate} disabled={busy}>{busy ? "Gemini travaille…" : "✦ Générer la modification"}</button>
            <div className="quick"><button onClick={() => setRequest("Corrige les erreurs sans supprimer les fonctionnalités.")}>Réparer</button><button onClick={() => setRequest("Optimise ce script sans changer son comportement.")}>Optimiser</button><button onClick={() => setRequest("Analyse ce script et propose une version corrigée.")}>Diagnostiquer</button></div>
          </section>

          <section className="panel history">
            <div className="historyHead"><strong>Historique local</strong><span>{history.length}/15</span></div>
            {history.length === 0 ? <div className="historyEmpty">Tes dernières générations apparaîtront ici.</div> :
              history.slice(0, 5).map((item) => (
                <button className="historyItem" key={item.id} onClick={() => restore(item)}>
                  <span>{new Date(item.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                  <strong>{item.request.slice(0, 56)}{item.request.length > 56 ? "…" : ""}</strong>
                </button>
              ))}
          </section>
        </section>

        <section className="panel resultPanel">
          <div className="panelHead">
            <div><span className="green">03</span><div><strong>Code modifié</strong><small>{result ? resultLines + " lignes · prêt" : "En attente de Gemini"}</small></div></div>
            <em className="gemini">GEMINI</em>
          </div>
          {result ? <>
            <textarea className="code resultCode" value={result} onChange={(e) => setResult(e.target.value)} spellCheck={false} />
            <div className="resultActions"><button className="use" onClick={useResult}>✓ Utiliser ce code</button><button className="copy" onClick={copy}>Copier</button></div>
            {explanation && <div className="explanation"><span>RÉSUMÉ</span><p>{explanation}</p></div>}
          </> : <div className="empty"><div>⌁</div><strong>Ton résultat apparaîtra ici.</strong><p>Gemini modifiera le script complet à partir de ta demande.</p></div>}
        </section>
      </section>

      <footer className="footer">
        <span>Brouillons et comptes enregistrés localement</span>
        <span>{notice || "Prêt"}</span>
        <button onClick={deleteAccount}>Supprimer le compte</button>
      </footer>
    </main>
  );
}
