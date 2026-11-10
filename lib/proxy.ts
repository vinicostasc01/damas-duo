import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function proxyGame(request: Request, roomCode?: string) {
  const fail = (error: string, status: number) =>
    NextResponse.json(
      { error },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  const endpoint = process.env.GAME_API_URL;
  if (!endpoint)
    return fail("O serviço de partidas ainda não foi configurado.", 503);
  const code = roomCode?.toUpperCase();
  if (code && !/^[A-HJ-NP-Z2-9]{8}$/.test(code))
    return fail("Código de sala inválido.", 400);
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    // Next may expose 0.0.0.0 internally; Host is the browser-facing authority.
    if (origin) {
      try {
        const parsed = new URL(origin);
        if (
          !["http:", "https:"].includes(parsed.protocol) ||
          parsed.host !== request.headers.get("host")
        )
          return fail("Origem não permitida.", 403);
      } catch {
        return fail("Origem não permitida.", 403);
      }
    }
  }
  try {
    const jar = await cookies();
    let body: Record<string, unknown> = { action: "read" };
    if (request.method === "POST") {
      const raw = await request.text();
      if (raw.length > 2048) return fail("Solicitação muito grande.", 413);
      body = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body))
        return fail("Solicitação inválida.", 400);
    }
    const action = roomCode ? body.action : "create";
    if (typeof action !== "string") return fail("Ação inválida.", 400);
    if (roomCode && action === "create") return fail("Ação inválida.", 400);
    let token = code ? jar.get(`damas_${code}`)?.value : undefined;
    if (!token && (action === "create" || action === "join"))
      token = randomBytes(32).toString("hex");
    if (!token) return fail("Entre na sala para acompanhar a partida.", 401);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, code, token, payload: body }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const data = await response.json();
    const result = NextResponse.json(data, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
    if (response.ok && data.room && (action === "create" || action === "join"))
      result.cookies.set(`damas_${data.room.code}`, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    return result;
  } catch (error) {
    if (error instanceof SyntaxError) return fail("Solicitação inválida.", 400);
    return fail(
      "Não conseguimos conectar ao jogo. Confira sua conexão e tente novamente.",
      503,
    );
  }
}
