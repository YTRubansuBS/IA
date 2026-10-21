"use client";

import { useEffect, useMemo, useState } from "react";

type Account = {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  gameCount: number;
  games: Game[];
  error?: string;
};

type Game = {
  id: number;
  placeId: number;
  name: string;
  description: string;
  playing: number;
  visits: number;
  favorites: number;
  likes: number;
  dislikes: number;
  created: string;
  updated: string;
  maxPlayers: number;
  avatar: string;
  stats?: Stats;
  diagnostics?: {
    universeId: string;
    days: number;
    partialErrors: string[];
    apiKeyConfigured: boolean;
  };
};

type Series = { time: string; value: number };
type Breakdown = { label: string; value: number };
type Stats = {
  dau: Series[];
  mau: number | null;
  playtimeHours: Series[];
  avgPlaytime: Series[];
  avgSession: Series[];
  sessions: Series[];
  revenue: Series[];
  d1: Series[];
  d7: Series[];
  payingUsers: Series[];
  payerCVR: Series[];
  acquisition: {
    source: string;
    impressions: number;
    clicks: number;
    plays: number;
    impressionCTR: number | null;
    playRate: number | null;
  }[];
  platforms: Breakdown[];
  countries: Breakdown[];
  ages: Breakdown[];
  newReturning: Breakdown[];
  rfy: {
    ptr: number | null;
    bounce0to60: number | null;
    bounce61to180: number | null;
    d1Playtime: number | null;
    d2to7Playtime: number | null;
    d8to28Playtime: number | null;
    d1PlayDays: number | null;
    d2to7PlayDays: number | null;
    d8to28PlayDays: number | null;
    d1Coplay: number | null;
    d2to7Coplay: number | null;
    d8to28Coplay: number | null;
    d1Qualified: number | null;
    d2to7Qualified: number | null;
    d8to28Qualified: number | null;
    d1Robux: number | null;
    d2to7Robux: number | null;
    d8to28Robux: number | null;
  };
};

const ACCOUNTS = ["3671739729", "4963417975"];
const fmt = new Intl.NumberFormat("fr-FR");
const pct = (v: number | null) => v == null ? "—" : `${(v * 100).toFixed(1)}%`;
const num = (v: number | null | undefined) => v == null ? "—" : fmt.format(Math.round(v));
const last = (s?: Series[]) => s?.length ? s[s.length - 1].value : null;
const sum = (s?: Series[]) => s?.reduce((a, x) => a + x.value, 0) ?? 0;

function Chart({ series, percent = false }: { series: Series[]; percent?: boolean }) {
  if (!series?.length) return <div className="emptyChart">Pas encore de données</div>;
  const max = Math.max(...series.map(x => x.value), 1);
  const min = Math.min(...series.map(x => x.value), 0);
  const range = Math.max(max - min, 1);
  const points = series.map((p, i) => {
    const x = series.length === 1 ? 50 : (i / (series.length - 1)) * 100;
    const y = 94 - ((p.value - min) / range) * 78;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="chartWrap">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="0" y1="94" x2="100" y2="94" className="gridLine" />
        <polyline points={points} fill="none" className="chartLine" />
      </svg>
      <div className="chartLabels"><span>{new Date(series[0].time).toLocaleDateString("fr-FR")}</span><span>{percent ? pct(last(series)) : num(last(series))}</span><span>{new Date(series[series.length - 1].time).toLocaleDateString("fr-FR")}</span></div>
    </div>
  );
}

function Bars({ data, percent = false }: { data: Breakdown[]; percent?: boolean }) {
  if (!data?.length) return <div className="emptyChart">Pas encore de données</div>;
  const max = Math.max(...data.map(x => x.value), 1);
  return <div className="bars">{data.slice(0, 12).map(x => (
    <div className="barRow" key={x.label}><div className="barLabel"><span>{x.label}</span><b>{percent ? pct(x.value) : num(x.value)}</b></div><div className="barTrack"><i style={{ width: `${Math.max(2, (x.value / max) * 100)}%` }} /></div></div>
  ))}</div>;
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameLoading, setGameLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const loadAccounts = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/roblox/accounts", { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Impossible de charger Roblox.");
      setAccounts(data.accounts || []);
      setSelectedId(data.accounts?.[0]?.id || ACCOUNTS[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally { setLoading(false); }
  };

  const loadGame = async (game: Game) => {
    setSelectedGame(game); setGameLoading(true);
    try {
      const r = await fetch(`/api/roblox/game/${game.id}?days=${days}`, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Impossible de charger les analytics.");
      setSelectedGame({ ...game, stats: data.stats, diagnostics: data.diagnostics });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur analytics.");
    } finally { setGameLoading(false); }
  };

  useEffect(() => { loadAccounts(); }, []);
  useEffect(() => {
    if (selectedGame) {
      const base = selectedGame;
      void loadGame(base);
    }
  }, [days]);

  const account = accounts.find(a => a.id === selectedId) || null;
  const games = useMemo(() => (account?.games || []).filter(g => g.name.toLowerCase().includes(search.toLowerCase())), [account, search]);
  const allGames = accounts.flatMap(a => a.games);
  const totalVisits = account ? account.games.reduce((a, g) => a + g.visits, 0) : 0;
  const totalPlaying = account ? account.games.reduce((a, g) => a + g.playing, 0) : 0;

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand"><div className="brandMark">R</div><div><strong>ROBLOX ANALYTICS</strong><span>Creator dashboard</span></div></div>
        <div className="topActions"><button onClick={loadAccounts}>↻ Actualiser</button><span className="live"><i /> Données Roblox</span></div>
      </header>

      <div className="layout">
        <aside className="accounts">
          <div className="sideTitle">COMPTES ROBLOX</div>
          <p className="sideHint">Les comptes suivis sont fixes.</p>
          {ACCOUNTS.map(id => {
            const a = accounts.find(x => x.id === id);
            return <button className={selectedId === id ? "account active" : "account"} key={id} onClick={() => { setSelectedId(id); setSelectedGame(null); }}>
              {a?.avatar ? <img src={a.avatar} /> : <div className="avatarPlaceholder">R</div>}
              <div><strong>{a?.displayName || a?.username || `User ${id}`}</strong><span>@{a?.username || id}</span><small>ID {id}</small></div>
            </button>;
          })}
          <div className="sideBottom"><span>Jeux trouvés</span><b>{account?.gameCount ?? "—"}</b></div>
        </aside>

        <section className="content">
          {error && <div className="errorBanner">⚠ {error}<button onClick={() => setError("")}>×</button></div>}
          {loading ? <div className="loading"><div className="spinner" />Chargement des comptes et des jeux Roblox…</div> : !account ? <div className="loading">Aucun compte chargé.</div> : (
            <>
              <div className="hero">
                <div><span className="eyebrow">COMPTE SÉLECTIONNÉ</span><h1>{account.displayName}</h1><p>@{account.username} · User ID {account.id}</p></div>
                <div className="heroNumbers"><div><b>{num(account.gameCount)}</b><span>expériences</span></div><div><b>{num(totalPlaying)}</b><span>joueurs maintenant</span></div><div><b>{num(totalVisits)}</b><span>visites cumulées</span></div></div>
              </div>

              <div className="toolbar"><div className="search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un jeu…" /></div><div className="range">{[7,30,90,365].map(d => <button className={days === d ? "active" : ""} key={d} onClick={() => setDays(d)}>{d === 365 ? "1 an" : `${d}j`}</button>)}</div></div>

              <div className="gameGrid">
                {games.map(g => <button className={selectedGame?.id === g.id ? "gameCard selected" : "gameCard"} key={g.id} onClick={() => loadGame(g)}>
                  {g.avatar ? <img src={g.avatar} /> : <div className="gameImg" />}
                  <div className="gameInfo"><strong>{g.name}</strong><span>{num(g.playing)} joueurs · {num(g.visits)} visites</span><small>Mis à jour {new Date(g.updated).toLocaleDateString("fr-FR")}</small></div>
                </button>)}
              </div>

              {selectedGame && (
                <section className="dashboard">
                  <div className="dashHead"><div><span className="eyebrow">ANALYTICS</span><h2>{selectedGame.name}</h2><p>Universe ID {selectedGame.id} · Place ID {selectedGame.placeId}</p></div><a href={`https://www.roblox.com/games/${selectedGame.placeId}`} target="_blank" rel="noreferrer">Ouvrir sur Roblox ↗</a></div>
                  {gameLoading && <div className="thinLoading"><div className="spinner small" /> Récupération des métriques…</div>}
                  {!selectedGame.stats ? <div className="apiNotice"><b>Analytics non disponibles.</b><span>La requête Roblox a échoué : regarde le message d'erreur affiché en haut. La clé doit avoir <code>universe.analytics:read</code> et être disponible en Production sur Vercel.</span></div> : (
                    <>
                      {selectedGame.diagnostics?.partialErrors?.length ? (
                        <div className="apiNotice warning">
                          <b>Certaines métriques Roblox ne sont pas disponibles.</b>
                          <span>{selectedGame.diagnostics.partialErrors.slice(0, 4).join(" · ")}</span>
                        </div>
                      ) : null}
                      <div className="metrics">
                        <MetricCard label="DAU" value={num(last(selectedGame.stats.dau))} sub="dernier jour" />
                        <MetricCard label="Temps de jeu" value={`${(last(selectedGame.stats.playtimeHours) ?? 0).toFixed(1)} h`} sub="dernier jour" />
                        <MetricCard label="Session moyenne" value={`${(last(selectedGame.stats.avgSession) ?? 0).toFixed(1)} min`} sub="dernier jour" />
                        <MetricCard label="Rétention D1" value={pct(last(selectedGame.stats.d1))} sub="dernier jour" />
                        <MetricCard label="Rétention D7" value={pct(last(selectedGame.stats.d7))} sub="dernier jour" />
                        <MetricCard label="Revenu" value={`${num(last(selectedGame.stats.revenue))} R$`} sub="dernier jour" />
                      </div>

                      <div className="sectionGrid">
                        <article className="panel wide"><div className="panelHead"><div><h3>Utilisateurs actifs</h3><span>DAU sur la période</span></div></div><Chart series={selectedGame.stats.dau} /></article>
                        <article className="panel"><div className="panelHead"><div><h3>Temps de jeu</h3><span>Total en heures</span></div></div><Chart series={selectedGame.stats.playtimeHours} /></article>
                        <article className="panel"><div className="panelHead"><div><h3>Sessions</h3><span>Nombre de visites</span></div></div><Chart series={selectedGame.stats.sessions} /></article>
                        <article className="panel"><div className="panelHead"><div><h3>Rétention</h3><span>D1 / D7</span></div></div><Chart series={selectedGame.stats.d1} percent /></article>
                        <article className="panel"><div className="panelHead"><div><h3>Revenu</h3><span>Robux</span></div></div><Chart series={selectedGame.stats.revenue} /></article>
                      </div>

                      <div className="sectionGrid">
                        <article className="panel"><div className="panelHead"><div><h3>Plateformes</h3><span>DAU par appareil</span></div></div><Bars data={selectedGame.stats.platforms} /></article>
                        <article className="panel"><div className="panelHead"><div><h3>Pays</h3><span>DAU par pays</span></div></div><Bars data={selectedGame.stats.countries} /></article>
                        <article className="panel"><div className="panelHead"><div><h3>Âges</h3><span>DAU par groupe d'âge</span></div></div><Bars data={selectedGame.stats.ages} /></article>
                        <article className="panel"><div className="panelHead"><div><h3>Nouveaux / retour</h3><span>DAU</span></div></div><Bars data={selectedGame.stats.newReturning} /></article>
                      </div>

                      <article className="panel acquisition"><div className="panelHead"><div><h3>Acquisition & découverte</h3><span>Impressions, clics, jeux et conversion par source</span></div></div>
                        <div className="table"><div className="tr th"><span>Source</span><span>Impressions</span><span>Clics</span><span>Jeux</span><span>CTR</span><span>Play rate</span></div>
                        {selectedGame.stats.acquisition.map(a => <div className="tr" key={a.source}><span>{a.source}</span><span>{num(a.impressions)}</span><span>{num(a.clicks)}</span><span>{num(a.plays)}</span><span>{pct(a.impressionCTR)}</span><span>{pct(a.playRate)}</span></div>)}</div>
                      </article>

                      <article className="panel"><div className="panelHead"><div><h3>Signaux Recommended For You</h3><span>Les signaux de découverte Home exposés par Roblox</span></div></div>
                        <div className="signalGrid">
                          {Object.entries(selectedGame.stats.rfy).map(([k,v]) => <div className="signal" key={k}><span>{k.replace(/([A-Z])/g," $1")}</span><b>{typeof v === "number" ? (k.toLowerCase().includes("ptr") || k.toLowerCase().includes("bounce") ? pct(v) : v.toFixed(2)) : "—"}</b></div>)}
                        </div>
                      </article>
                    )}
                  {selectedGame.stats && selectedGame.diagnostics?.partialErrors?.length ? (
                    <div className="apiNotice warning">
                      <b>Diagnostic</b>
                      <span>{selectedGame.diagnostics.partialErrors.length} métrique(s) Roblox ont été ignorée(s) pour éviter de bloquer tout le tableau de bord.</span>
                    </div>
                  ) : null}
                </section>
              )}

              {!games.length && <div className="empty">Aucun jeu ne correspond à ta recherche.</div>}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
