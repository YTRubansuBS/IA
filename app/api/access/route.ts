import { NextResponse } from "next/server";

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "Fourchette";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (password !== ACCESS_PASSWORD) {
    return NextResponse.json(
      { error: "Code d'accès incorrect." },
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
