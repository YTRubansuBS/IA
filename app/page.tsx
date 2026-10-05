"use client";

import { FormEvent, useMemo, useState } from "react";

const PASSWORD = "Weapons RNG";
const AUTH_HEADER = "x-workspace-password";

const starterCode = `local Players = game:GetService("Players")

Players.PlayerAdded:Connect(function(player)
    print("Bienvenue " .. player.Name)
end)
`;

export default function Home() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [script, setScript] = useState(starterCode);
  const [request, setRequest] = useState("");
  const [result, setResult] = useState("");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const lineCount = useMemo(() => Math.max(script.split("\n").length, 1), [script]);

  const login = (event: FormEvent) => {
    event.preventDefault();
    if (password === PASSWORD) {
      setUnlocked(true);
      setNotice("");
    } else {
      setNotice("Mot de passe incorrect.");
    }
  };

  const generate = async () => {
    if (!script.trim()) {
      setNotice("Colle d’abord un script.");
      return;
    }

    if (!request.trim()) {
      setNotice("Écris ce que tu veux modifier.");
      return;
    }

    setBusy(true);
    setNotice("");
    setResult("");
    setExplanation("");

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [AUTH_HEADER]: PASSWORD,
        },
        body: JSON.stringify({
          prompt: request,
          source: script,
          scriptName: "Script Luau",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur API");
      }

      setResult(data.code || "");
      setExplanation(data.explanation || "Modification générée par Gemini.");
      setNotice("Code modifié généré.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const useResult = () => {
    if (!result) return;
    setScript(result);
    setResult("");
    setExplanation("");
    setNotice("Le code modifié a remplacé l’ancien script.");
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setNotice("Code copié.");
  };

  const reset = () => {
    setScript("");
    setRequest("");
    setResult("");
    setExplanation("");
    setNotice("");
  };

  if (!unlocked) {
    return (
      <main className="login">
        <div className="loginCard">
          <div className="logo">✦</div>
          <div className="eyebrow">AI SCRIPT EDITOR</div>
          <h1>Script AI</h1>
          <p>Colle ton script, décris la modification et laisse Gemini te générer la nouvelle version.</p>
          <form onSubmit={login}>
            <label>
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mot de passe"
                autoFocus
              />
            </label>
            <button className="primary" type="submit">Entrer</button>
          </form>
          {notice && <div className="loginError">{notice}</div>}
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="header">
        <div className="brand">
          <div className="logo small">✦</div>
          <div>
            <strong>Script AI</strong>
            <span>Gemini · Luau</span>
          </div>
        </div>

        <div className="headerActions">
          <div className="status"><i /> IA prête</div>
          <button className="ghost" onClick={reset}>Nouveau script</button>
        </div>
      </header>

      <section className="workspace">
        <div className="column">
          <div className="columnHeader">
            <div>
              <span className="number">01</span>
              <div>
                <strong>Code actuel</strong>
                <small>{lineCount} lignes</small>
              </div>
            </div>
            <span className="lang">LUau</span>
          </div>
          <textarea
            className="codeEditor"
            value={script}
            onChange={(event) => setScript(event.target.value)}
            spellCheck={false}
            placeholder="Colle ici ton Script, LocalScript ou ModuleScript..."
          />
        </div>

        <div className="middle">
          <div className="arrow">→</div>
          <div className="requestCard">
            <div className="requestTitle">
              <span>02</span>
              <strong>Modification</strong>
            </div>
            <textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder={'Ex :\nAjoute un système de sprint avec Shift.\nGarde tout le reste du script.'}
              spellCheck
            />
            <button className="generate" onClick={generate} disabled={busy}>
              {busy ? "Gemini travaille..." : "✦ Modifier le script"}
            </button>
            <div className="examples">
              <button onClick={() => setRequest("Corrige les erreurs du script sans supprimer ses fonctionnalités.")}>
                Corriger les erreurs
              </button>
              <button onClick={() => setRequest("Optimise ce script et garde exactement le même comportement.")}>
                Optimiser
              </button>
              <button onClick={() => setRequest("Explique les problèmes du script puis propose une version corrigée.")}>
                Diagnostiquer
              </button>
            </div>
          </div>
        </div>

        <div className="column resultColumn">
          <div className="columnHeader">
            <div>
              <span className="number">03</span>
              <div>
                <strong>Code modifié</strong>
                <small>{result ? `${result.split("\n").length} lignes` : "En attente"}</small>
              </div>
            </div>
            <span className="aiBadge">GEMINI</span>
          </div>

          {result ? (
            <>
              <textarea
                className="codeEditor result"
                value={result}
                onChange={(event) => setResult(event.target.value)}
                spellCheck={false}
              />
              <div className="resultActions">
                <button className="apply" onClick={useResult}>✓ Utiliser ce code</button>
                <button className="ghost" onClick={copyResult}>Copier</button>
              </div>
              {explanation && <div className="explanation"><strong>Ce qui a changé</strong><p>{explanation}</p></div>}
            </>
          ) : (
            <div className="empty">
              <div className="emptyIcon">⌁</div>
              <strong>Aucune modification</strong>
              <p>Le nouveau script apparaîtra ici après ta demande.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="footer">
        <span>Ton code reste dans l’éditeur jusqu’à ce que tu décides de l’utiliser.</span>
        {notice && <span className="notice">{notice}</span>}
      </footer>
    </main>
  );
}
