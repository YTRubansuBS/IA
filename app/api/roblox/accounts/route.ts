import { NextResponse } from "next/server";

const IDS = ["3671739729","4963417975"];
const BASE = "https://apis.roblox.com";

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
  const out: any[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const url = new URL(`https://games.roblox.com/v2/users/${userId}/games`);
    url.searchParams.set("accessFilter","Public"); url.searchParams.set("sortOrder","Asc"); url.searchParams.set("limit","50");
    if (cursor) url.searchParams.set("cursor", cursor);
    const d = await getJson(url.toString());
    out.push(...(d?.data || []));
    cursor = d?.nextPageCursor || "";
    if (!cursor) break;
  }
  const ids = out.map(x => x.id).filter(Boolean);
  let thumbs: Record<string,string> = {};
  for (let i=0;i<ids.length;i+=50) {
    try {
      const t=await getJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids.slice(i,i+50).join(",")}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`);
      for (const x of t?.data || []) thumbs[String(x.targetId)] = x.imageUrl || "";
    } catch {}
  }
  return out.map(g => ({
    id:g.id, placeId:g.rootPlace?.id || 0, name:g.name || "Sans nom", description:g.description || "",
    playing:g.playing || 0, visits:g.visits || 0, favorites:g.favoritedCount || 0,
    likes:g.likes || 0, dislikes:g.dislikes || 0, created:g.created || "", updated:g.updated || "",
    maxPlayers:g.maxPlayers || 0, avatar:thumbs[String(g.id)] || ""
  }));
}

function keyFor(id:string) {
  return process.env[`ROBLOX_API_KEY_${id}`] || process.env.ROBLOX_API_KEY || "";
}

export async function GET() {
  try {
    const accounts = await Promise.all(IDS.map(async id => {
      try {
        const user = await getUser(id);
        const games = await getGames(id);
        return { ...user, gameCount: games.length, games };
      } catch (e) {
        return { id, username:id, displayName:`User ${id}`, avatar:"", gameCount:0, games:[], error:e instanceof Error ? e.message : "Erreur Roblox" };
      }
    }));
    return NextResponse.json({ accounts });
  } catch (e) {
    return NextResponse.json({ error:e instanceof Error ? e.message : "Roblox indisponible" }, { status:502 });
  }
}
