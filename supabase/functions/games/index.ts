import {
  execute,
  GameError,
  hashToken,
  type Room,
  type Store,
  type Command,
} from "../../../lib/game-service.ts";

const base = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};
async function db(path: string, options: RequestInit = {}) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!res.ok) {
    console.error("Database request failed", res.status, path.split("?")[0]);
    throw new GameError("O servidor está ocupado. Tente novamente.", 503);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const store: Store = {
  async get(code) {
    return (await db(`game_rooms?code=eq.${code}&select=*`))[0] || null;
  },
  async insert(room) {
    const res = await fetch(`${base}/rest/v1/game_rooms`, {
      method: "POST",
      headers,
      body: JSON.stringify(room),
    });
    if (res.status === 409) return false;
    if (!res.ok) throw new GameError("Não foi possível salvar a sala.", 503);
    return true;
  },
  async update(room: Room, expected) {
    const { white_seen, black_seen, ...data } = room;
    // Presence is updated independently: do not overwrite a concurrent heartbeat.
    void white_seen;
    void black_seen;
    const rows = await db(
      `game_rooms?code=eq.${room.code}&version=eq.${expected}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(data),
      },
    );
    return rows.length === 1;
  },
  async touch(code, side, now) {
    await db(`game_rooms?code=eq.${code}`, {
      method: "PATCH",
      body: JSON.stringify({
        [side === "white" ? "white_seen" : "black_seen"]: now,
      }),
    });
  },
};
Deno.serve(async (req) => {
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  if (req.method !== "POST")
    return json({ error: "Método não permitido." }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 4096)
      return json({ error: "Solicitação muito grande." }, 413);
    const command = JSON.parse(raw) as Command;
    if (
      !command ||
      typeof command !== "object" ||
      typeof command.action !== "string"
    )
      throw new GameError("Solicitação inválida.");
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipHash = await hashToken(ip);
    const creating = command.action === "create";
    const allowed = await db("rpc/game_allow_request", {
      method: "POST",
      body: JSON.stringify({
        p_bucket: `${creating ? "create" : "all"}:${ipHash}`,
        p_limit: creating ? 40 : 1500,
        p_seconds: creating ? 3600 : 60,
      }),
    });
    if (!allowed)
      return json(
        { error: "Muitas solicitações. Aguarde um pouco e tente novamente." },
        429,
      );
    const room = await execute(store, command);
    return json({ room });
  } catch (error) {
    if (error instanceof SyntaxError)
      return json({ error: "Solicitação inválida." }, 400);
    if (error instanceof GameError)
      return json({ error: error.message }, error.status);
    console.error(
      "Game request failed",
      error instanceof Error ? error.message : "unknown",
    );
    return json(
      { error: "Não foi possível concluir a jogada. Tente novamente." },
      500,
    );
  }
});
