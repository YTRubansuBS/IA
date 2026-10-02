"use client";

import { useEffect, useState } from "react";

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

type GameResponse = {
  title: string;
  scene: string;
  actions: Action[];
  state: GameState;
  gameOver: boolean;
  deathReason?: string;
};

const INITIAL_STATE: GameState = {
  health: 100,
  sanity: 100,
  hunger: 100,
  thirst: 100,
  floor: 0,
  turn: 0,
  inventory: ["Téléphone (12%)"],
};

const STORAGE_KEY = "backrooms-survival-save";

export default function Home() {
  const [game, setGame] = useState<GameResponse | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as {
        game?: GameResponse;
        history?: string[];
      };
      if (parsed.game) {
        setGame(parsed.game);
        setHistory(Array.isArray(parsed.history) ? parsed.history : []);
      }
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!game) return;

    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        game,
        history: history.slice(-8),
      }),
    );
  }, [game, history]);

  async function callGame(action: string | null) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          state: game?.state ?? INITIAL_STATE,
          history: [...history, game ? game.scene : ""].filter(Boolean).slice(-8),
        }),
      });

      const data = (await response.json()) as GameResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Le jeu n’a pas répondu.");
      }

      setGame({
        ...data,
        state: {
          ...INITIAL_STATE,
          ...data.state,
          inventory: Array.isArray(data.state?.inventory)
            ? data.state.inventory
            : [],
        },
      });

      if (action && game) {
        setHistory((current) =>
          [...current, "ACTION: " + action, "SCÈNE: " + data.scene].slice(-8),
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger la prochaine scène.",
      );
    } finally {
      setLoading(false);
    }
  }

  function newGame() {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setGame(null);
    setHistory([]);
    setError("");
    void callGame(null);
  }

  useEffect(() => {
    if (!game && !loading) {
      void callGame(null);
    }
  }, [game, loading]);

  const state = game?.state ?? INITIAL_STATE;

  return (
    <div className="gameApp">
      <header className="gameHeader">
        <div className="brandBlock">
          <div className="brandMark">B</div>
          <div>
            <div className="gameTitle">BACKROOMS</div>
            <div className="gameSubtitle">SURVIVAL // EXPÉRIENCE NARRATIVE</div>
          </div>
        </div>

        <button className="restartButton" type="button" onClick={newGame}>
          Nouvelle partie
        </button>
      </header>

      <main className="gameShell">
        <section className="statusGrid" aria-label="Statistiques">
          <Stat label="SANTÉ" value={state.health} />
          <Stat label="LUCIDITÉ" value={state.sanity} />
          <Stat label="FAIM" value={state.hunger} />
          <Stat label="SOIF" value={state.thirst} />
          <div className="statCard">
            <span>ZONE</span>
            <strong>{state.floor === 0 ? "LEVEL 0" : "LEVEL " + state.floor}</strong>
          </div>
          <div className="statCard">
            <span>TOUR</span>
            <strong>#{state.turn}</strong>
          </div>
        </section>

        {!game ? (
          <section className="startScreen">
            <div className="warningLight" />
            <div className="startLabel">SIGNAL INCONNU</div>
            <h1>Tu viens de tomber au mauvais endroit.</h1>
            <p>
              Les murs sont jaunes. Les néons vibrent. Tu ne reconnais aucune
              porte, aucun repère, aucune sortie. Chaque décision peut ouvrir
              un nouveau chemin… ou t’enfoncer encore plus loin.
            </p>
            <button
              className="primaryButton"
              type="button"
              onClick={() => void callGame(null)}
              disabled={loading}
            >
              {loading ? "Chargement…" : "Entrer dans les Backrooms"}
            </button>
            {error && <div className="errorBox">{error}</div>}
          </section>
        ) : (
          <section className="gameContent">
            <div className="levelLine">
              <span>{game.title}</span>
              <span className="liveDot">●</span>
              <span>EN DIRECT</span>
            </div>

            <article className="sceneCard">
              <div className="sceneText">
                {game.scene.split("

").map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>

              {game.gameOver ? (
                <div className="gameOverPanel">
                  <div className="gameOverTitle">TU N’ES PLUS EN ÉTAT DE CONTINUER</div>
                  <div className="gameOverText">
                    {game.deathReason ||
                      "Le niveau a finalement eu raison de toi."}
                  </div>
                  <button className="primaryButton" type="button" onClick={newGame}>
                    Recommencer
                  </button>
                </div>
              ) : (
                <div className="actionArea">
                  <div className="chooseLabel">QUE FAIS-TU ?</div>
                  <div className="actions">
                    {game.actions.map((action, index) => (
                      <button
                        className="actionButton"
                        type="button"
                        key={action.id}
                        disabled={loading}
                        onClick={() => void callGame(action.label)}
                      >
                        <span className="actionNumber">{index + 1}</span>
                        <span>
                          <strong>{action.label}</strong>
                          <small>{action.description}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                  {loading && (
                    <div className="loadingLine">
                      <span className="spinner" />
                      Le décor change…
                    </div>
                  )}
                </div>
              )}
            </article>

            <aside className="inventoryCard">
              <div className="inventoryHeading">SAC</div>
              <div className="inventoryList">
                {state.inventory.length === 0 ? (
                  <span className="emptyInventory">Rien pour l’instant.</span>
                ) : (
                  state.inventory.map((item) => (
                    <span className="itemPill" key={item}>
                      {item}
                    </span>
                  ))
                )}
              </div>
            </aside>

            {error && <div className="errorBox">{error}</div>}
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className="statCard">
      <div className="statTop">
        <span>{label}</span>
        <strong>{safeValue}</strong>
      </div>
      <div className="statTrack">
        <div className="statFill" style={{ width: safeValue + "%" }} />
      </div>
    </div>
  );
}
