import { NextResponse } from "next/server";

const IDS = ["3671739729","4963417975"];

async function getJson(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, cache: "no-store" });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.message || `Roblox HTTP ${r.status}`);
  return data;
}

async function getUser(id: string) {
  const u = await getJson(`https://users.roblox.com/v1/users/${id}`);
  let avatar = "";
  try {
    const t = await getJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`);
    avatar = t?.data?.[0]?.imageUrl || "";
  } catch {}
  return { id, username: u.name, displayName: u.displayName, avatar };
}

async function getGames(userId: string) {
  const listed: any[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const url = new URL(`https://games.roblox.com/v2/users/${userId}/games`);
    url.searchParams.set("accessFilter", "Public");
    url.searchParams.set("sortOrder", "Asc");
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("cursor", cursor);
    const d = await getJson(url.toString());
    listed.push(...(d?.data || []));
    cursor = d?.nextPageCursor || "";
    if (!cursor) break;
  }

  const ids = listed.map(x => Number(x.id)).filter(Number.isFinite);
  const details = new Map<number, any>();

  // /v1/games is the canonical public universe-details endpoint.
  // Keep /v2/users/{userId}/games only for discovering which universes belong to the account.
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const d = await getJson(`https://games.roblox.com/v1/games?universeIds=${batch.join(",")}`);
      for (const g of d?.data || []) details.set(Number(g.id), g);
    } catch {}
  }

  const votes = new Map<number, {upVotes:number;downVotes:number}>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const d = await getJson(`https://games.roblox.com/v1/games/votes?universeIds=${batch.join(",")}`);
      for (const v of d?.data || []) {
        votes.set(Number(v.id), {
          upVotes: Number(v.upVotes) || 0,
          downVotes: Number(v.downVotes) || 0
        });
      }
    } catch {}
  }

  let thumbs: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const t = await getJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids.slice(i, i + 50).join(",")}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`);
      for (const x of t?.data || []) thumbs[String(x.targetId)] = x.imageUrl || "";
    } catch {}
  }

  return ids.map(id => {
    const g = details.get(id) || listed.find(x => Number(x.id) === id) || {};
    const v = votes.get(id);
    return {
      id,
      placeId: Number(g.rootPlaceId || g.rootPlace?.id || listed.find(x => Number(x.id) === id)?.rootPlace?.id || 0),
      name: g.name || "Sans nom",
      description: g.description || "",
      playing: Number(g.playing) || 0,
      visits: Number(g.visits) || 0,
      favorites: Number(g.favoritedCount) || 0,
      likes: v?.upVotes ?? Number(g.likes) || 0,
      dislikes: v?.downVotes ?? Number(g.dislikes) || 0,
      created: g.created || "",
      updated: g.updated || "",
      maxPlayers: Number(g.maxPlayers) || 0,
      avatar: thumbs[String(id)] || ""
    };
  });
}

export async function GET() {
  try {
    const accounts = await Promise.all(IDS.map(async id => {
      try {
        const user = await getUser(id);
        const games = await getGames(id);
        return { ...user, gameCount: games.length, games };
      } catch (e) {
        return {
          id,
          username: id,
          displayName: `User ${id}`,
          avatar: "",
          gameCount: 0,
          games: [],
          error: e instanceof Error ? e.message : "Erreur Roblox"
        };
      }
    }));
    return NextResponse.json({ accounts });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Roblox indisponible" },
      { status: 502 }
    );
  }
}
