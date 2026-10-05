import { NextResponse } from "next/server";

// The access secret is never sent to the browser or displayed in the UI.
// Only its SHA-256 digest is stored in source code.
const ACCESS_PASSWORD_HASH = "4e0e6833f5a6a9f6ddf81eff676e3a143a46880895c2e82748382a0b6a15ebb4";

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!password || (await sha256(password)) !== ACCESS_PASSWORD_HASH) {
    return NextResponse.json(
      { error: "Code d’accès incorrect." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: "script_ai_access",
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: "script_ai_access",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}